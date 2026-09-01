# Daily Warrior's Lesson

One verifiable lesson each morning — Stoics, Scripture, history, Robert Greene, Homer. Full-width image. Never cropped.

The Forge is the upgrade path inside this same app. Free users get the daily lesson and the archive. Completing The Forge scores you into two source lanes and aims the feed 70 / 30 at who you said you want to become.

This site is built and maintained with AI assistance.

## Install (web, free)

1. Open https://menearz.github.io/daily-warrior-lesson/ on your phone.
2. iPhone: Share → Add to Home Screen.
3. Android: menu → Install app / Add to Home screen.

The website is **not** the paid store channel. Zachary rejected a GitHub Pages Stripe button as the sales path. PR #1 (Stripe Payment Link) is not the go-to-market. Do not merge it to ship paid Forge.

## The Forge

Open The Forge from today's lesson. Twelve questions. Answers stay on your phone (`localStorage.forged_path`).

- **Web:** preview still applies the aimed feed so the questions can be tested.
- **iOS / Android apps:** Apply is an in-app purchase. Product ID `forge_unlock`, one-time, suggested **$12 USD**. Apple and Google set the live price. Restore Purchase is on the paywall.

If answers look like a real crisis, the app points to **988** (US) or findahelpline.com instead of a quote.

## Specs

See `INTAKE_SPEC.md` and `BRANDING.md` for scoring and visual rules. Product IDs: `store/PRODUCTS.md`.

---

# How this gets on Google Play and the App Store

There are **no live store listings** in this repo. Nobody submitted the app. The Capacitor projects and an Android build path are here so Zachary can upload after he enrolls.

## What you must pay and enroll

| Store | Who | Cost | What you get |
|---|---|---|---|
| Google Play | Zachary Menear | **$25 one-time** | Play Console, ability to create `com.menearz.dailywarrior` and the `forge_unlock` managed product |
| Apple Developer | Zachary Menear | **$99 / year** | App Store Connect, ability to create the iOS app + `forge_unlock` non-consumable |

This Linux workspace can assemble Android. It cannot archive an iOS IPA or upload to TestFlight. That still needs a Mac and Zachary's Apple ID.

## Identity (do not collide)

- Application ID / bundle ID: **`com.menearz.dailywarrior`**
- App name: Daily Warrior's Lesson
- IAP product ID: **`forge_unlock`** (same string on both stores)
- Type: one-time / non-consumable
- Suggested price: $12 USD

If Play or Apple already issued `com.menearz.dailywarrior` to someone else, pick another id and change `capacitor.config.json`, the Android `applicationId`, and the iOS `PRODUCT_BUNDLE_IDENTIFIER` together.

## Repo layout

The existing static PWA stays at the repo root so GitHub Pages keeps working. Capacitor copies those files into `www/` and the native shells.

```
npm install
npm test
npm run cap:sync
```

This is a Capacitor wrap of the current HTML. It is not a Forged Path React/Supabase rewrite.

## Android (this machine can build)

Needs JDK 17+ and the Android SDK. `scripts/write-local-properties.mjs` writes `android/local.properties` from `ANDROID_SDK_ROOT` or `ANDROID_HOME`.

Debug APK (sideload, no Play listing):

```
npm run android:debug
# android/app/build/outputs/apk/debug/app-debug.apk
```

Release AAB for Play upload:

1. Create **your** upload keystore. This repo will not invent a password.

```
STORE_PASSWORD='…' KEY_PASSWORD='…' ./scripts/create-upload-keystore.sh
```

That writes gitignored `android/upload-keystore.jks` and `android/keystore.properties`.

2. Then:

```
npm run android:bundle
# android/app/build/outputs/bundle/release/app-release.aab
```

If `keystore.properties` is missing, `bundleRelease` still runs and Gradle uses the **debug** signing config so the build path is testable. **Do not upload a debug-signed AAB to Play.** Play App Signing wants Zachary's upload key.

After first upload, add the upload-key SHA-256 to `.well-known/assetlinks.json` (it is empty on purpose until a real cert exists).

Play Console checklist (manual, by Zachary):

1. Pay $25 and create the app `Daily Warrior's Lesson`.
2. Package name `com.menearz.dailywarrior`.
3. Monetize → in-app products → managed product `forge_unlock` at $12.
4. Privacy policy URL: `https://menearz.github.io/daily-warrior-lesson/privacy.html`
5. Upload the signed AAB. Complete content rating, target audience, Data safety (no accounts; local answers only).
6. Internal testing track first. Production is a later human decision.

## iOS (Xcode project is here; upload is not)

`ios/` is a Capacitor Xcode project with StoreKit product wiring (`ios/App/App/ForgeUnlock.storekit`). This VM does not submit to App Store Connect.

On a Mac, after Apple Developer enrollment:

```
npm run cap:sync
npx cap open ios
```

Then Zachary:

1. Sign in with his team in Xcode.
2. Set the signing team on the App target. Bundle ID `com.menearz.dailywarrior`.
3. In Xcode scheme → Run → StoreKit Configuration, select `ForgeUnlock.storekit` for local IAP tests.
4. In App Store Connect: create the app, create non-consumable `forge_unlock` at $12, attach the privacy URL above.
5. Archive on the Mac → Upload to App Store Connect → TestFlight. Not done from this repo.

Apple will reject Stripe for this digital unlock inside the iOS app. Use StoreKit.

## What stays true in every channel

- Free daily lesson
- 988 / findahelpline.com crisis redirect — not a quote
- AI disclosure on the lesson, Forge, archive, and privacy pages
