# Deployment and data care

ApplyFlow requires a running Node 24+ process and a persistent filesystem. A static-only hosting service can serve the client assets but cannot run the authentication API or SQLite database. A runtime with an ephemeral disk loses data when that disk is replaced.

## One-process deployment

1. Install with `npm ci`, run `npm run check`, then build with `npm run build`.
2. Configure an HTTPS browser origin, such as `https://applyflow.example.test`. The example domain is a placeholder, not a live deployment.
3. Set `NODE_ENV=production`, `ALLOW_INSECURE_LOCAL_HTTP=false`, the appropriate `HOST` and `PORT`, and `DATABASE_PATH` to a private persistent volume.
4. Put the process behind a trusted HTTPS reverse proxy. Set `TRUST_PROXY=1` only if exactly one known proxy is the only route to the API. Incorrect proxy trust can weaken IP rate limiting.
5. Run `npm start` from the project root under a process manager supplied by the hosting environment.
6. Check `/api/health`, register a fictional test account, create/edit a record, restart and verify it persists. Inspect that the login cookie is Secure and HttpOnly over HTTPS.

Leave demo disabled if it is unnecessary. If enabled, visitors create separate database rows; run `npm run prune:demo` periodically to remove demo accounts older than seven days. Expired sessions are cleared at startup and hourly while the server is running.

Deployment pricing, availability, sleep limits and data retention depend on the hosting provider. No free or permanent uptime guarantee is part of this project. A provider must support this runtime and persistent disk before using it for saved personal data.

## Backup and recovery

SQLite WAL mode may keep committed changes in the `-wal` companion file. Copying only the main database while writes are running can omit recent changes.

For a straightforward private backup:

1. Stop the Node process cleanly so the database closes.
2. Copy the database and any remaining `-wal`/`-shm` companion files together to private backup storage.
3. Restart and verify health.

An SQLite-aware online backup mechanism is preferable when uninterrupted service is needed; this repository does not implement one. Before restoration, stop the process, preserve the current files, replace them with the matched backup set, then restart and check account access and record counts. Do not commit account databases or backups to GitHub.

## Production preview on your own computer

Build once, set the loopback-only preview variables from the README, then start. `ALLOW_INSECURE_LOCAL_HTTP=true` is accepted only for a loopback origin and loopback bind, and turns off Secure cookies and CSP's automatic HTTPS upgrade for that local HTTP preview. The other CSP directives, browser security headers and production build remain enabled.

Do not expose this preview through a tunnel or reuse its insecure-cookie exception for a public site. An HTTPS deployment does not need the exception.

## Before extending the system

- Add versioned migrations before changing a deployed schema; initialization currently creates version 1 tables only.
- Implement email verification and recovery before treating accounts as a supported public service.
- Use a shared rate-limit store and another database architecture before adding multiple Node instances.
- Define retention and user deletion policies before collecting real application histories.
- Review authorization and add behavior tests for every new owner-related route.
