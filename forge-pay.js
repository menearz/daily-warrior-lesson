(function (g) {
  var C = g.FORGE_CONFIG || {};

  function readPaid() {
    try {
      return JSON.parse(localStorage.getItem(C.paidStorageKey || "forge_paid") || "null");
    } catch (e) {
      return null;
    }
  }

  function isConfigured() {
    return !!(C.paymentLink && C.paymentLink.indexOf("REPLACE") === -1);
  }

  function isPaid() {
    var p = readPaid();
    return !!(p && C.successToken && p.token === C.successToken);
  }

  function markPaid(token) {
    try {
      localStorage.setItem(
        C.paidStorageKey || "forge_paid",
        JSON.stringify({ token: token, at: Date.now() })
      );
    } catch (e) {}
  }

  function captureReturn(search) {
    var params = new URLSearchParams(search || g.location.search);
    var token = params.get(C.successParam || "forge_paid");
    if (token && C.successToken && token === C.successToken) {
      markPaid(token);
      return true;
    }
    return false;
  }

  function checkout() {
    if (!isConfigured()) return false;
    g.location.href = C.paymentLink;
    return true;
  }

  g.ForgePay = {
    isPaid: isPaid,
    isConfigured: isConfigured,
    captureReturn: captureReturn,
    checkout: checkout,
    markPaid: markPaid,
    config: C
  };
})(window);
