// ──────────────────────────────────────────────────────
//  main.js — DodoPayments checkout integration
// ──────────────────────────────────────────────────────

(function () {
  // ── CONFIG — fill these in before going live ──
  const DODO_PRODUCT_ID    = 'YOUR_DODO_PRODUCT_ID'; // replace with your actual product ID
  const SUCCESS_URL        = window.location.origin + '/thank-you.html';
  const DODO_MODE          = 'live'; // 'test' | 'live'
  // ──────────────────────────────────────────────

  function launchCheckout() {
    // DodoPayments JS SDK — loaded via CDN in index.html
    if (typeof Dodo === 'undefined') {
      console.error('DodoPayments SDK not loaded');
      return;
    }

    Dodo.checkout({
      productId:  DODO_PRODUCT_ID,
      mode:       DODO_MODE,
      successUrl: SUCCESS_URL,
      // Optional: prefill customer details if you collect them
      // customer: { email: '', name: '' },
    });
  }

  // Wire up all CTA buttons
  document.querySelectorAll('[data-cta]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      launchCheckout();
    });
  });
})();
