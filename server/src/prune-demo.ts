import 'dotenv/config';
import { Store } from './database.js';
const store = new Store(process.env.DATABASE_PATH ?? './data/applyflow.sqlite');
const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const result = store.run('DELETE FROM users WHERE is_demo=1 AND created_at < ?', cutoff);
console.log(
  `Removed ${result.changes} demo accounts older than 7 days. Registered accounts are unchanged.`,
);
store.close();
