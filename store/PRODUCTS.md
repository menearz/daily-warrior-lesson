# Store product IDs

These IDs are the paid Forge unlock in the **apps**. They are not live listings. Zachary still has to create the products in Google Play Console and App Store Connect after he enrolls.

| Field | Value |
|---|---|
| Product ID (Play + App Store) | `forge_unlock` |
| Type | One-time / non-consumable in-app product |
| Suggested list price | **$12 USD** |
| What it unlocks | Applying The Forge path so the daily feed aims 70 / 30 |
| What stays free | Calendar daily lesson, archive, 988 crisis redirect |

Play Console product type: **Managed product** (one-time), product ID `forge_unlock`.

App Store Connect product type: **Non-Consumable**, product ID `forge_unlock`.

The Android app id and the iOS bundle id are both `com.menearz.dailywarrior`. Change that only if Apple or Google already issued that id to someone else.

Apple will reject Stripe (or any external checkout) for this digital unlock inside the iOS app. Use StoreKit. Play Billing is the matching path on Android.

The GitHub Pages site is not the store channel. Web can keep the free daily lesson. Do not merge PR #1 (Stripe Payment Link) as the go-to-market.
