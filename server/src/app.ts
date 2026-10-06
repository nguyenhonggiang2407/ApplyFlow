import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { parse, serialize } from 'cookie';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { Store } from './database.js';
import { digest, hashPassword, token, verifyPassword } from './auth.js';
import { APPLICATION_SELECT, activity, insertApplication, seedDemo } from './demo.js';
import {
  applicationSchema,
  updateApplicationSchema,
  registerSchema,
  loginSchema,
  taskSchema,
  taskUpdateSchema,
} from './validation.js';
import {
  STATUS_LABELS,
  STATUSES,
  type User,
  type Application,
  type Task,
  type Activity,
} from '../../shared/types.js';

interface SessionRow {
  token_hash: string;
  user_id: number | null;
  csrf_token: string;
  expires_at: number;
}
interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  is_demo: number;
}
declare global {
  namespace Express {
    interface Request {
      authSession?: SessionRow;
      authUser?: User;
    }
  }
}
export interface AppOptions {
  store: Store;
  origin: string;
  production?: boolean;
  secureCookies?: boolean;
  demo?: boolean;
  trustProxy?: boolean;
  serveClient?: boolean;
  rateLimits?: boolean;
}
const userView = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  isDemo: !!row.is_demo,
});
const cookieName = 'applyflow_session';
const sevenDays = 7 * 24 * 60 * 60 * 1000;
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, 'Không tìm thấy mục này.');
  return id;
};

