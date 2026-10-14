'use strict';
/**
 * Daily Warrior subscription API (plain node:http, one dependency: stripe).
 *
 *   POST /auth/magic      {email, lang}      email a one-time sign-in link (15 min)
 *   POST /auth/verify     {token}            redeem link -> access + refresh token (+ cookie)
 *   POST /auth/refresh    {refreshToken}     rotate refresh token, new access token
 *   POST /auth/logout
 *   GET  /me                                 account + plan; path/history only with a plan
 *   PUT  /me/lang         {lang}
 *   PUT  /sync            {forgedPath, reads} merge Forge answers + read dates (plan required)
 *   DELETE /me                               delete account and answers now
 *   POST /billing/checkout {plan}            Stripe Checkout Session (subscription, TEST mode)
 *   POST /billing/portal                     Stripe Customer Portal (cancel / change)
 *   POST /stripe/webhook                     signed Stripe events, idempotent
 *   GET  /health
 *   GET  /legal           seller/support/refund policy id, or {pending} until all are set
 *
 * LIVE MODE OFF: Ancilla payouts paused. See config.js.
 */
const http = require('http');
const { newToken, findToken, pruneExpired } = require('./tokens');
const { createRateLimiter, clientIp } = require('./rateLimit');
const { buildMagicLinkEmail } = require('./mail');
const { LIVE_MODE_OFF_REASON } = require('./config');

const LANES = ['warrior', 'thinker', 'builder', 'odyssey', 'power', 'faith'];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY = 32 * 1024;
const MAX_READS = 3650;
const ENTITLED = new Set(['active']);
const ENDED = new Set(['canceled', 'unpaid', 'incomplete_expired']);
const COOKIE = 'dw_sid';

function isEntitled(user) { return Boolean(user && user.plan && ENTITLED.has(user.plan.status)); }

function validForgedPath(fp) {
  if (!fp || typeof fp !== 'object' || Array.isArray(fp)) return false;
  if (!LANES.includes(fp.primary)) return false;
  if (fp.secondary != null && !LANES.includes(fp.secondary)) return false;
  if (!Number.isFinite(Number(fp.at))) return false;
  return JSON.stringify(fp).length <= 16 * 1024;
}
function cleanForgedPath(fp) {
  const out = { primary: fp.primary, secondary: fp.secondary || null, at: Number(fp.at) };
  if (fp.lanes && typeof fp.lanes === 'object') {
    out.lanes = {};
    for (const l of LANES) if (Number.isFinite(Number(fp.lanes[l]))) out.lanes[l] = Number(fp.lanes[l]);
  }
  if (fp.answers && typeof fp.answers === 'object') out.answers = fp.answers;
  return out;
}

/** Merge rule: the Forge result with the newer `at` wins; read dates are a union. */
function mergeSync(user, body) {
  if (body.forgedPath != null) {
    if (!validForgedPath(body.forgedPath)) return { error: 'bad_forged_path' };
    const incoming = cleanForgedPath(body.forgedPath);
    if (!user.forgedPath || Number(incoming.at) > Number(user.forgedPath.at)) user.forgedPath = incoming;
  }
  if (body.reads != null) {
    if (!Array.isArray(body.reads) || body.reads.length > MAX_READS) return { error: 'bad_reads' };
    const set = new Set(user.reads || []);
    for (const d of body.reads) if (typeof d === 'string' && DATE_RE.test(d)) set.add(d);
    user.reads = [...set].sort().slice(-MAX_READS);
  }
  return { ok: true };
}

/** Delete answers and history 30 days after a plan ends. Returns emails purged. */
function runRetention(store, now = Date.now()) {
  const purged = [];
  for (const u of Object.values(store.data.users)) {
    if (u.deleteDataAfter && Number(u.deleteDataAfter) <= now && !isEntitled(u)) {
      u.forgedPath = null; u.reads = []; u.deleteDataAfter = null;
      purged.push(u.email);
    }
  }
  pruneExpired(store.data.magicLinks, now);
  pruneExpired(store.data.accessTokens, now);
  pruneExpired(store.data.sessions, now);
  pruneExpired(store.data.refreshTokens, now);
  for (const [id, at] of Object.entries(store.data.stripeEvents)) if (Number(at) + 30 * 864e5 <= now) delete store.data.stripeEvents[id];
  store.save();
  return purged;
}

function periodEnd(sub) {
  const top = Number(sub && sub.current_period_end);
  if (top) return top * 1000;
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  return item && item.current_period_end ? Number(item.current_period_end) * 1000 : null;
}

