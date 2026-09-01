const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ForgeUnlock = require('../forge-unlock.js');

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

describe('product contract', () => {
  it('uses forge_unlock at a suggested $12 one-time', () => {
    assert.equal(ForgeUnlock.PRODUCT_ID, 'forge_unlock');
    assert.equal(ForgeUnlock.SUGGESTED_USD, 12);
    assert.equal(ForgeUnlock.PURCHASE_TYPE_INAPP, 'inapp');
  });
});

describe('applyAllowed / shouldAimFeed', () => {
  it('lets web preview apply without a store receipt', () => {
    assert.equal(ForgeUnlock.applyAllowed({ isNative: false, entitled: false }), true);
    assert.equal(ForgeUnlock.shouldAimFeed({ isNative: false, entitled: false, hasForgedPath: true }), true);
  });

  it('blocks native apply until entitled', () => {
    assert.equal(ForgeUnlock.applyAllowed({ isNative: true, entitled: false }), false);
    assert.equal(ForgeUnlock.shouldAimFeed({ isNative: true, entitled: false, hasForgedPath: true }), false);
    assert.equal(ForgeUnlock.applyAllowed({ isNative: true, entitled: true }), true);
    assert.equal(ForgeUnlock.shouldAimFeed({ isNative: true, entitled: true, hasForgedPath: true }), true);
  });

  it('does not aim the feed without a forged path', () => {
    assert.equal(ForgeUnlock.shouldAimFeed({ isNative: false, entitled: true, hasForgedPath: false }), false);
  });
});

describe('entitlement storage', () => {
  it('reads and writes the local entitlement flag', () => {
    const storage = memoryStorage();
    assert.equal(ForgeUnlock.hasLocalEntitlement(storage), false);
    ForgeUnlock.grantLocalEntitlement(storage);
    assert.equal(ForgeUnlock.hasLocalEntitlement(storage), true);
    ForgeUnlock.clearLocalEntitlement(storage);
    assert.equal(ForgeUnlock.hasLocalEntitlement(storage), false);
  });
});

describe('purchasesIncludeForge', () => {
  it('matches forge_unlock and ignores other products', () => {
    assert.equal(ForgeUnlock.purchasesIncludeForge([]), false);
    assert.equal(ForgeUnlock.purchasesIncludeForge([{ productIdentifier: 'other' }]), false);
    assert.equal(ForgeUnlock.purchasesIncludeForge([{ productIdentifier: 'forge_unlock' }]), true);
    assert.equal(ForgeUnlock.purchasesIncludeForge([{ productId: 'forge_unlock', isActive: false }]), false);
  });
});

describe('store display copy', () => {
  it('uses the store price string and never invents a live listing', () => {
    assert.equal(ForgeUnlock.displayPrice(null), null);
    assert.equal(ForgeUnlock.displayPrice({ priceString: '$12.00' }), '$12.00');
    assert.equal(ForgeUnlock.displayTitle({ title: 'Forge Unlock' }), 'Forge Unlock');
    assert.equal(ForgeUnlock.displayTitle({}), 'Forge Unlock');
  });
});

describe('refresh / purchase / restore', () => {
  it('grants entitlement when getPurchases returns forge_unlock', async () => {
    const storage = memoryStorage();
    const plugin = {
      getPurchases: async () => ({ purchases: [{ productIdentifier: 'forge_unlock' }] })
    };
    const ok = await ForgeUnlock.refreshEntitlement({ storage, plugin });
    assert.equal(ok, true);
    assert.equal(ForgeUnlock.hasLocalEntitlement(storage), true);
  });

  it('purchaseForge calls the native product and grants', async () => {
    const storage = memoryStorage();
    const calls = [];
    const plugin = {
      purchaseProduct: async (args) => { calls.push(args); return { transactionId: 't1' }; }
    };
    await ForgeUnlock.purchaseForge({ storage, plugin });
    assert.deepEqual(calls[0], {
      productIdentifier: 'forge_unlock',
      productType: 'inapp',
      quantity: 1
    });
    assert.equal(ForgeUnlock.hasLocalEntitlement(storage), true);
  });

  it('restoreForge uses restorePurchases then getPurchases', async () => {
    const storage = memoryStorage();
    const order = [];
    const plugin = {
      restorePurchases: async () => { order.push('restore'); },
      getPurchases: async () => {
        order.push('get');
        return { purchases: [{ identifier: 'forge_unlock' }] };
      }
    };
    const ok = await ForgeUnlock.restoreForge({ storage, plugin });
    assert.deepEqual(order, ['restore', 'get']);
    assert.equal(ok, true);
  });

  it('throws when billing plugin is missing', async () => {
    await assert.rejects(
      () => ForgeUnlock.purchaseForge({ storage: memoryStorage(), plugin: null }),
      /not available/
    );
  });
});
