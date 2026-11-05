const {randomBytes, scryptSync, timingSafeEqual, randomUUID} = require('node:crypto');

const sessions = new Map();

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
  sessions.set(token, user);
  return token;
}

function getSession(token) {
  return token ? sessions.get(token) : null;
}

function revokeSession(token) {
  if (token) sessions.delete(token);
}

module.exports = {hashPassword, verifyPassword, createSession, getSession, revokeSession};
