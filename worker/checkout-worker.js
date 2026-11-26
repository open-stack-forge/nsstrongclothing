/**
 * NS Strong — checkout + fulfilment Worker (Cloudflare Workers free plan).
 * Deployed as `nsstrong-checkout` on https://checkout.nsstrongclothing.ca
 *
 * Routes
 *   POST /                         create a Stripe Checkout Session from the cart (browser, site origin only)
 *   POST /webhooks/stripe          Stripe `checkout.session.completed` -> Printful order (DRAFT unless explicitly enabled)
 *   POST /webhooks/printful/<tok>  Printful `package_shipped` etc. -> customer shipping email (Resend), owner alerts
 *   GET  /health                   which integrations are configured (booleans only, never values)
 *
 * Secrets (Cloudflare dashboard or `wrangler secret put`, NEVER in this public repo)
 *   STRIPE_SECRET_KEY        restricted key (Checkout Sessions write)
 *   STRIPE_WEBHOOK_SECRET    whsec_... signing secret of the Stripe webhook endpoint
 *   PRINTFUL_API_TOKEN       Printful private token (store-level)
 *   PRINTFUL_WEBHOOK_TOKEN   random string that forms the secret Printful webhook path
 *   RESEND_API_KEY           (optional) enables shipping / alert emails
 * Plain vars (worker/wrangler.toml)
 *   PRINTFUL_AUTO_CONFIRM    "true" to send LIVE paid orders straight to production. Anything else = drafts only.
 *   EMAIL_FROM, OWNER_EMAIL, EMAIL_ENABLED
 *
 * Safety: an order is only ever confirmed (= charged by Printful and printed) when ALL of these hold:
 *   Stripe event livemode === true, the Stripe key is a live key, PRINTFUL_AUTO_CONFIRM === "true",
 *   and every cart line mapped to a Printful variant. Otherwise a draft is created for manual review.
 *
 * Prices are NEVER trusted from the browser: they are re-read from the live data/products.json.
 */
const SITE = "https://nsstrongclothing.ca";
const FREE_SHIPPING_OVER_CENTS = 10000;   // $100.00 CAD
const STANDARD_SHIPPING_CENTS = 1200;     // TODO(Calvin): confirm flat shipping rate
const PRINTFUL_API = "https://api.printful.com";
const STRIPE_TOLERANCE_SECONDS = 300;

