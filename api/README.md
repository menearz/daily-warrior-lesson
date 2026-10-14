# Daily Warrior subscription API

Small node:http service (one dependency: `stripe`). It is meant to be deployed by Harbor at `https://dw-api.arbiterresearch.net`. **Nothing is deployed yet.**

## Live mode off: Ancilla payouts paused
`src/config.js` sets `LIVE_MODE_OFF = true`. Startup is refused (exit 1) if `DW_STRIPE_SECRET_KEY` is `sk_live_`/`rk_live_` or isn't `sk_test_`. Live-mode webhook events are ignored. To turn live mode on, someone has to change the code in a PR.

## Env (only DW_* vars are read)
DW_API_HOST, DW_API_PORT, DW_STORE_PATH (JSON store, atomic writes, 0600), DW_ALLOWED_ORIGIN (default https://menearz.github.io), DW_SITE_URL,
DW_STRIPE_SECRET_KEY (sk_test_ only), DW_STRIPE_WEBHOOK_SECRET, DW_STRIPE_PRICE_MONTHLY / DW_STRIPE_PRICE_YEARLY (price ids; if unset, inline prices are used),
DW_PRICE_MONTHLY_CENTS=499, DW_PRICE_YEARLY_CENTS=3999,
DW_AGENTMAIL_API_KEY, DW_AGENTMAIL_INBOX_ID, DW_MAIL_FROM.

## Auth
Sign-in is by magic link only. The token is SHA-256 hashed, is single use, expires after 15 min, and is rate limited (10/IP and 3/email per 15 min).
The primary auth is a bearer access token (15 min) plus a rotating refresh token (30 days). Reusing a refresh token revokes its whole token family.
An HttpOnly; Secure; SameSite=None cookie is also set, but only as a fallback. A real-Chromium test showed that cookie is dropped when third-party cookies are blocked.

## Entitlement and retention
The Forge questions and today's lesson are free. The 70/30 aimed feed and /sync need an active plan (no trial).
Stored per user: email, forged_path, read dates, language, plan status, and Stripe customer/sub ids.
An hourly job deletes answers and history 30 days after cancel.

## Stripe
Endpoints: POST /billing/checkout (subscription Checkout Session), POST /billing/portal, POST /stripe/webhook (signature verified, idempotent by event id). Events handled: checkout.session.completed and customer.subscription.updated/deleted.

## Still needed (Harbor)
DNS + TLS for dw-api.arbiterresearch.net, a process manager, a persistent store dir, a test-mode webhook endpoint registered at `/stripe/webhook`, and Zachary's sk_test / whsec / price ids.

## Tests
`npm test` (run with STRIPE_* unset).

## Launch flag and pending legal values
`DW_LAUNCH=1` turns on the customer launch. With it on, startup is refused unless all three of these are set. The code has **no defaults**. Zachary approved these production values on 2026-10-13; they are in `api/.env.example` and `api/deploy/dw-api.env.template`:
- `DW_SELLER_NAME='Ancilla Dynamic, LLC'` (seller line: "Daily Warrior is a product of Ancilla Dynamic, LLC.")
- `DW_SUPPORT_EMAIL=dailywarrior@agentmail.to`
- `DW_REFUND_POLICY=webcopy-2026-10-13` (Web Copy's refund policy)
- also `DW_MAIL_FROM='Daily Warrior <dailywarrior@agentmail.to>'`

The launch check passes with these values (test: `approved production values pass the launch check`).

`GET /legal` returns `{pending:true}` until all three are set. While pending, plans.html shows no refund or seller block, and no placeholder text is shown anywhere.

## Site launch flag vs API DW_LAUNCH
These two switches are the same idea on each side:
- **Site:** `window.DW_ACCOUNTS_OPEN` in the root `config.js` defaults to `false`. While false, the site hides every sign-in/plans/account entry point. Direct visits show a not-open-yet notice and make no API calls.
- **API:** `DW_LAUNCH=1` refuses to start unless seller, support and refund values are set.

To launch, set the API's `DW_LAUNCH=1` first (with the legal values), then flip the site flag.

`/health` reports `mail` as `agentmail` only when DW_AGENTMAIL_API_KEY and DW_AGENTMAIL_INBOX_ID are set. Otherwise it reports `unconfigured`, or `fake` in local runs.

## Yearly renewal reminder: Stripe sends it
We do not send renewal reminders ourselves; there is no reminder job or template here. In the Stripe Dashboard, under Settings → Billing → Subscriptions and emails, turn on **"Send emails about upcoming renewals"**. Do this in test mode now, and again in live mode later.

## Account delete
DELETE /me cancels the Stripe subscription right away, with no proration or refund, and deletes the account. Paid access ends that same day. privacy.html and the refund policy say the same thing, and tests cover it.

## Site "Send an idea" link
`window.DW_IDEA_FORM_URL` in the root `config.js` (an https Google Form URL). If it's empty, no link is shown.
