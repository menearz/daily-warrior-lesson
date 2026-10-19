# Daily Warrior subscription API

Small node:http service (one dependency: `stripe`). It is meant to be deployed by Harbor at `https://dw-api.arbiterresearch.net`. **Nothing is deployed yet.**

## Live mode off: Ancilla payouts paused
`src/config.js` sets `LIVE_MODE_OFF = true`. Startup is refused (exit 1) if `DW_STRIPE_SECRET_KEY` is `sk_live_`/`rk_live_` or isn't `sk_test_`. Live-mode webhook events are ignored. To turn live mode on, someone has to change the code in a PR.

## Env (only DW_* vars are read)
DW_API_HOST, DW_API_PORT, DW_STORE_PATH (JSON store, atomic writes, 0600), DW_ALLOWED_ORIGIN (default https://menearz.github.io), DW_SITE_URL,
DW_STRIPE_SECRET_KEY (sk_test_ only), DW_STRIPE_WEBHOOK_SECRET, DW_STRIPE_PRICE_MONTHLY / DW_STRIPE_PRICE_YEARLY (price ids; if unset, inline prices are used),
DW_PRICE_MONTHLY_CENTS=499, DW_PRICE_YEARLY_CENTS=3999,
DW_AGENTMAIL_API_KEY, DW_AGENTMAIL_INBOX_ID, DW_MAIL_FROM,
DW_PAYWALL_ENABLED (default off: unset, `0`, or `false`. `1` / `true` / `yes` / `on` turns subscriber gating back on).

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

## Paywall flag (default off while testing)

`DW_PAYWALL_ENABLED` defaults off. Any signed-in account then gets the daily lesson, the 12 Forge questions, and a personalized lesson, with no plan. Stripe checkout, the portal, and webhooks stay in place; set the flag to `1` to restore the subscriber gate (402 `plan_required` without an active plan, owner, tester, or loopback test override). `GET /health` includes `paywallEnabled`. The site twin is `window.DW_PAYWALL_ENABLED` in the root `config.js` (default `false`), which hides plan and subscribe entry points. It does not show a "coming soon" stand-in.

## Reading history

`POST /me/history` with `{date: "YYYY-MM-DD"}` records one lesson read on the signed-in account (any account, paywall on or off). `GET /me/history` returns `{reads: [...]}` for that account only. Answers, the forged path, and these dates live on the user row. The phone is not the source of truth.

## Subscribers: questionnaire, profile, personalized lessons (2026-10-14)

With `DW_PAYWALL_ENABLED=1`, free readers get the shared daily lesson only. The 12 Forge questions are
subscriber-only: `GET /questionnaire`, `PUT /me/answers` and `GET /me/lesson`
answer 402 unless the account is entitled, which means a Stripe TEST
subscription marked active by the signed webhook, or an email on
`DW_TEST_OVERRIDE_EMAILS` (local testing only; refuses to start unless the
site URL is loopback and DW_LAUNCH is off). With the paywall off, those three routes succeed for every signed-in account.

- `GET/PUT /me/profile`: language (en/es), up to 3 themes (lanes), delivery
  time (HH:MM) and IANA timezone, plan, cancel date, the date answers will be
  deleted, the saved answers and the sent-lesson history.
- `GET /me/lesson[?date=]`: one real lesson from `lessons.json` (quote, source
  and link untouched), picked by themes (weight 3) and admired figures (weight
  1), never one already sent, plus one "today" line aimed at an answer from
  questions 2 and 3, and the subscriber's own empty-chair words. English goes
  through `scripts/humanize.js` (humanizer-3.1.0 + fact guard); Spanish is
  linted. One lesson per day; it is logged to the history.
- Retention: when a plan ends, answers, themes and history are deleted 30
  days later by the hourly `runRetention` job.
- The API reads `../scripts/humanize.js` and `../lessons.json`, so Harbor must
  deploy the whole repo, not only `api/`.

## Daily lesson email (src/delivery.js)

Every minute (and at boot) the API emails each entitled subscriber with
answers, a delivery time and a timezone their personalized lesson, once per
local day, after their local clock reaches the delivery time. Sender is the
AgentMail inbox `dailywarrior@agentmail.to` (display name "Daily Warrior",
override with DW_LESSON_INBOX_ID; same DW_AGENTMAIL_API_KEY). A delivery row
is saved before each send, so restarts never double-send; mailer failures are
logged (no addresses) and retried up to 3 times that day.

## Free access: owners and testers (production-safe)

Separate from the loopback-only `DW_TEST_OVERRIDE_EMAILS`, these two lists
work in production:

- `DW_OWNER_EMAILS` (comma list). Default `menearz@gmail.com,menearz@yahoo.com`.
  Owners are fully entitled with no payment. `/me` says `entitledVia: owner`.
- `TESTER_EMAILS` (comma list). Empty by default. Testers are entitled with no
  payment; `/me/profile` returns `plan.status` and `planName` `tester`, and
  account.html shows a "Tester" / "Probador" badge.

Matching is trimmed and case-insensitive. Neither list ever calls Stripe:
`/billing/checkout` and `/billing/portal` answer 409 `free_access`. Cancel
dates and the 30-day answer deletion come only from Stripe webhooks, so they
apply to paying users only. Owners and testers also get the daily lesson email.
Removing an address from a list ends its free access on the next restart.
