# Daily Warrior's Lesson

One verifiable lesson each morning — Stoics, Scripture, history, Robert Greene, Homer. Full-width image. Never cropped.

Live PWA: https://menearz.github.io/daily-warrior-lesson/

The Forge is the upgrade path inside this same app. Free users get the daily lesson and the archive, and they can take the twelve-question Forge. Applying the 70 / 30 aimed feed is a **$12 USD one-time** Stripe Payment Link.

This site is built and maintained with AI assistance.

## Install

1. Open https://menearz.github.io/daily-warrior-lesson/ on your phone.
2. iPhone: Share → Add to Home Screen.
3. Android: menu → Install app / Add to Home screen.

## The Forge

Open The Forge from today's lesson. Twelve questions stay free. Answers stay on your phone (`localStorage.forged_path`). If answers look like a real crisis, the app points to [988](tel:988) / [findahelpline.com](https://findahelpline.com) instead of a quote.

**Apply to my daily lesson** is gated until paid. After Stripe returns you to this site, `localStorage.forge_paid` is set and the daily feed draws 70% from your primary lane and 30% from your secondary.

## Stripe Payment Link (owner setup)

This is a static GitHub Pages site. There is no backend and no Stripe.js. Do not put live secret keys in the repo.

1. In the Stripe Dashboard, create a **Payment Link** for a one-time **$12 USD** product named `The Forge — aimed daily path`.
2. Set the Payment Link **success URL** to:

   `https://menearz.github.io/daily-warrior-lesson/forge.html?forge_paid=REPLACE_WITH_SUCCESS_TOKEN`

3. Open `forge-config.js` and replace the two placeholders:

   - `paymentLink` — the `https://buy.stripe.com/...` URL Stripe gives you
   - `successToken` — the same string you put after `forge_paid=` on the success URL (use a random string before you go live)

4. Commit and push. Pages will serve the new config the way this repo already deploys.

Until `paymentLink` is replaced, the paywall says checkout is not live. You can still test the return path by opening:

`https://menearz.github.io/daily-warrior-lesson/forge.html?forge_paid=REPLACE_WITH_SUCCESS_TOKEN`

Anyone who can read `forge-config.js` can replay that success URL. That is the limit of a static-site checkout. Rotate `successToken` if it leaks. There is no merchant account in this repository and no live Stripe keys.

## Specs

See `INTAKE_SPEC.md` and `BRANDING.md` for scoring and visual rules.
