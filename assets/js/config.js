/* =====================================================================
   NS STRONG STORE SETTINGS  —  edit this file to configure the store.
   ===================================================================== */
window.NSS_CONFIG = {
  // Show a "Test mode" banner site-wide while Stripe is in sandbox. Set false when going live.
  testMode: true,
  currency: "CAD",
  locale: "en-CA",

  // Free-shipping threshold shown in the banner and cart (CAD). Set 0 to hide.
  freeShippingThreshold: 100,

  /* -------- CHECKOUT ------------------------------------------------
     mode:
       "disabled"     -> cart works, checkout button shows "Checkout coming soon".
       "payment_link" -> each product (or colour/size variant) has its own Stripe
                         Payment Link in data/products.json. Works with one line item
                         in the cart at a time (Stripe limitation without a server).
       "worker"       -> full multi-item cart checkout. The cart is POSTed to a free
                         Cloudflare Worker (see /worker) that creates a Stripe Checkout
                         Session and redirects the shopper to Stripe.
     TODO(Calvin): create a Stripe account, then pick a mode below.        */
  checkout: {
    mode: "worker",
    workerUrl: "https://checkout.nsstrongclothing.ca"
  },

  /* -------- CONTACT --------------------------------------------------
     Public inbox hello@nsstrongclothing.ca is forwarded by Cloudflare Email
     Routing to the business destination. formEndpoint: optional free form
     service URL (e.g. Formspree / Web3Forms action URL). If empty, the
     contact form opens the visitor's email app using contactEmail.          */
  contactEmail: "hello@nsstrongclothing.ca",
  formEndpoint: "",

  // Social links (leave "" to hide). TODO(Calvin): add real profiles.
  social: { instagram: "", facebook: "", tiktok: "" }
};