export function createApp(options: AppOptions) {
  const { store } = options;
  const secureCookies = options.secureCookies ?? !!options.production;
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: options.production
        ? {
            directives: { 'upgrade-insecure-requests': secureCookies ? [] : null },
          }
        : false,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  if (options.rateLimits !== false)
    app.use(
      '/api',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 1200,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Bạn đang gửi yêu cầu quá nhanh. Hãy thử lại sau ít phút.' },
      }),
    );
  app.get('/api/health', (_req, res) => {
    store.one('SELECT 1');
    res.json({ status: 'ok' });
  });
  app.use('/api', (req, _res, next) => {
    let raw: string | undefined;
    try {
      raw = parse(req.headers.cookie ?? '')[cookieName];
    } catch {
      raw = undefined;
    }
    if (raw && /^[a-f0-9]{64}$/.test(raw)) {
      const session = store.one<SessionRow>(
        'SELECT * FROM sessions WHERE token_hash=? AND expires_at>?',
        digest(raw),
        Date.now(),
      );
      if (session) {
        req.authSession = session;
        if (session.user_id) {
          const user = store.one<UserRow>('SELECT * FROM users WHERE id=?', session.user_id);
          if (user) req.authUser = userView(user);
        }
      }
    }
    next();
  });
  function setSession(req: Request, res: Response, userId: number | null) {
    if (req.authSession)
      store.run('DELETE FROM sessions WHERE token_hash=?', req.authSession.token_hash);
    const raw = token(),
      csrf = token();
    const age = userId ? sevenDays : 60 * 60 * 1000;
    store.run(
      'INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)',
      digest(raw),
      userId,
      csrf,
      Date.now() + age,
    );
    res.setHeader(
      'Set-Cookie',
      serialize(cookieName, raw, {
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookies,
        path: '/',
        maxAge: age / 1000,
      }),
    );
    return csrf;
  }
  app.get('/api/auth/session', (req, res) => {
    const csrfToken = req.authSession?.csrf_token ?? setSession(req, res, null);
    res.json({ user: req.authUser ?? null, csrfToken, demoEnabled: !!options.demo });
  });
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('Origin');
    const allowed = new Set([options.origin]);
    // Vite is bound to loopback; accept both loopback spellings in development.
    if (!options.production) {
      const parsed = new URL(options.origin);
      if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        parsed.hostname = parsed.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
        allowed.add(parsed.origin);
      }
    }
    if (!origin || !allowed.has(origin))
      throw new HttpError(403, 'Nguồn yêu cầu không được cho phép.');
    const supplied = req.get('X-CSRF-Token');
    const expected = req.authSession?.csrf_token;
    if (
      !supplied ||
      !expected ||
      !/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      throw new HttpError(403, 'Phiên bảo mật đã thay đổi. Hãy tải lại trang.');
    next();
  });
  if (options.rateLimits !== false)
    app.use(
      '/api/auth',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 25,
        skip: (req) => req.method === 'GET',
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: {
          error: 'Đã có nhiều lần đăng nhập hoặc tạo tài khoản. Hãy thử lại sau 15 phút.',
        },
      }),
    );
  app.post('/api/auth/register', async (req, res) => {
    const value = registerSchema.parse(req.body);
    if (store.one('SELECT id FROM users WHERE email=?', value.email))
      throw new HttpError(409, 'Không thể tạo tài khoản với địa chỉ email này.');
    const hash = await hashPassword(value.password);
    const user = store.transaction(() => {
      if (store.one('SELECT id FROM users WHERE email=?', value.email))
        throw new HttpError(409, 'Không thể tạo tài khoản với địa chỉ email này.');
      const id = Number(
        store.run(
          'INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)',
          value.name,
          value.email,
          hash,
          new Date().toISOString(),
        ).lastInsertRowid,
      );
      return store.one<UserRow>('SELECT * FROM users WHERE id=?', id)!;
    });
    res.status(201).json({
      user: userView(user),
      csrfToken: setSession(req, res, user.id),
      demoEnabled: !!options.demo,
    });
  });
  app.post('/api/auth/login', async (req, res) => {
    const value = loginSchema.parse(req.body);
    const user = store.one<UserRow>('SELECT * FROM users WHERE email=? AND is_demo=0', value.email);
    const valid = await verifyPassword(value.password, user?.password_hash);
    if (!valid || !user) throw new HttpError(401, 'Email hoặc mật khẩu chưa đúng.');
    res.json({
      user: userView(user),
      csrfToken: setSession(req, res, user.id),
      demoEnabled: !!options.demo,
    });
  });
  app.post('/api/auth/demo', async (req, res) => {
    if (!options.demo) throw new HttpError(404, 'Chế độ dùng thử chưa được bật.');
    const email = `demo-${token().slice(0, 24)}@example.test`;
    const password = await hashPassword(token());
    const user = store.transaction(() => {
      const id = Number(
        store.run(
          'INSERT INTO users(name,email,password_hash,is_demo,created_at) VALUES(?,?,?,?,?)',
          'Bạn khám phá',
          email,
          password,
          1,
          new Date().toISOString(),
        ).lastInsertRowid,
      );
      seedDemo(store, id);
      return store.one<UserRow>('SELECT * FROM users WHERE id=?', id)!;
    });
    res.status(201).json({
      user: userView(user),
      csrfToken: setSession(req, res, user.id),
      demoEnabled: !!options.demo,
    });
  });
  app.post('/api/auth/logout', (req, res) => {
    if (req.authSession)
      store.run('DELETE FROM sessions WHERE token_hash=?', req.authSession.token_hash);
    res.setHeader(
      'Set-Cookie',
      serialize(cookieName, '', {
        path: '/',
        maxAge: 0,
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookies,
      }),
    );
    res.status(204).end();
  });
  app.use('/api', (req, _res, next) => {
    if (!req.authUser) throw new HttpError(401, 'Hãy đăng nhập để tiếp tục.');
    next();
  });
  function ownApplication(req: Request) {
    const row = store.one<Application>(
      `${APPLICATION_SELECT} WHERE id=? AND user_id=?`,
      idParam(req),
      req.authUser!.id,
    );
    if (!row) throw new HttpError(404, 'Không tìm thấy hồ sơ này.');
    return row;
  }
  function ownedTask(req: Request) {
    const row = store.one<{ id: number; application_id: number; completed: number }>(
      `SELECT t.id,t.application_id,t.completed FROM tasks t JOIN applications a ON a.id=t.application_id WHERE t.id=? AND a.user_id=?`,
      idParam(req),
      req.authUser!.id,
    );
    if (!row) throw new HttpError(404, 'Không tìm thấy việc này.');
    return row;
  }
  app.get('/api/workspace', (req, res) => {
    const userId = req.authUser!.id;
    const applications = store.all<Application>(
      `${APPLICATION_SELECT} WHERE user_id=? ORDER BY updated_at DESC,id DESC`,
      userId,
    );
    const tasks = store
      .all<Omit<Task, 'completed'> & { completed: number }>(
        `SELECT t.id,t.application_id AS applicationId,t.title,t.due_date AS dueDate,t.completed,t.created_at AS createdAt FROM tasks t JOIN applications a ON a.id=t.application_id WHERE a.user_id=? ORDER BY t.completed, t.due_date='', t.due_date,t.id`,
        userId,
      )
      .map((item) => ({ ...item, completed: !!item.completed }));
    const activities = store.all<Activity>(
      'SELECT id,application_id AS applicationId,message,created_at AS createdAt FROM activities WHERE user_id=? ORDER BY id DESC LIMIT 50',
      userId,
    );
    res.json({ applications, tasks, activities });
  });
  app.get('/api/applications', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120).toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status && !STATUSES.includes(status as (typeof STATUSES)[number]))
      throw new HttpError(400, 'Trạng thái không hợp lệ.');
    res.json({
      applications: store.all<Application>(
        `${APPLICATION_SELECT} WHERE user_id=? AND (?='' OR instr(lower(company || ' ' || role || ' ' || location),?)>0) AND (?='' OR status=?) ORDER BY updated_at DESC,id DESC`,
        req.authUser!.id,
        q,
        q,
        status,
        status,
      ),
    });
  });
  app.post('/api/applications', (req, res) => {
    const value = applicationSchema.parse(req.body);
    const userId = req.authUser!.id;
    const count = store.one<{ count: number }>(
      'SELECT count(*) AS count FROM applications WHERE user_id=?',
      userId,
    )!.count;
    if (count >= 500)
      throw new HttpError(409, 'Bạn đã có 500 hồ sơ. Hãy dọn các hồ sơ cũ trước khi thêm.');
    const id = store.transaction(() => insertApplication(store, userId, value));
    res
      .status(201)
      .json({ application: store.one<Application>(`${APPLICATION_SELECT} WHERE id=?`, id) });
  });
  app.get('/api/applications/:id', (req, res) => res.json({ application: ownApplication(req) }));
  app.put('/api/applications/:id', (req, res) => {
    const value = updateApplicationSchema.parse(req.body),
      current = ownApplication(req),
      userId = req.authUser!.id;
    if (current.version !== value.version)
      throw new HttpError(
        409,
        'Hồ sơ đã được thay đổi ở tab khác. Hãy đóng biểu mẫu và tải lại dữ liệu trước khi sửa.',
      );
    store.transaction(() => {
      const result = store.run(
        `UPDATE applications SET company=?,role=?,location=?,work_mode=?,status=?,url=?,deadline=?,applied_on=?,notes=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?`,
        value.company,
        value.role,
        value.location,
        value.workMode,
        value.status,
        value.url,
        value.deadline,
        value.appliedOn,
        value.notes,
        new Date().toISOString(),
        current.id,
        userId,
        value.version,
      );
      if (!result.changes) throw new HttpError(409, 'Hồ sơ vừa thay đổi. Hãy tải lại dữ liệu.');
      activity(
        store,
        userId,
        current.id,
        current.status !== value.status
          ? `Chuyển ${value.company} sang ${STATUS_LABELS[value.status]}`
          : `Đã cập nhật ${value.role} · ${value.company}`,
      );
    });
    res.json({
      application: store.one<Application>(`${APPLICATION_SELECT} WHERE id=?`, current.id),
    });
  });
  app.delete('/api/applications/:id', (req, res) => {
    const current = ownApplication(req),
      userId = req.authUser!.id;
    store.transaction(() => {
      store.run('DELETE FROM applications WHERE id=? AND user_id=?', current.id, userId);
      activity(store, userId, null, `Đã xóa ${current.role} · ${current.company}`);
    });
    res.status(204).end();
  });
  app.post('/api/applications/:id/tasks', (req, res) => {
    const application = ownApplication(req),
      value = taskSchema.parse(req.body);
    const count = store.one<{ count: number }>(
      'SELECT count(*) AS count FROM tasks WHERE application_id=?',
      application.id,
    )!.count;
    if (count >= 100) throw new HttpError(409, 'Mỗi hồ sơ tối đa 100 việc.');
    const id = store.transaction(() => {
      const result = store.run(
        'INSERT INTO tasks(application_id,title,due_date,created_at) VALUES(?,?,?,?)',
        application.id,
        value.title,
        value.dueDate,
        new Date().toISOString(),
      );
      activity(store, req.authUser!.id, application.id, `Thêm việc: ${value.title}`);
      return Number(result.lastInsertRowid);
    });
    res.status(201).json({
      task: {
        id,
        applicationId: application.id,
        ...value,
        completed: false,
        createdAt: new Date().toISOString(),
      },
    });
  });
  app.patch('/api/tasks/:id', (req, res) => {
    const value = taskUpdateSchema.parse(req.body),
      current = ownedTask(req);
    store.run('UPDATE tasks SET completed=? WHERE id=?', Number(value.completed), current.id);
    res.json({ completed: value.completed });
  });
  app.delete('/api/tasks/:id', (req, res) => {
    const current = ownedTask(req);
    store.run('DELETE FROM tasks WHERE id=?', current.id);
    res.status(204).end();
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Đường dẫn API không tồn tại.' }));
  if (options.serveClient) {
    const directory = resolve('dist/client');
    if (existsSync(directory)) {
      app.use(express.static(directory, { index: false }));
      app.get(/.*/, (_req, res) => res.sendFile(resolve(directory, 'index.html')));
    }
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: 'Vui lòng kiểm tra các trường đã nhập.',
        fields: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError && 'body' in error)
      return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn.' });
    console.error(
      'ApplyFlow request failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return res.status(500).json({ error: 'Có lỗi khi xử lý yêu cầu. Hãy thử lại sau.' });
  });
  return app;
}
