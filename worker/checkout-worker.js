/**
 * NS Strong — optional Stripe Checkout Worker (Cloudflare Workers free plan).
 * NOT deployed yet. Enables full multi-item cart checkout from the static site.
 *
 * Deploy (see README "Option B"):
 *   npx wrangler deploy worker/checkout-worker.js --name nss-checkout --compatibility-date 2026-11-01
 *   npx wrangler secret put STRIPE_SECRET_KEY --name nss-checkout
 * Then set checkout.mode = "worker" and checkout.workerUrl in assets/js/config.js.
 *
 * Prices are NEVER trusted from the browser: they are re-read from the live
 * data/products.json on the site, so nobody can edit their cart to pay less.
 */
const SITE = "https://nsstrongclothing.ca";
const FREE_SHIPPING_OVER_CENTS = 10000;   // $100.00 CAD
const STANDARD_SHIPPING_CENTS = 1200;     // TODO(Calvin): confirm flat shipping rate

const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin === SITE || origin === "https://www.nsstrongclothing.ca" ? origin : SITE,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (request.method !== "POST") return new Response("Not found", { status: 404 });
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
    try {
      const { items } = await request.json();
      if (!Array.isArray(items) || !items.length || items.length > 50) return json({ error: "Empty cart" }, 400);
      const catalog = (await (await fetch(`${SITE}/data/products.json`, { cf: { cacheTtl: 60 } })).json()).products;
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("success_url", `${SITE}/cart.html?checkout=success`);
      form.set("cancel_url", `${SITE}/cart.html?checkout=cancelled`);
      form.set("shipping_address_collection[allowed_countries][0]", "CA");
      form.set("phone_number_collection[enabled]", "true");
      // Uncomment if you enable Stripe Tax (extra Stripe fee) to auto-calculate GST/HST:
      // form.set("automatic_tax[enabled]", "true");
      let subtotal = 0;
      items.forEach((it, i) => {
        const p = catalog.find((x) => x.id === it.id);
        if (!p || !p.inStock) throw new Error(`Unavailable: ${it.id}`);
        if (!p.sizes.includes(it.size) || !p.colours.some((c) => c.name === it.colour)) throw new Error(`Bad variant: ${it.id}`);
        const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
        const cents = Math.round(p.price * 100);
        subtotal += cents * qty;
        form.set(`line_items[${i}][quantity]`, String(qty));
        form.set(`line_items[${i}][price_data][currency]`, "cad");
        form.set(`line_items[${i}][price_data][unit_amount]`, String(cents));
        form.set(`line_items[${i}][price_data][product_data][name]`, `${p.name} (${it.colour} / ${it.size})`);
        form.set(`line_items[${i}][price_data][product_data][metadata][product_id]`, p.id);
      });
      const ship = subtotal >= FREE_SHIPPING_OVER_CENTS ? 0 : STANDARD_SHIPPING_CENTS;
      form.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
      form.set("shipping_options[0][shipping_rate_data][display_name]", ship ? "Standard shipping (Canada)" : "Free shipping (Canada)");
      form.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(ship));
      form.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "cad");
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const session = await res.json();
      if (!res.ok) return json({ error: session.error?.message || "Stripe error" }, 502);
      return json({ url: session.url });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  },
};
