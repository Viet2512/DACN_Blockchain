const {randomBytes, scryptSync, timingSafeEqual, randomUUID, createHash} = require('node:crypto');

const sessions = new Map();
const tokenHash = token => createHash('sha256').update(token).digest('hex');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function createSession(user) {
  const token = randomUUID();
  sessions.set(tokenHash(token), {user: {...user}, expiresAt: Date.now() + 8 * 60 * 60 * 1000});
  return token;
}

function getSession(token) {
  const session = token && sessions.get(tokenHash(token));
  if (!session) return null;
  if (session.expiresAt <= Date.now()) { sessions.delete(tokenHash(token)); return null; }
  return session.user;
}

function revokeUserSessions(username) {
  for (const [token, {user}] of sessions) {
    if (user.username === username) sessions.delete(token);
  }
}

function revokeSession(token) {
  if (token) sessions.delete(tokenHash(token));
}

module.exports = {tokenHash,hashPassword, verifyPassword, createSession, getSession, revokeSession, revokeUserSessions};
