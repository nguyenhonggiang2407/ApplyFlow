import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export function token() {
  return randomBytes(32).toString('hex');
}
export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
// The fixed comparison target is only for equal-cost nonexistent-account checks.
const dummyHash = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
export async function verifyPassword(password: string, stored = dummyHash) {
  const [algorithm, salt, expected] = stored.split(':');
  if (
    algorithm !== 'scrypt' ||
    !/^[a-f0-9]{32}$/.test(salt ?? '') ||
    !/^[a-f0-9]{128}$/.test(expected ?? '')
  )
    return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
