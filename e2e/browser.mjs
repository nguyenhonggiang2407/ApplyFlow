import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { Store } from '../dist/server/server/src/database.js';
import { createApp } from '../dist/server/server/src/app.js';
let server,
  store,
  browser,
  base,
  serial = 0;
before(async () => {
  mkdirSync('docs/screenshots', { recursive: true });
  store = new Store(':memory:');
  server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = 'http://127.0.0.1:' + server.address().port;
  server.on(
    'request',
    createApp({ store, origin: base, demo: true, serveClient: true, rateLimits: false }),
  );
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
  store?.close();
});
async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
  });
  const guest = await (await context.request.get(base + '/api/auth/session')).json();
  const response = await context.request.post(base + '/api/auth/register', {
    headers: { Origin: base, 'X-CSRF-Token': guest.csrfToken },
    data: {
      name: 'Sinh viên dùng thử',
      email: `calendar-${++serial}@example.test`,
      password: 'Fictional-password-2030',
    },
  });
  assert.equal(response.status(), 201);
  const session = await response.json();
  return {
    context,
    page,
    headers: { Origin: base, 'X-CSRF-Token': session.csrfToken },
    uid: session.user.id,
  };
}
async function seed(f) {
  const response = await f.context.request.post(base + '/api/applications', {
    headers: f.headers,
    data: {
      company: 'Nori Studio · dữ liệu hư cấu',
      role: 'Backend Developer Intern',
      location: 'Hà Nội',
      workMode: 'hybrid',
      status: 'interview',
      url: '',
      deadline: '2030-04-20',
      appliedOn: '2030-04-01',
      notes: 'Ghi chú riêng không nằm trong tệp lịch.',
    },
  });
  assert.equal(response.status(), 201);
  const application = (await response.json()).application;
  const taskResponse = await f.context.request.post(
    base + `/api/applications/${application.id}/tasks`,
    { headers: f.headers, data: { title: 'Ôn tập SQL và transaction', dueDate: '2030-04-19' } },
  );
  assert.equal(taskResponse.status(), 201);
}
async function download(f) {
  const pending = f.page.waitForEvent('download');
  await f.page.getByRole('link', { name: 'Xuất lịch (.ics)', exact: true }).click();
  const file = await pending;
  assert.equal(file.suggestedFilename(), 'applyflow-calendar.ics');
  return readFileSync(await file.path(), 'utf8');
}
test(
  'download from the real task screen reflects task completion without exporting private notes',
  { timeout: 45000 },
  async (t) => {
    const f = await fixture(t);
    await seed(f);
    await f.page.goto(base + '/#tasks');
    await expect(
      f.page.getByRole('heading', { name: 'Đưa kế hoạch vào lịch của bạn' }),
    ).toBeVisible();
    const first = await download(f);
    assert.equal(first.match(/BEGIN:VEVENT\r\n/g)?.length, 2);
    assert(!first.includes('Ghi chú riêng'));
    await f.page.screenshot({ path: 'docs/screenshots/calendar-desktop.png', fullPage: true });
    await f.page
      .getByRole('button', { name: 'Hoàn thành: Ôn tập SQL và transaction', exact: true })
      .click();
    await expect(
      f.page.getByRole('button', { name: 'Hoàn thành: Ôn tập SQL và transaction', exact: true }),
    ).toHaveCount(0);
    const second = await download(f);
    assert.equal(second.match(/BEGIN:VEVENT\r\n/g)?.length, 1);
    assert(second.includes('DTSTART;VALUE=DATE:20300420'));
  },
);
test(
  'mobile calendar fits the viewport and date-only downloads keep dates in a distant time zone',
  { timeout: 45000 },
  async (t) => {
    const f = await fixture(t, {
      viewport: { width: 390, height: 844 },
      timezoneId: 'Pacific/Honolulu',
    });
    await seed(f);
    await f.page.goto(base + '/#tasks');
    await expect(f.page.getByRole('link', { name: 'Xuất lịch (.ics)', exact: true })).toBeVisible();
    assert(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const ics = await download(f);
    assert(ics.includes('DTSTART;VALUE=DATE:20300419'));
    assert(ics.includes('DTEND;VALUE=DATE:20300420'));
    await f.page.screenshot({ path: 'docs/screenshots/calendar-mobile.png', fullPage: true });
  },
);
test(
  'separate browser accounts receive separate calendars and expired sessions lose the export screen',
  { timeout: 45000 },
  async (t) => {
    const first = await fixture(t),
      second = await fixture(t);
    await seed(first);
    await second.page.goto(base + '/#tasks');
    const empty = await download(second);
    assert(!empty.includes('BEGIN:VEVENT'));
    await first.page.goto(base + '/#tasks');
    await expect(
      first.page.getByRole('link', { name: 'Xuất lịch (.ics)', exact: true }),
    ).toBeVisible();
    store.run('UPDATE sessions SET expires_at=? WHERE user_id=?', Date.now() - 1000, first.uid);
    await first.page.reload();
    await expect(
      first.page.getByRole('link', { name: 'Xuất lịch (.ics)', exact: true }),
    ).toHaveCount(0);
    await expect(first.page.getByLabel('Email', { exact: true })).toBeVisible();
  },
);
