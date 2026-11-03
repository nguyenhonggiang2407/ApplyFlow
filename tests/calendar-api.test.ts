import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { Store } from '../server/src/database.js';
import { createApp } from '../server/src/app.js';
const origin = 'http://localhost:5173';
const input = {
  company: 'Fictional Company',
  role: 'Backend Intern',
  location: 'Hà Nội',
  workMode: 'remote',
  status: 'saved',
  url: '',
  deadline: '2030-04-01',
  appliedOn: '',
  notes: 'Notes stay private to this app.',
};
async function account(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const initial = await agent.get('/api/auth/session').expect(200);
  const result = await agent
    .post('/api/auth/register')
    .set('Origin', origin)
    .set('X-CSRF-Token', initial.body.csrfToken)
    .send({ name: 'Calendar Student', email, password: 'Fictional-password-2030' })
    .expect(201);
  return { agent, csrf: result.body.csrfToken };
}
test('calendar download requires a current account and uses no-store attachment headers', async () => {
  const store = new Store(':memory:');
  try {
    const app = createApp({ store, origin, rateLimits: false });
    await request(app).get('/api/calendar.ics').expect(401);
    const a = await account(app, 'calendar@example.test');
    const result = await a.agent.get('/api/calendar.ics').expect(200);
    assert.match(result.headers['content-type'], /text\/calendar.*charset=utf-8/i);
    assert.match(result.headers['content-disposition'], /attachment.*applyflow-calendar\.ics/);
    assert.equal(result.headers['cache-control'], 'no-store');
    store.run('UPDATE sessions SET expires_at=?', Date.now() - 1);
    await a.agent.get('/api/calendar.ics').expect(401);
  } finally {
    store.close();
  }
});
test('calendar only exports the current owner and reflects completed tasks and closed applications', async () => {
  const store = new Store(':memory:');
  try {
    const app = createApp({ store, origin, rateLimits: false });
    const a = await account(app, 'first@example.test'),
      b = await account(app, 'second@example.test');
    const created = await a.agent
      .post('/api/applications')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send(input)
      .expect(201);
    const id = created.body.application.id;
    const createdTask = await a.agent
      .post(`/api/applications/${id}/tasks`)
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({ title: 'Private checklist', dueDate: '2030-03-31' })
      .expect(201);
    const first = (await a.agent.get('/api/calendar.ics')).text;
    assert.equal(first.match(/BEGIN:VEVENT\r\n/g)?.length, 2);
    assert(!first.includes(input.notes));
    assert(!(await b.agent.get('/api/calendar.ics')).text.includes(input.company));
    await a.agent
      .patch(`/api/tasks/${createdTask.body.task.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({ completed: true })
      .expect(200);
    assert(!(await a.agent.get('/api/calendar.ics')).text.includes('Private checklist'));
    await a.agent
      .put(`/api/applications/${id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({ ...input, status: 'closed', version: 1 })
      .expect(200);
    assert(!(await a.agent.get('/api/calendar.ics')).text.includes('BEGIN:VEVENT'));
  } finally {
    store.close();
  }
});
