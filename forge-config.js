/* Forge checkout — static site, Stripe Payment Link only.
   No Stripe.js, no backend, no live secret keys in this repo.

   Owner setup (one-time, in the Stripe Dashboard):
   1. Create a one-time Payment Link for $12 USD named "The Forge — aimed daily path".
   2. Set the success URL to:
      https://menearz.github.io/daily-warrior-lesson/forge.html?forge_paid=REPLACE_WITH_SUCCESS_TOKEN
      (use the same token you put in successToken below — change both before going live).
   3. Paste the Payment Link URL into paymentLink.
   4. Replace successToken with a random string you do not publish elsewhere.
      Anyone who can read this file can replay the success URL; that is the
      limit of a GitHub Pages checkout. Rotate the token if it leaks.

   Until paymentLink is replaced, the paywall explains that checkout is not live.
   You can still test the return path by opening:
      forge.html?forge_paid=REPLACE_WITH_SUCCESS_TOKEN
*/
window.FORGE_CONFIG = {
  priceUsd: 12,
  currency: "USD",
  productName: "The Forge — aimed daily path",
  paymentLink: "https://buy.stripe.com/test_REPLACE_WITH_YOUR_PAYMENT_LINK",
  successParam: "forge_paid",
  successToken: "REPLACE_WITH_SUCCESS_TOKEN",
  paidStorageKey: "forge_paid"
};
