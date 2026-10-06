export function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const origin = env.APP_ORIGIN ?? 'http://localhost:5173';
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
    throw new Error(
      'APP_ORIGIN must be an HTTP(S) origin without credentials, trailing slash or path.',
    );
  const localHttp =
    env.ALLOW_INSECURE_LOCAL_HTTP === 'true' &&
    parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (production && parsed.protocol !== 'https:' && !localHttp)
    throw new Error(
      'Production APP_ORIGIN must use HTTPS. Use ALLOW_INSECURE_LOCAL_HTTP=true only for a loopback production preview.',
    );
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid TCP port.');
  const host = env.HOST ?? '127.0.0.1';
  if (production && localHttp && !['localhost', '127.0.0.1', '::1'].includes(host))
    throw new Error('Insecure production preview must bind only to loopback.');
  return {
    production,
    origin,
    port,
    host,
    secureCookies: production && !localHttp,
    databasePath: env.DATABASE_PATH ?? './data/applyflow.sqlite',
    demo: env.ENABLE_DEMO === 'true',
    trustProxy: env.TRUST_PROXY === '1',
  };
}
