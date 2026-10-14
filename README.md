# Daily Warrior's Lesson

One verifiable lesson each morning — Stoics, Scripture, history, Robert Greene, Homer. Full-width image. Never cropped.

The Forge is the upgrade path inside this same app. Free users get the daily lesson and the archive. Completing The Forge scores you into two source lanes and aims the feed 70 / 30 at who you said you want to become.

## Install

1. Open https://menearz.github.io/daily-warrior-lesson/ on your phone.
2. iPhone: Share → Add to Home Screen.
3. Android: menu → Install app / Add to Home screen.

## The Forge

Open The Forge from today's lesson. Twelve questions. Answers stay on your phone for now (localStorage). Accounts and billing come later. If answers look like a real crisis, the app points to 988 instead of a quote.

## Specs

See `INTAKE_SPEC.md` and `BRANDING.md` for scoring and visual rules.

## Guard

- `scripts/check-lessons.js` — validates lessons.json (JSON, no placeholders, unique dates, schema, no count drops).
- `scripts/add-lesson.js` — appends one lesson without rewriting the file. This is the only safe way to add a lesson.
- `.githooks/pre-push` — blocks pushes to main that fail the guard. Install with `git config core.hooksPath .githooks`.