function createApp({ config, store, mail, stripe, now = () => Date.now(), log = () => {} }) {
  const limits = {
    magicIp: createRateLimiter({ limit: 10, windowMs: 15 * 60e3, now }),
    magicEmail: createRateLimiter({ limit: 3, windowMs: 15 * 60e3, now }),
    verifyIp: createRateLimiter({ limit: 20, windowMs: 15 * 60e3, now }),
    refreshIp: createRateLimiter({ limit: 60, windowMs: 15 * 60e3, now }),
  };

  function send(res, status, body, headers = {}) {
    const data = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers));
    res.end(data);
  }

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && origin === config.allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    res.setHeader('Vary', 'Origin');
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too_large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  function json(buf) { if (!buf.length) return {}; try { const v = JSON.parse(buf.toString('utf8')); return v && typeof v === 'object' ? v : {}; } catch (_) { const e = new Error('bad_json'); e.status = 400; throw e; } }

  function cookieValue(req) {
    const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{43})`));
    return m ? m[1] : null;
  }
  function sessionCookie(token, maxAgeSec) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; ${config.cookieSecure ? 'Secure; ' : ''}SameSite=None; Max-Age=${maxAgeSec}`;
  }

  /** Bearer access token first, then the HttpOnly cookie session. */
  function authUser(req) {
    const h = String(req.headers.authorization || '');
    const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
    if (bearer) {
      const f = findToken(store.data.accessTokens, bearer, now());
      if (f.ok) return { user: store.user(f.row.email), via: 'bearer' };
      return null;
    }
    const c = cookieValue(req);
    if (c) {
      const f = findToken(store.data.sessions, c, now());
      if (f.ok) return { user: store.user(f.row.email), via: 'cookie' };
    }
    return null;
  }

  function issueTokens(email, family) {
    const t = now();
    const access = newToken();
    store.data.accessTokens[access.tokenHash.slice(0, 16)] = { tokenHash: access.tokenHash, email, expiresAt: t + config.accessTtlMs };
    const refresh = newToken();
    const fam = family || newToken().tokenHash.slice(0, 16);
    store.data.refreshTokens[refresh.tokenHash.slice(0, 16)] = { tokenHash: refresh.tokenHash, email, family: fam, expiresAt: t + config.refreshTtlMs, usedAt: null };
    return { accessToken: access.token, refreshToken: refresh.token, expiresIn: Math.round(config.accessTtlMs / 1000) };
  }

  function publicMe(u) {
    const entitled = isEntitled(u);
    const out = { email: u.email, lang: u.lang, entitled, plan: u.plan };
    if (entitled) { out.forgedPath = u.forgedPath; out.reads = u.reads; }
    else out.hasSavedPath = Boolean(u.forgedPath);
    return out;
  }

  async function handleWebhook(req, res) {
    const raw = await readBody(req);
    if (!stripe || !config.stripe.webhookSecret) return send(res, 503, { error: 'stripe_not_configured' });
    let event;
    try { event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], config.stripe.webhookSecret); }
    catch (err) { log('webhook signature failed'); return send(res, 400, { error: 'bad_signature' }); }
    if (event.livemode) return send(res, 400, { error: 'live_event_refused', reason: LIVE_MODE_OFF_REASON });
    if (store.data.stripeEvents[event.id]) return send(res, 200, { received: true, duplicate: true });
    const obj = event.data && event.data.object;
    const created = Number(event.created || 0) * 1000;
    let user = null;
    if (event.type === 'checkout.session.completed' && obj && obj.mode === 'subscription') {
      const email = obj.client_reference_id || (obj.metadata && obj.metadata.email) || (obj.customer_details && obj.customer_details.email);
      user = email ? store.user(email) : store.userByCustomer(obj.customer);
      if (user) {
        user.stripeCustomerId = obj.customer || user.stripeCustomerId;
        user.stripeSubscriptionId = obj.subscription || user.stripeSubscriptionId;
        if (obj.status === 'complete' && (obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required')) {
          user.plan = Object.assign({}, user.plan, { status: 'active', interval: (obj.metadata && obj.metadata.plan) || user.plan.interval, canceledAt: null });
          user.deleteDataAfter = null;
        }
      }
    } else if ((event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') && obj) {
      user = store.userByCustomer(obj.customer);
      if (user && (!user.plan.lastEventAt || created >= user.plan.lastEventAt)) {
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : obj.status;
        user.stripeSubscriptionId = obj.id;
        user.plan = Object.assign({}, user.plan, {
          status, cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end), currentPeriodEnd: periodEnd(obj), lastEventAt: created,
          interval: (obj.metadata && obj.metadata.plan) || user.plan.interval,
        });
        if (ENDED.has(status)) { user.plan.canceledAt = now(); user.deleteDataAfter = now() + config.retentionMs; }
        else if (ENTITLED.has(status)) { user.plan.canceledAt = null; user.deleteDataAfter = null; }
      }
    }
    store.data.stripeEvents[event.id] = now();
    store.save();
    log(`webhook ${event.type}${user ? ' applied' : ' no-user'}`);
    return send(res, 200, { received: true });
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const ip = clientIp(req);
    if (p === '/stripe/webhook' && req.method === 'POST') return handleWebhook(req, res);
    cors(req, res);
    if (req.method === 'OPTIONS') {
      return req.headers.origin === config.allowedOrigin ? send(res, 204) : send(res, 403, { error: 'origin' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin && req.headers.origin !== config.allowedOrigin) {
      return send(res, 403, { error: 'origin' });
    }
    if (p === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      return send(res, 200, { ok: true, stripeMode: 'test', liveModeOff: true, reason: LIVE_MODE_OFF_REASON, stripeConfigured: Boolean(stripe), mail: mail.name === 'fake' ? 'fake' : (mail.configured ? 'agentmail' : 'unconfigured') });
    }

    if (p === '/legal' && (req.method === 'GET' || req.method === 'HEAD')) {
      if (!config.legalComplete) return send(res, 200, { pending: true });
      return send(res, 200, { pending: false, sellerName: config.legal.sellerName, supportEmail: config.legal.supportEmail, refundPolicy: config.legal.refundPolicy });
    }

    if (p === '/auth/magic' && req.method === 'POST') {
      const body = json(await readBody(req));
      const email = String(body.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'bad_email' });
      const a = limits.magicIp.hit(ip); const b = limits.magicEmail.hit(email);
      if (!a.allowed || !b.allowed) return send(res, 429, { error: 'rate_limited' }, { 'Retry-After': String(Math.max(a.retryAfterSec, b.retryAfterSec)) });
      const lang = body.lang === 'es' ? 'es' : 'en';
      // One live link per email: a new request replaces the old one.
      for (const [id, r] of Object.entries(store.data.magicLinks)) if (r.email === email) delete store.data.magicLinks[id];
      const { token, tokenHash } = newToken();
      store.data.magicLinks[tokenHash.slice(0, 16)] = { tokenHash, email, lang, createdAt: now(), expiresAt: now() + config.magicLinkTtlMs, usedAt: null };
      store.save();
      const link = `${config.siteUrl}/signin.html#token=${token}`;
      const msg = buildMagicLinkEmail({ url: link, lang });
      const sent = await mail.send({ to: email, ...msg });
      log(`magic link ${sent.ok ? 'sent' : 'not sent'} via ${mail.name}`);
      if (!sent.ok) return send(res, 503, { error: 'mail_unavailable' });
      return send(res, 202, { sent: true, expiresInMinutes: 15 });
    }

    if (p === '/auth/verify' && req.method === 'POST') {
      if (!limits.verifyIp.hit(ip).allowed) return send(res, 429, { error: 'rate_limited' });
      const body = json(await readBody(req));
      const f = findToken(store.data.magicLinks, body.token, now());
      if (!f.ok) return send(res, 400, { error: f.reason === 'expired' ? 'link_expired' : f.reason === 'used' ? 'link_used' : 'link_invalid' });
      f.row.usedAt = now();
      const user = store.upsertUser(f.row.email, now());
      if (!user.lang || user.createdAt === now()) user.lang = f.row.lang || 'en';
      const tokens = issueTokens(user.email);
      const sess = newToken();
      store.data.sessions[sess.tokenHash.slice(0, 16)] = { tokenHash: sess.tokenHash, email: user.email, expiresAt: now() + config.sessionCookieTtlMs };
      store.save();
      return send(res, 200, Object.assign({ me: publicMe(user) }, tokens), { 'Set-Cookie': sessionCookie(sess.token, Math.round(config.sessionCookieTtlMs / 1000)) });
    }

    if (p === '/auth/refresh' && req.method === 'POST') {
      if (!limits.refreshIp.hit(ip).allowed) return send(res, 429, { error: 'rate_limited' });
      const body = json(await readBody(req));
      const f = findToken(store.data.refreshTokens, body.refreshToken, now());
      if (!f.ok) {
        if (f.reason === 'used' && f.row) {
          // Reuse of a rotated refresh token: revoke the whole family.
          for (const [id, r] of Object.entries(store.data.refreshTokens)) if (r.family === f.row.family) delete store.data.refreshTokens[id];
          store.save();
          return send(res, 401, { error: 'refresh_reused' });
        }
        return send(res, 401, { error: 'refresh_invalid' });
      }
      f.row.usedAt = now();
      const user = store.user(f.row.email);
      if (!user) return send(res, 401, { error: 'refresh_invalid' });
      const tokens = issueTokens(user.email, f.row.family);
      store.save();
      return send(res, 200, tokens);
    }

    const auth = authUser(req);
    if (p === '/auth/logout' && req.method === 'POST') {
      const body = json(await readBody(req));
      if (body.refreshToken) { const f = findToken(store.data.refreshTokens, body.refreshToken, now()); if (f.row) for (const [id, r] of Object.entries(store.data.refreshTokens)) if (r.family === f.row.family) delete store.data.refreshTokens[id]; }
      const c = cookieValue(req); if (c) { const f = findToken(store.data.sessions, c, now()); if (f.id) delete store.data.sessions[f.id]; }
      const h = String(req.headers.authorization || ''); if (h.startsWith('Bearer ')) { const f = findToken(store.data.accessTokens, h.slice(7), now()); if (f.id) delete store.data.accessTokens[f.id]; }
      store.save();
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0).replace('=;', '=deleted;') });
    }
    if (!auth || !auth.user) return send(res, 401, { error: 'signed_out' });
    const user = auth.user;

    if (p === '/me' && req.method === 'GET') return send(res, 200, Object.assign(publicMe(user), { authVia: auth.via }));
    if (p === '/me/lang' && req.method === 'PUT') {
      const body = json(await readBody(req));
      if (body.lang !== 'en' && body.lang !== 'es') return send(res, 400, { error: 'bad_lang' });
      user.lang = body.lang; store.save();
      return send(res, 200, publicMe(user));
    }
    if (p === '/sync' && req.method === 'PUT') {
      if (!isEntitled(user)) return send(res, 402, { error: 'plan_required' });
      const r = mergeSync(user, json(await readBody(req)));
      if (r.error) return send(res, 400, { error: r.error });
      store.save();
      return send(res, 200, publicMe(user));
    }
    if (p === '/me' && req.method === 'DELETE') {
      if (stripe && user.stripeSubscriptionId && user.plan && !ENDED.has(user.plan.status)) {
        try { await stripe.subscriptions.cancel(user.stripeSubscriptionId); } catch (err) { return send(res, 502, { error: 'stripe_cancel_failed' }); }
      }
      store.deleteUser(user.email); store.save();
      return send(res, 200, { deleted: true }, { 'Set-Cookie': sessionCookie('deleted', 0) });
    }
    if (p === '/billing/checkout' && req.method === 'POST') {
      if (!stripe) return send(res, 503, { error: 'stripe_not_configured' });
      const body = json(await readBody(req));
      const plan = config.plans[body.plan];
      if (!plan) return send(res, 400, { error: 'bad_plan' });
      if (isEntitled(user)) return send(res, 409, { error: 'already_subscribed' });
      if (!user.stripeCustomerId) {
        const c = await stripe.customers.create({ email: user.email, metadata: { app: 'daily-warrior' } });
        user.stripeCustomerId = c.id; store.save();
      }
      const lineItem = plan.priceId
        ? { price: plan.priceId, quantity: 1 }
        : { price_data: { currency: config.currency, unit_amount: plan.amount, recurring: { interval: plan.interval }, product_data: { name: config.productName } }, quantity: 1 };
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: user.stripeCustomerId,
        client_reference_id: user.email,
        line_items: [lineItem],
        success_url: `${config.siteUrl}/account.html?checkout=success`,
        cancel_url: `${config.siteUrl}/plans.html?checkout=cancel`,
        locale: user.lang === 'es' ? 'es' : 'en',
        metadata: { plan: body.plan, email: user.email },
        subscription_data: { metadata: { plan: body.plan } },
      });
      return send(res, 200, { url: session.url, id: session.id });
    }
    if (p === '/billing/portal' && req.method === 'POST') {
      if (!stripe) return send(res, 503, { error: 'stripe_not_configured' });
      if (!user.stripeCustomerId) return send(res, 400, { error: 'no_customer' });
      const s = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${config.siteUrl}/account.html` });
      return send(res, 200, { url: s.url });
    }
    return send(res, 404, { error: 'not_found' });
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      if (err && typeof err.type === 'string' && err.type.startsWith('Stripe')) {
        // Stripe API failure: say so (type/code/param only; never keys or ids).
        log(`stripe error ${err.type} code=${err.code || '-'} param=${err.param || '-'} status=${err.statusCode || '-'} ${req.method} ${req.url.split('?')[0]}`);
        if (!res.headersSent) send(res, 502, { error: 'stripe_error', stripeType: err.type, stripeCode: err.code || null });
        return;
      }
      log(`error ${err && err.message}`);
      if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'server_error' });
    });
  });
  return { server, limits };
}

module.exports = { createApp, runRetention, mergeSync, isEntitled, LANES };
