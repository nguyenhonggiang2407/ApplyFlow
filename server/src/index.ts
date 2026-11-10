import 'dotenv/config';
import { Store } from './database.js';
import { createApp } from './app.js';
import { runtimeConfig } from './config.js';
import { seedDemoLogin } from './demo.js';
const config = runtimeConfig();
const { port, host, demoLogin, ...appConfig } = config;
const store = new Store(config.databasePath);
try {
  if (demoLogin) await seedDemoLogin(store, demoLogin);
} catch (error) {
  store.close();
  throw error;
}
const app = createApp({ store, ...appConfig, demoLoginEmail: demoLogin?.email, serveClient: true });
const server = app.listen(port, host, () => console.log(`ApplyFlow listening on ${host}:${port}`));
const cleanup = setInterval(
  () => store.run('DELETE FROM sessions WHERE expires_at < ?', Date.now()),
  60 * 60 * 1000,
);
cleanup.unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    clearInterval(cleanup);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
