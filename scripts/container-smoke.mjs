import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const base = 'http://127.0.0.1:' + (process.env.PORT || 3001);
const stateFile = '/tmp/applyflow-smoke-session.json';
let state = {};
async function call(path, method = 'GET', body) {
  const response = await fetch(base + '/api' + path, {
    method,
    signal: AbortSignal.timeout(5000),
    headers: {
      'Content-Type': 'application/json',
      Origin: process.env.APP_ORIGIN,
      ...(state.cookie ? { Cookie: state.cookie } : {}),
      ...(state.csrf ? { 'X-CSRF-Token': state.csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert(response.ok, `${method} ${path}: HTTP ${response.status}`);
  const cookie = response.headers.getSetCookie()[0];
  if (cookie) state.cookie = cookie.split(';')[0];
  return response.json();
}
if (process.argv[2] === 'seed') {
  const guest = await call('/auth/session');
  state.csrf = guest.csrfToken;
  const session = await call('/auth/register', 'POST', {
    name: 'Container Test',
    email: 'container-test@example.test',
    password: 'Fictional-container-password-2030',
  });
  state.csrf = session.csrfToken;
  const result = await call('/applications', 'POST', {
    company: 'Container persistence test',
    role: 'Backend Intern',
    location: 'Hanoi',
    workMode: 'remote',
    status: 'saved',
    url: '',
    deadline: '2030-04-20',
    appliedOn: '',
    notes: '',
  });
  state.id = result.application.id;
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
} else {
  state = JSON.parse(readFileSync(stateFile, 'utf8'));
  const result = await call('/workspace');
  assert(
    result.applications.some(
      (item) => item.id === state.id && item.company === 'Container persistence test',
    ),
  );
  console.log('Container data and session survived restart.');
}