const cors = () => ({
  "Access-Control-Allow-Origin": SITE,
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});
const jsonResponse = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...extra } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/") return await handleCheckout(request, env);
      if (path === "/health" && request.method === "GET") return health(env);
      if (path === "/webhooks/stripe" && request.method === "POST") return await handleStripeWebhook(request, env, ctx);
      if (path.startsWith("/webhooks/printful/") && request.method === "POST") return await handlePrintfulWebhook(request, env, path, ctx);
      return new Response("Not found", { status: 404 });
    } catch (e) {
      console.error("unhandled", e && e.stack || e);
      return jsonResponse({ error: "Internal error" }, 500);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */
async function handleCheckout(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
  if (request.method !== "POST") return new Response("Not found", { status: 404 });
  if (origin !== SITE) return jsonResponse({ error: "Forbidden origin" }, 403);
  const json = (obj, status = 200) => jsonResponse(obj, status, cors());
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: "Checkout is not configured. Add the STRIPE_SECRET_KEY secret in the Cloudflare dashboard (Workers & Pages → nsstrong-checkout → Settings → Variables and Secrets)." }, 503);
  }
  try {
    const { items } = await request.json();
    if (!Array.isArray(items) || !items.length || items.length > 40) return json({ error: "Empty cart" }, 400);
    const catalog = (await (await fetch(`${SITE}/data/products.json`, { cf: { cacheTtl: 60 } })).json()).products;
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", `${SITE}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${SITE}/cart.html?checkout=cancelled`);
    form.set("shipping_address_collection[allowed_countries][0]", "CA");
    form.set("phone_number_collection[enabled]", "true");
    form.set("metadata[nss_v]", "1");
    // Uncomment if you enable Stripe Tax (extra Stripe fee) to auto-calculate GST/HST:
    // form.set("automatic_tax[enabled]", "true");
    let subtotal = 0;
    items.forEach((it, i) => {
      const p = catalog.find((x) => x.id === it.id);
      if (!p || !p.inStock) throw new Error(`Unavailable: ${it.id}`);
      const col = p.colours.find((c) => c.name === it.colour);
      if (!col || !(col.sizes || p.sizes).includes(it.size)) throw new Error(`Bad variant: ${it.id}`);
      const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
      const cents = Math.round(p.price * 100);
      subtotal += cents * qty;
      form.set(`line_items[${i}][quantity]`, String(qty));
      form.set(`line_items[${i}][price_data][currency]`, "cad");
      form.set(`line_items[${i}][price_data][unit_amount]`, String(cents));
      form.set(`line_items[${i}][price_data][product_data][name]`, `${p.name} (${it.colour} / ${it.size})`);
      form.set(`line_items[${i}][price_data][product_data][metadata][product_id]`, p.id);
      // Compact fulfilment line, read back by the Stripe webhook: id|colour|size|qty|unitCents
      form.set(`metadata[i${i}]`, [p.id, it.colour, it.size, qty, cents].join("|").slice(0, 500));
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
}

function health(env) {
  return jsonResponse({
    ok: true,
    checkout: !!env.STRIPE_SECRET_KEY,
    stripeKeyMode: env.STRIPE_SECRET_KEY ? (isTestKey(env.STRIPE_SECRET_KEY) ? "test" : "live") : null,
    stripeWebhook: !!env.STRIPE_WEBHOOK_SECRET,
    printful: !!env.PRINTFUL_API_TOKEN,
    printfulWebhook: !!env.PRINTFUL_WEBHOOK_TOKEN,
    email: !!env.RESEND_API_KEY && env.EMAIL_ENABLED !== "false",
    autoConfirmLiveOrders: env.PRINTFUL_AUTO_CONFIRM === "true",
  });
}

const isTestKey = (k) => /^(sk|rk)_test_/.test(k || "");

/* ------------------------------------------------------------------ */
/* Stripe webhook -> Printful order                                    */
/* ------------------------------------------------------------------ */
async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return jsonResponse({ error: "Stripe webhook not configured" }, 503);
  const body = await request.text();
  const ok = await verifyStripeSignature(body, request.headers.get("Stripe-Signature") || "", env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return jsonResponse({ error: "Bad signature" }, 400);
  const event = JSON.parse(body);
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    return jsonResponse({ received: true, ignored: event.type });
  }
  const session = event.data.object;
  if (session.payment_status !== "paid") return jsonResponse({ received: true, ignored: "not paid yet" });
  if (!env.PRINTFUL_API_TOKEN) return jsonResponse({ error: "Printful not configured" }, 503); // Stripe retries
  const result = await createPrintfulOrder(session, event, env);
  if (result.error) {
    console.error("printful order failed", JSON.stringify(result));
    return jsonResponse({ error: result.error }, 502); // Stripe retries for up to 3 days
  }
  return jsonResponse({ received: true, ...result });
}

async function verifyStripeSignature(payload, header, secret) {
  const parts = Object.create(null);
  const v1 = [];
  for (const kv of header.split(",")) {
    const [k, v] = kv.split("=", 2);
    if (k === "v1") v1.push(v); else if (k) parts[k.trim()] = v;
  }
  const t = parseInt(parts.t, 10);
  if (!t || !v1.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > STRIPE_TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return v1.some((sig) => timingSafeEqual(sig, expected));
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(msg) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function printful(env, method, path, body) {
  const res = await fetch(PRINTFUL_API + path, {
    method,
    headers: { Authorization: `Bearer ${env.PRINTFUL_API_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, ok: res.ok, data };
}

/** Exported for local testing. */
export async function buildPrintfulOrder(session, event, env, mapping) {
  const lines = [];
  for (let i = 0; i < 40; i++) {
    const raw = session.metadata && session.metadata[`i${i}`];
    if (!raw) break;
    const [id, colour, size, qty, cents] = raw.split("|");
    lines.push({ id, colour, size, qty: parseInt(qty, 10) || 1, cents: parseInt(cents, 10) || 0 });
  }
  const items = [];
  const unmapped = [];
  for (const l of lines) {
    const prod = mapping.products && mapping.products[l.id];
    const variantId = prod && prod.variants[`${l.colour}|${l.size}`];
    const colourCfg = prod && prod.colours[l.colour];
    if (!variantId || !colourCfg) { unmapped.push(`${l.id} (${l.colour} / ${l.size}) x${l.qty}`); continue; }
    const tone = colourCfg.tone || "light";
    const files = (prod.placements || []).map((pl) => {
      const f = { type: pl.type, url: pl.art[tone] || pl.art.light };
      if (pl.position) f.position = { ...pl.position, limit_to_print_area: true };
      return f;
    });
    items.push({
      variant_id: variantId,
      quantity: l.qty,
      name: `${l.id} — ${l.colour} / ${l.size}`,
      retail_price: (l.cents / 100).toFixed(2),
      files,
      options: prod.options || [],
    });
  }
  const sd = (session.collected_information && session.collected_information.shipping_details) || session.shipping_details || {};
  const addr = sd.address || {};
  const cd = session.customer_details || {};
  const live = event.livemode === true && !isTestKey(env.STRIPE_SECRET_KEY);
  const confirm = live && env.PRINTFUL_AUTO_CONFIRM === "true" && unmapped.length === 0 && items.length > 0;
  const externalId = "ns" + (await sha256Hex(session.id)).slice(0, 30); // Printful external_id max 32 chars
  const order = {
    external_id: externalId,
    shipping: "STANDARD",
    recipient: {
      name: sd.name || cd.name || "Customer",
      address1: addr.line1 || "",
      address2: addr.line2 || undefined,
      city: addr.city || "",
      state_code: addr.state || "",
      country_code: addr.country || "CA",
      zip: addr.postal_code || "",
      phone: cd.phone || undefined,
      email: cd.email || undefined,
    },
    items,
    retail_costs: {
      currency: (session.currency || "cad").toUpperCase(),
      subtotal: ((session.amount_subtotal || 0) / 100).toFixed(2),
      shipping: (((session.shipping_cost && session.shipping_cost.amount_total) || 0) / 100).toFixed(2),
      tax: (((session.total_details && session.total_details.amount_tax) || 0) / 100).toFixed(2),
    },
    packing_slip: {
      email: env.OWNER_EMAIL || "hello@nsstrongclothing.ca",
      message: "Thanks for supporting NS Strong Clothing Co.!",
      store_name: "NS Strong Clothing Co.",
      custom_order_id: session.id.slice(-12),
    },
  };
  return { order, confirm, live, unmapped, lines };
}

async function createPrintfulOrder(session, event, env) {
  const mapping = await (await fetch(`${SITE}/data/fulfillment.json`, { cf: { cacheTtl: 60 } })).json();
  const { order, confirm, live, unmapped } = await buildPrintfulOrder(session, event, env, mapping);

  // Idempotency: Stripe can deliver the same event more than once.
  const existing = await printful(env, "GET", `/orders/@${order.external_id}`);
  if (existing.ok && existing.data && existing.data.result) {
    return { duplicate: true, printfulOrderId: existing.data.result.id, status: existing.data.result.status };
  }
  if (!order.items.length) {
    await notifyOwner(env, `Order needs manual fulfilment (${session.id})`,
      `No cart lines could be mapped to Printful. Unmapped: ${unmapped.join(", ")}. Stripe session: ${session.id}`);
    return { skipped: "no mappable items", unmapped };
  }
  const res = await printful(env, "POST", `/orders${confirm ? "?confirm=1" : ""}`, order);
  if (!res.ok) return { error: `Printful ${res.status}: ${res.data && (res.data.error && res.data.error.message || res.data.result) || "unknown"}` };
  const pfOrder = res.data.result;
  if (!confirm || unmapped.length) {
    await notifyOwner(env, `${live ? "" : "[TEST] "}Printful draft order ${pfOrder.id} needs review`,
      `A ${live ? "LIVE" : "test"} Stripe checkout created Printful DRAFT order ${pfOrder.id} (${pfOrder.status}).\n` +
      (unmapped.length ? `Unmapped lines to fulfil manually: ${unmapped.join(", ")}\n` : "") +
      `Review and confirm it in the Printful dashboard if it should be produced.\nStripe session: ${session.id}`);
  }
  return { printfulOrderId: pfOrder.id, status: pfOrder.status, confirmed: confirm, live, unmapped };
}

/* ------------------------------------------------------------------ */
/* Printful webhook -> customer email                                  */
/* ------------------------------------------------------------------ */
async function handlePrintfulWebhook(request, env, path) {
  const token = path.slice("/webhooks/printful/".length);
  if (!env.PRINTFUL_WEBHOOK_TOKEN || !timingSafeEqual(token, env.PRINTFUL_WEBHOOK_TOKEN)) return new Response("Not found", { status: 404 });
  const evt = await request.json().catch(() => null);
  if (!evt || !evt.type) return jsonResponse({ error: "Bad payload" }, 400);
  const orderId = evt.data && evt.data.order && evt.data.order.id;
  if (!orderId) return jsonResponse({ received: true, ignored: evt.type });
  // Never trust the payload: re-read the order from Printful with our token (proves it is ours).
  const fetched = await printful(env, "GET", `/orders/${orderId}`);
  if (!fetched.ok) return jsonResponse({ received: true, ignored: "unknown order" });
  const order = fetched.data.result;

  if (evt.type === "package_shipped") {
    const shipId = evt.data.shipment && evt.data.shipment.id;
    const shipment = (order.shipments || []).find((s) => s.id === shipId) || (order.shipments || []).slice(-1)[0];
    if (!shipment) return jsonResponse({ received: true, ignored: "no shipment" });
    const sent = await sendShippingEmail(env, order, shipment);
    return jsonResponse({ received: true, emailed: sent });
  }
  if (["order_failed", "order_canceled", "order_put_hold"].includes(evt.type)) {
    await notifyOwner(env, `Printful ${evt.type.replace("_", " ")}: order ${order.id}`,
      `Printful reported ${evt.type} for order ${order.id} (external ${order.external_id}). Reason: ${evt.data.reason || "n/a"}. Check the Printful dashboard.`);
    return jsonResponse({ received: true });
  }
  return jsonResponse({ received: true, ignored: evt.type });
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendShippingEmail(env, order, shipment) {
  const to = order.recipient && order.recipient.email;
  if (!to) return false;
  const first = (order.recipient.name || "").split(" ")[0] || "there";
  const items = (order.items || []).map((i) => `${i.quantity} × ${i.name}`);
  const track = shipment.tracking_url || "";
  const subject = "Your NS Strong order is on its way";
  const text = `Hi ${first},\n\nGood news: your NS Strong Clothing order has shipped.\n\n${items.join("\n")}\n\n` +
    `Carrier: ${shipment.carrier || ""} ${shipment.service || ""}\nTracking number: ${shipment.tracking_number || ""}\n` +
    (track ? `Track it: ${track}\n` : "") +
    `\nQuestions? Just reply to this email or write to hello@nsstrongclothing.ca.\n\nThanks for supporting NS Strong!\nNS Strong Clothing Co.\nhttps://nsstrongclothing.ca`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0b2545;max-width:560px">
<h2 style="font-family:'Barlow Condensed',Arial,sans-serif;letter-spacing:.5px">Your order is on its way</h2>
<p>Hi ${esc(first)},</p><p>Good news: your NS Strong Clothing order has shipped.</p>
<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<p><strong>Carrier:</strong> ${esc(shipment.carrier)} ${esc(shipment.service)}<br><strong>Tracking number:</strong> ${esc(shipment.tracking_number)}</p>
${track ? `<p><a href="${esc(track)}" style="background:#c8102e;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px">Track your package</a></p>` : ""}
<p>Questions? Just reply to this email or write to <a href="mailto:hello@nsstrongclothing.ca">hello@nsstrongclothing.ca</a>.</p>
<p>Thanks for supporting NS Strong!<br>NS Strong Clothing Co.</p></div>`;
  return sendEmail(env, { to, subject, text, html });
}

async function notifyOwner(env, subject, text) {
  console.log("owner-notice:", subject, "|", text);
  return sendEmail(env, { to: env.OWNER_EMAIL || "hello@nsstrongclothing.ca", subject, text });
}

async function sendEmail(env, { to, subject, text, html }) {
  if (!env.RESEND_API_KEY || env.EMAIL_ENABLED === "false") {
    console.log("email disabled (no RESEND_API_KEY); would send:", subject, "->", to ? "recipient" : "none");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "NS Strong Clothing <orders@nsstrongclothing.ca>",
      to: [to],
      reply_to: "hello@nsstrongclothing.ca",
      subject, text, ...(html ? { html } : {}),
    }),
  });
  if (!res.ok) console.error("resend error", res.status, await res.text());
  return res.ok;
}
