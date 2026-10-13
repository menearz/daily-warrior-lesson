"use strict";

/**
 * Small in-memory fixed-window rate limiter (one Node process, no deps).
 * Counters reset on restart, which is fine for slowing down guessing and
 * mail spam on the magic-link routes. Ported from arbiter-research server/rateLimit.js.
 */

const net = require("net");

function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  if (!(limit > 0) || !(windowMs > 0)) {
    throw new Error("createRateLimiter needs limit > 0 and windowMs > 0");
  }
  const buckets = new Map(); // key -> { count, resetAt }
  let lastSweep = 0;

  function sweep(t) {
    if (t - lastSweep < windowMs && buckets.size < 10000) return;
    lastSweep = t;
    for (const [key, b] of buckets) {
      if (b.resetAt <= t) buckets.delete(key);
    }
  }

  /**
   * Count one attempt for `key`. Returns { allowed, remaining, retryAfterSec }.
   * Attempts over the limit are refused and do not extend the window.
   */
  function hit(key) {
    const t = now();
    sweep(t);
    const k = String(key || "");
    let b = buckets.get(k);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + windowMs };
      buckets.set(k, b);
    }
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - t) / 1000));
    if (b.count >= limit) {
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    b.count += 1;
    return { allowed: true, remaining: limit - b.count, retryAfterSec };
  }

  function reset() {
    buckets.clear();
  }

  return { hit, reset, limit, windowMs, _buckets: buckets };
}

function isLoopback(addr) {
  const a = String(addr || "");
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1" || a.startsWith("127.");
}

function cleanIp(raw) {
  let v = String(raw || "").trim();
  if (!v) return "";
  // "[::1]:443" or "1.2.3.4:5678" → host part only.
  const bracket = v.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) v = bracket[1];
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(v)) v = v.split(":")[0];
  return net.isIP(v) ? v : "";
}

/**
 * Best guess at the visitor's IP for rate limiting.
 * The app binds loopback behind Nginx (and Cloudflare), so the socket peer is
 * always 127.0.0.1 in production. Only when the peer is loopback do we read the
 * proxy headers: CF-Connecting-IP, then X-Real-IP, then the last X-Forwarded-For
 * hop (the one our own proxy appended). Direct connections use the socket address.
 */
function clientIp(req) {
  const peer = (req && req.socket && req.socket.remoteAddress) || "";
  if (isLoopback(peer)) {
    const h = (req && req.headers) || {};
    const cf = cleanIp(h["cf-connecting-ip"]);
    if (cf) return cf;
    const real = cleanIp(h["x-real-ip"]);
    if (real) return real;
    const xff = String(h["x-forwarded-for"] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const last = cleanIp(xff[xff.length - 1]);
    if (last) return last;
  }
  return String(peer || "unknown");
}

module.exports = { createRateLimiter, clientIp, isLoopback };
