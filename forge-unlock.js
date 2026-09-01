/* Daily Warrior IAP gate.
 * Web / GitHub Pages: Forge apply stays a free preview.
 * Native Capacitor apps: Apply requires the one-time store product forge_unlock.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ForgeUnlock = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var PRODUCT_ID = 'forge_unlock';
  var ENTITLEMENT_KEY = 'forge_unlock_entitled';
  var SUGGESTED_USD = 12;
  var PURCHASE_TYPE_INAPP = 'inapp';

  function isNativePlatform(cap) {
    cap = cap || (typeof window !== 'undefined' ? window.Capacitor : null);
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  }

  function getPlugin(cap) {
    cap = cap || (typeof window !== 'undefined' ? window.Capacitor : null);
    if (!cap || !cap.Plugins) return null;
    return cap.Plugins.NativePurchases || null;
  }

  function readStorage(storage, key) {
    try {
      return storage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeStorage(storage, key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function hasLocalEntitlement(storage) {
    return readStorage(storage, ENTITLEMENT_KEY) === '1';
  }

  function grantLocalEntitlement(storage) {
    return writeStorage(storage, ENTITLEMENT_KEY, '1');
  }

  function clearLocalEntitlement(storage) {
    try {
      storage.removeItem(ENTITLEMENT_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  function purchaseMatchesForge(purchase) {
    if (!purchase) return false;
    var id = purchase.productIdentifier || purchase.productId || purchase.productID || purchase.identifier;
    if (id !== PRODUCT_ID) return false;
    if (purchase.isActive === false) return false;
    return true;
  }

  function purchasesIncludeForge(purchases) {
    if (!purchases || !purchases.length) return false;
    for (var i = 0; i < purchases.length; i++) {
      if (purchaseMatchesForge(purchases[i])) return true;
    }
    return false;
  }

  function applyAllowed(options) {
    options = options || {};
    var native = options.isNative === true;
    var entitled = options.entitled === true;
    if (!native) return true;
    return entitled;
  }

  function shouldAimFeed(options) {
    options = options || {};
    var hasPath = options.hasForgedPath === true;
    if (!hasPath) return false;
    return applyAllowed(options);
  }

  function displayPrice(product) {
    if (product && product.priceString) return product.priceString;
    if (product && product.price != null && product.currencyCode) {
      return String(product.price) + ' ' + product.currencyCode;
    }
    return null;
  }

  function displayTitle(product) {
    if (product && (product.title || product.displayName)) {
      return product.title || product.displayName;
    }
    return 'Forge Unlock';
  }

  async function refreshEntitlement(deps) {
    deps = deps || {};
    var storage = deps.storage;
    var plugin = deps.plugin;
    if (!plugin || typeof plugin.getPurchases !== 'function') {
      return hasLocalEntitlement(storage);
    }
    var result = await plugin.getPurchases({ productType: PURCHASE_TYPE_INAPP });
    var purchases = (result && (result.purchases || result.transactions)) || [];
    var ok = purchasesIncludeForge(purchases);
    if (ok) grantLocalEntitlement(storage);
    return ok || hasLocalEntitlement(storage);
  }

  async function purchaseForge(deps) {
    deps = deps || {};
    var storage = deps.storage;
    var plugin = deps.plugin;
    if (!plugin || typeof plugin.purchaseProduct !== 'function') {
      throw new Error('Store billing is not available on this device.');
    }
    var result = await plugin.purchaseProduct({
      productIdentifier: PRODUCT_ID,
      productType: PURCHASE_TYPE_INAPP,
      quantity: 1
    });
    grantLocalEntitlement(storage);
    return result;
  }

  async function restoreForge(deps) {
    deps = deps || {};
    var storage = deps.storage;
    var plugin = deps.plugin;
    if (plugin && typeof plugin.restorePurchases === 'function') {
      await plugin.restorePurchases();
    }
    return refreshEntitlement(deps);
  }

  async function loadProduct(deps) {
    deps = deps || {};
    var plugin = deps.plugin;
    if (!plugin) return null;
    if (typeof plugin.getProduct === 'function') {
      var one = await plugin.getProduct({
        productIdentifier: PRODUCT_ID,
        productType: PURCHASE_TYPE_INAPP
      });
      return (one && (one.product || one)) || null;
    }
    if (typeof plugin.getProducts === 'function') {
      var many = await plugin.getProducts({
        productIdentifiers: [PRODUCT_ID],
        productType: PURCHASE_TYPE_INAPP
      });
      var list = (many && many.products) || [];
      return list[0] || null;
    }
    return null;
  }

  function liveDeps() {
    var storage = null;
    try { storage = window.localStorage; } catch (e) { storage = null; }
    return {
      storage: storage,
      plugin: getPlugin(),
      isNative: isNativePlatform()
    };
  }

  async function ensureApplyAllowed() {
    var deps = liveDeps();
    if (!deps.isNative) return { allowed: true, source: 'web-preview' };
    if (hasLocalEntitlement(deps.storage)) return { allowed: true, source: 'local' };
    var ok = await refreshEntitlement(deps);
    return { allowed: ok, source: ok ? 'store' : 'none' };
  }

  function isForgedPathPresent() {
    try {
      var raw = window.localStorage.getItem('forged_path');
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      return !!(parsed && parsed.primary);
    } catch (e) {
      return false;
    }
  }

  function shouldAimFeedLive() {
    var native = isNativePlatform();
    var storage = null;
    try { storage = window.localStorage; } catch (e) { storage = null; }
    return shouldAimFeed({
      isNative: native,
      entitled: hasLocalEntitlement(storage),
      hasForgedPath: isForgedPathPresent()
    });
  }

  function userCancelled(err) {
    var msg = String((err && (err.message || err.code)) || err || '').toLowerCase();
    return msg.indexOf('cancel') !== -1 || msg.indexOf('user cancelled') !== -1;
  }

  function bindPaywall(ids) {
    ids = ids || {};
    var paywall = document.getElementById(ids.paywall || 'paywall');
    var titleEl = document.getElementById(ids.title || 'iapTitle');
    var priceEl = document.getElementById(ids.price || 'iapPrice');
    var errorEl = document.getElementById(ids.error || 'iapError');
    var buyBtn = document.getElementById(ids.buy || 'buyBtn');
    var restoreBtn = document.getElementById(ids.restore || 'restoreBtn');
    var backBtn = document.getElementById(ids.back || 'paywallBack');
    var onUnlocked = null;
    var onDismiss = null;

    function setError(text) {
      if (!errorEl) return;
      if (!text) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
        return;
      }
      errorEl.classList.remove('hidden');
      errorEl.textContent = text;
    }

    async function hydrate() {
      setError('');
      if (titleEl) titleEl.textContent = 'Forge Unlock';
      if (priceEl) priceEl.textContent = 'Loading the store price…';
      try {
        var product = await loadProduct(liveDeps());
        if (titleEl) titleEl.textContent = displayTitle(product);
        var price = displayPrice(product);
        if (priceEl) {
          priceEl.textContent = price
            ? ('One-time · ' + price)
            : 'One-time unlock. The store sets the live price.';
        }
      } catch (e) {
        if (priceEl) priceEl.textContent = 'One-time unlock. The store sets the live price.';
      }
    }

    async function buy() {
      setError('');
      if (buyBtn) buyBtn.disabled = true;
      try {
        await purchaseForge(liveDeps());
        if (onUnlocked) onUnlocked();
      } catch (e) {
        if (!userCancelled(e)) {
          setError(e && e.message ? e.message : 'Purchase did not complete.');
        }
      } finally {
        if (buyBtn) buyBtn.disabled = false;
      }
    }

    async function restore() {
      setError('');
      if (restoreBtn) restoreBtn.disabled = true;
      try {
        var ok = await restoreForge(liveDeps());
        if (ok) {
          if (onUnlocked) onUnlocked();
        } else {
          setError('No existing Forge purchase found for this store account.');
        }
      } catch (e) {
        setError(e && e.message ? e.message : 'Restore failed.');
      } finally {
        if (restoreBtn) restoreBtn.disabled = false;
      }
    }

    if (buyBtn) buyBtn.addEventListener('click', function () { buy(); });
    if (restoreBtn) restoreBtn.addEventListener('click', function () { restore(); });
    if (backBtn) backBtn.addEventListener('click', function () {
      if (paywall) paywall.classList.add('hidden');
      if (onDismiss) onDismiss();
    });

    return {
      show: function (opts) {
        onUnlocked = opts && opts.onUnlocked;
        onDismiss = opts && opts.onDismiss;
        if (paywall) paywall.classList.remove('hidden');
        hydrate();
      },
      hide: function () {
        if (paywall) paywall.classList.add('hidden');
      }
    };
  }

  return {
    PRODUCT_ID: PRODUCT_ID,
    ENTITLEMENT_KEY: ENTITLEMENT_KEY,
    SUGGESTED_USD: SUGGESTED_USD,
    PURCHASE_TYPE_INAPP: PURCHASE_TYPE_INAPP,
    isNativePlatform: isNativePlatform,
    hasLocalEntitlement: hasLocalEntitlement,
    grantLocalEntitlement: grantLocalEntitlement,
    clearLocalEntitlement: clearLocalEntitlement,
    purchasesIncludeForge: purchasesIncludeForge,
    applyAllowed: applyAllowed,
    shouldAimFeed: shouldAimFeed,
    shouldAimFeedLive: shouldAimFeedLive,
    displayPrice: displayPrice,
    displayTitle: displayTitle,
    refreshEntitlement: refreshEntitlement,
    purchaseForge: purchaseForge,
    restoreForge: restoreForge,
    loadProduct: loadProduct,
    ensureApplyAllowed: ensureApplyAllowed,
    bindPaywall: bindPaywall
  };
});
