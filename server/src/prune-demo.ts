import 'dotenv/config';
import { Store } from './database.js';
const store = new Store(process.env.DATABASE_PATH ?? './data/applyflow.sqlite');
const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const configuredEmail =
  process.env.DEMO_LOGIN_ENABLED === '1'
    ? process.env.DEMO_LOGIN_EMAIL?.trim().toLowerCase()
    : undefined;
const result = store.run(
  'DELETE FROM users WHERE is_demo=1 AND created_at < ? AND email <> ?',
  cutoff,
  configuredEmail ?? '',
);
console.log(`Removed ${result.changes} guest demo accounts older than 7 days.`);
store.close();
