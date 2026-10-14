'use strict';
/**
 * One-time tokens, ported from arbiter-research server/passwordReset.js:
 * 32 random bytes sent once as base64url; only the SHA-256 hex is stored;
 * constant-time compare over every row; single use; expiry.
 * Used for magic links (15 min), refresh tokens, access tokens and cookie sessions.
 */
const crypto = require('crypto');

const TOKEN_BYTES = 32;
const HASH_LEN = 64;

function hashToken(token) { return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex'); }
function newToken() { const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url'); return { token, tokenHash: hashToken(token) }; }
function looksLikeToken(t) { return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t); }
function hashesEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== HASH_LEN || y.length !== HASH_LEN) return false;
  return crypto.timingSafeEqual(x, y);
}

/** rows: object keyed by tokenHash is fast, but we keep the arbiter scan to stay constant-time. */
function findToken(rows, token, now = Date.now()) {
  const presented = hashToken(token);
  let match = null;
  for (const [id, row] of Object.entries(rows || {})) {
    if (hashesEqual(presented, row && row.tokenHash) && !match) match = { id, row };
  }
  if (!looksLikeToken(token) || !match) return { ok: false, reason: 'invalid' };
  if (match.row.usedAt) return { ok: false, reason: 'used', id: match.id, row: match.row };
  if (Number(match.row.expiresAt) <= now) return { ok: false, reason: 'expired', id: match.id, row: match.row };
  return { ok: true, id: match.id, row: match.row };
}

function pruneExpired(rows, now = Date.now(), keepUsedMs = 0) {
  let n = 0;
  for (const [id, row] of Object.entries(rows)) {
    if (Number(row.expiresAt) + keepUsedMs <= now) { delete rows[id]; n += 1; }
  }
  return n;
}

module.exports = { hashToken, newToken, looksLikeToken, findToken, pruneExpired };
