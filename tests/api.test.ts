import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { Store } from '../server/src/database.js';
import { createApp } from '../server/src/app.js';
import { hashPassword, verifyPassword } from '../server/src/auth.js';
import { csvCell } from '../client/src/utils.js';
import { runtimeConfig } from '../server/src/config.js';
const origin = 'http://localhost:5173';
const application = {
  company: 'Nori Studio',
  role: 'Developer Intern',
  location: 'Hà Nội',
  workMode: 'remote',
  status: 'saved',
  url: 'https://example.com/job',
  deadline: '2027-03-01',
  appliedOn: '',
  notes: 'Chuẩn bị dự án.',
};
function fixture() {
  const store = new Store(':memory:');
  return { store, app: createApp({ store, origin, demo: true, rateLimits: false }) };
}
async function account(app: ReturnType<typeof createApp>, email = 'student@example.test') {
  const agent = request.agent(app),
    initial = await agent.get('/api/auth/session').expect(200);
  const response = await agent
    .post('/api/auth/register')
    .set('Origin', origin)
    .set('X-CSRF-Token', initial.body.csrfToken)
    .send({ name: 'Student Demo', email, password: 'Demo-password-123!' })
    .expect(201);
  return { agent, csrf: response.body.csrfToken, user: response.body.user };
}
test('passwords use unique salted hashes and verify without storing the password', async () => {
  const first = await hashPassword('A-long-password'),
    second = await hashPassword('A-long-password');
  assert.notEqual(first, second);
  assert(!first.includes('A-long-password'));
  assert(await verifyPassword('A-long-password', first));
  assert.equal(await verifyPassword('incorrect', first), false);
  assert.equal(
    await verifyPassword('password', `scrypt:${'0'.repeat(32)}:${'z'.repeat(128)}`),
    false,
  );
});
test('registration rotates guest session, uses HttpOnly cookie, and omits password hash', async () => {
  const { store, app } = fixture();
  try {
    const agent = request.agent(app),
      initial = await agent.get('/api/auth/session');
    const guestCookie = initial.headers['set-cookie'][0].split(';')[0];
    const response = await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', initial.body.csrfToken)
      .send({ name: 'Student', email: 'STUDENT@example.test', password: 'Good-password-123' })
      .expect(201);
    assert.equal(response.body.user.email, 'student@example.test');
    assert.equal(response.body.user.password_hash, undefined);
    assert.notEqual(response.body.csrfToken, initial.body.csrfToken);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
    await request(app).get('/api/workspace').set('Cookie', guestCookie).expect(401);
    assert.equal(store.one<{ count: number }>('SELECT count(*) AS count FROM sessions')?.count, 1);
  } finally {
    store.close();
  }
});
test('CSRF and Origin checks reject authenticated writes before touching data', async () => {
  const { store, app } = fixture();
  try {
    const owner = await account(app);
    await owner.agent.post('/api/applications').set('Origin', origin).send(application).expect(403);
    await owner.agent
      .post('/api/applications')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', owner.csrf)
      .send(application)
      .expect(403);
    await owner.agent
      .post('/api/applications')
      .set('X-CSRF-Token', owner.csrf)
      .send(application)
      .expect(403);
    assert.equal(
      store.one<{ count: number }>('SELECT count(*) AS count FROM applications')?.count,
      0,
    );
  } finally {
    store.close();
  }
});
test('owned CRUD is persistent, supports literal search, and rejects stale edits', async () => {
  const { store, app } = fixture();
  try {
    const owner = await account(app);
    const created = await owner.agent
        .post('/api/applications')
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send(application)
        .expect(201),
      item = created.body.application;
    const updated = await owner.agent
      .put(`/api/applications/${item.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({ ...application, version: 1, status: 'interview' })
      .expect(200);
    assert.equal(updated.body.application.version, 2);
    await owner.agent
      .put(`/api/applications/${item.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({ ...application, version: 1, status: 'closed' })
      .expect(409);
    const current = await owner.agent.get(`/api/applications/${item.id}`).expect(200);
    assert.equal(current.body.application.status, 'interview');
    const filtered = await owner.agent
      .get('/api/applications')
      .query({ q: 'Nori', status: 'interview' })
      .expect(200);
    assert.equal(filtered.body.applications.length, 1);
    const injection = await owner.agent
      .get('/api/applications')
      .query({ q: "' OR 1=1--" })
      .expect(200);
    assert.equal(injection.body.applications.length, 0);
    await owner.agent
      .delete(`/api/applications/${item.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .expect(204);
    await owner.agent.get(`/api/applications/${item.id}`).expect(404);
  } finally {
    store.close();
  }
});
test('another account cannot read, edit, delete or add tasks to owned applications', async () => {
  const { store, app } = fixture();
  try {
    const owner = await account(app, 'first@example.test'),
      other = await account(app, 'second@example.test');
    const created = await owner.agent
        .post('/api/applications')
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send(application),
      id = created.body.application.id;
    await other.agent.get(`/api/applications/${id}`).expect(404);
    await other.agent
      .put(`/api/applications/${id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', other.csrf)
      .send({ ...application, version: 1 })
      .expect(404);
    await other.agent
      .delete(`/api/applications/${id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', other.csrf)
      .expect(404);
    await other.agent
      .post(`/api/applications/${id}/tasks`)
      .set('Origin', origin)
      .set('X-CSRF-Token', other.csrf)
      .send({ title: 'Foreign task', dueDate: '' })
      .expect(404);
    const workspace = await other.agent.get('/api/workspace').expect(200);
    assert.deepEqual(workspace.body, { applications: [], tasks: [], activities: [] });
  } finally {
    store.close();
  }
});
test('task completion/deletion is owner-scoped and application deletion cascades tasks', async () => {
  const { store, app } = fixture();
  try {
    const owner = await account(app, 'first@example.test'),
      other = await account(app, 'second@example.test');
    const created = await owner.agent
        .post('/api/applications')
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send(application),
      id = created.body.application.id;
    const task = await owner.agent
        .post(`/api/applications/${id}/tasks`)
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send({ title: 'Prepare demo', dueDate: '2027-02-28' })
        .expect(201),
      taskId = task.body.task.id;
    await other.agent
      .patch(`/api/tasks/${taskId}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', other.csrf)
      .send({ completed: true })
      .expect(404);
    await other.agent
      .delete(`/api/tasks/${taskId}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', other.csrf)
      .expect(404);
    await owner.agent
      .patch(`/api/tasks/${taskId}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({ completed: true })
      .expect(200);
    const workspace = await owner.agent.get('/api/workspace');
    assert.equal(workspace.body.tasks[0].completed, true);
    await owner.agent
      .delete(`/api/applications/${id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .expect(204);
    assert.equal(store.one<{ count: number }>('SELECT count(*) AS count FROM tasks')?.count, 0);
    assert(
      store.one<{ count: number }>(
        'SELECT count(*) AS count FROM activities WHERE application_id IS NULL',
      )!.count > 0,
    );
  } finally {
    store.close();
  }
});
test('invalid dates, unsafe links, extra fields and excessive text are rejected', async () => {
  const { store, app } = fixture();
  try {
    const owner = await account(app);
    for (const invalid of [
      { deadline: '2027-02-30' },
      { url: 'javascript:alert(1)' },
      { url: 'https://user:password@example.com' },
      { status: 'unknown' },
      { notes: 'x'.repeat(5001) },
      { userId: 123 },
    ])
      await owner.agent
        .post('/api/applications')
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send({ ...application, ...invalid })
        .expect(400);
    assert.equal(
      store.one<{ count: number }>('SELECT count(*) AS count FROM applications')?.count,
      0,
    );
  } finally {
    store.close();
  }
});
test('logout invalidates a copied session token and login rotates a new token', async () => {
  const { store, app } = fixture();
  try {
    const owner = await account(app);
    const response = await owner.agent.get('/api/auth/session');
    assert(response.body.user);
    const session = store.one<{ token_hash: string }>(
      'SELECT token_hash FROM sessions WHERE user_id=?',
      owner.user.id,
    );
    await owner.agent
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .expect(204);
    assert.equal(
      store.one('SELECT token_hash FROM sessions WHERE token_hash=?', session!.token_hash),
      undefined,
    );
    await owner.agent.get('/api/workspace').expect(401);
    const guest = await owner.agent.get('/api/auth/session');
    await owner.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', guest.body.csrfToken)
      .send({ email: 'student@example.test', password: 'wrong' })
      .expect(401);
    await owner.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', guest.body.csrfToken)
      .send({ email: 'student@example.test', password: 'Demo-password-123!' })
      .expect(200);
  } finally {
    store.close();
  }
});
test('expired sessions lose access and demo data is isolated per visitor', async () => {
  const { store, app } = fixture();
  try {
    const first = request.agent(app),
      second = request.agent(app);
    for (const agent of [first, second]) {
      const guest = await agent.get('/api/auth/session');
      await agent
        .post('/api/auth/demo')
        .set('Origin', origin)
        .set('X-CSRF-Token', guest.body.csrfToken)
        .expect(201);
    }
    const one = await first.get('/api/workspace'),
      two = await second.get('/api/workspace');
    assert.equal(one.body.applications.length, 7);
    assert.equal(one.body.tasks.length, 5);
    assert(
      !one.body.applications.some((item: { id: number }) =>
        two.body.applications.some((other: { id: number }) => other.id === item.id),
      ),
    );
    store.run('UPDATE sessions SET expires_at=0');
    await first.get('/api/workspace').expect(401);
  } finally {
    store.close();
  }
});
test('database rows survive reopening and failed transactions roll back', () => {
  const directory = mkdtempSync(join(tmpdir(), 'applyflow-')),
    path = join(directory, 'test.sqlite');
  let store = new Store(path);
  try {
    store.run(
      'INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)',
      'Test',
      'test@example.test',
      'fixture-not-a-real-hash',
      new Date().toISOString(),
    );
    assert.throws(() =>
      store.transaction(() => {
        store.run(
          'INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)',
          'Test 2',
          'second@example.test',
          'fixture-not-a-real-hash',
          new Date().toISOString(),
        );
        throw new Error('rollback');
      }),
    );
    store.close();
    store = new Store(path);
    assert.equal(store.one<{ count: number }>('SELECT count(*) AS count FROM users')?.count, 1);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test('CSV escaping prevents formulas and preserves quotes', () => {
  assert.equal(
    csvCell('=HYPERLINK("https://example.com")'),
    '"\'=HYPERLINK(""https://example.com"")"',
  );
  assert.equal(csvCell(' \t+1'), '"\' \t+1"');
  assert.equal(csvCell('Nori, Studio'), '"Nori, Studio"');
});
test('production requires HTTPS; an explicit HTTP preview can bind only to loopback', () => {
  assert.throws(
    () => runtimeConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.com' }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      runtimeConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'http://example.com',
        ALLOW_INSECURE_LOCAL_HTTP: 'true',
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      runtimeConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'http://localhost:18101',
        HOST: '0.0.0.0',
        ALLOW_INSECURE_LOCAL_HTTP: 'true',
      }),
    /loopback/,
  );
  const preview = runtimeConfig({
    NODE_ENV: 'production',
    APP_ORIGIN: 'http://127.0.0.1:18101',
    PORT: '18101',
    ALLOW_INSECURE_LOCAL_HTTP: 'true',
  });
  assert.equal(preview.production, true);
  assert.equal(preview.secureCookies, false);
  assert.equal(
    runtimeConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://applyflow.example.test' })
      .secureCookies,
    true,
  );
  for (const origin of [
    'https://example.test/path',
    'https://example.test/',
    'ftp://example.test',
    'https://user:pass@example.test',
  ])
    assert.throws(() => runtimeConfig({ APP_ORIGIN: origin }));
});
test('production sessions and error responses use secure headers and exact Origin matching', async () => {
  const store = new Store(':memory:'),
    app = createApp({
      store,
      origin: 'https://applyflow.example.test',
      production: true,
      rateLimits: false,
    });
  try {
    const session = await request(app).get('/api/auth/session').expect(200);
    assert.match(session.headers['set-cookie'][0], /; Secure/);
    assert.match(session.headers['content-security-policy'], /default-src 'self'/);
    assert.match(session.headers['content-security-policy'], /upgrade-insecure-requests/);
    assert.equal(session.headers['cache-control'], 'no-store');
    const cookie = session.headers['set-cookie'][0].split(';')[0];
    await request(app)
      .post('/api/auth/register')
      .set('Cookie', cookie)
      .set('Origin', 'https://other.example.test')
      .set('X-CSRF-Token', session.body.csrfToken)
      .send({ name: 'Student', email: 'student@example.test', password: 'Demo-password-123!' })
      .expect(403);
    assert.equal(store.one<{ count: number }>('SELECT count(*) AS count FROM users')?.count, 0);
    const registered = await request(app)
      .post('/api/auth/register')
      .set('Cookie', cookie)
      .set('Origin', 'https://applyflow.example.test')
      .set('X-CSRF-Token', session.body.csrfToken)
      .send({ name: 'Student', email: 'student@example.test', password: 'Demo-password-123!' })
      .expect(201);
    assert.match(registered.headers['set-cookie'][0], /; Secure/);
  } finally {
    store.close();
  }
});
test('invalid CSRF formats and malformed JSON are handled without creating data', async () => {
  const { store, app } = fixture();
  try {
    const owner = await account(app);
    for (const token of ['x', 'z'.repeat(64), '0'.repeat(64)])
      await owner.agent
        .post('/api/applications')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send(application)
        .expect(403);
    await owner.agent
      .post('/api/applications')
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .set('Content-Type', 'application/json')
      .send('{invalid')
      .expect(400);
    assert.equal(
      store.one<{ count: number }>('SELECT count(*) AS count FROM applications')?.count,
      0,
    );
  } finally {
    store.close();
  }
});
test('owner can delete an individual task and stale CSRF cannot write after login rotation', async () => {
  const { store, app } = fixture();
  try {
    const owner = await account(app),
      created = await owner.agent
        .post('/api/applications')
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send(application)
        .expect(201);
    const task = await owner.agent
      .post(`/api/applications/${created.body.application.id}/tasks`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({ title: 'Prepare pitch', dueDate: '' })
      .expect(201);
    await owner.agent
      .delete(`/api/tasks/${task.body.task.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .expect(204);
    assert.equal((await owner.agent.get('/api/workspace')).body.tasks.length, 0);
    await owner.agent
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .expect(204);
    const guest = await owner.agent.get('/api/auth/session');
    const login = await owner.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', guest.body.csrfToken)
      .send({ email: 'student@example.test', password: 'Demo-password-123!' })
      .expect(200);
    await owner.agent
      .post('/api/applications')
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send(application)
      .expect(403);
    await owner.agent
      .post('/api/applications')
      .set('Origin', origin)
      .set('X-CSRF-Token', login.body.csrfToken)
      .send(application)
      .expect(201);
  } finally {
    store.close();
  }
});
test('disabled demo is advertised as unavailable and does not create any user', async () => {
  const store = new Store(':memory:');
  const app = createApp({ store, origin, demo: false, rateLimits: false });
  try {
    const agent = request.agent(app);
    const session = await agent.get('/api/auth/session').expect(200);
    assert.equal(session.body.demoEnabled, false);
    await agent
      .post('/api/auth/demo')
      .set('Origin', origin)
      .set('X-CSRF-Token', session.body.csrfToken)
      .expect(404);
    assert.equal(store.one<{ count: number }>('SELECT count(*) AS count FROM users')?.count, 0);
  } finally {
    store.close();
  }
});
test('loopback production preview keeps CSP but permits HTTP cookies and assets', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    origin: 'http://127.0.0.1:18101',
    production: true,
    secureCookies: false,
    rateLimits: false,
  });
  try {
    const response = await request(app).get('/api/auth/session').expect(200);
    assert.match(response.headers['content-security-policy'], /default-src 'self'/);
    assert(!response.headers['content-security-policy'].includes('upgrade-insecure-requests'));
    assert(!response.headers['set-cookie'][0].includes('; Secure'));
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  } finally {
    store.close();
  }
});
