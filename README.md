# NS Strong Clothing Company — online store

Static storefront for **nsstrongclothing.ca**, hosted free on **GitHub Pages** (managed by Open Stack Forge as IT provider). No server, no monthly platform fee. Payments are handed off to **Stripe** (pay-per-sale fees only).

- Live site: https://nsstrongclothing.ca (nsstrongclothing.com redirects here via Cloudflare)
- Hosting: GitHub Pages, deployed from the `main` branch root
- DNS: Cloudflare (free plan)

## What's in here

| Path | What it is |
|---|---|
| `data/products.json` | **The product catalogue.** Edit this to add/remove/change products. |
| `assets/js/config.js` | **Store settings:** checkout mode, Stripe worker URL, contact email, social links, free-shipping threshold. |
| `assets/js/store.js` | Cart (saved in the shopper's browser), product pages, catalogue filters, checkout handoff. |
| `assets/css/style.css` | All styling (brand colours at the top). |
| `src/*.html` | Page content (home, about, policies, etc.). |
| `tools/build_pages.py` | Wraps `src/` pages in the shared header/footer and writes the root `*.html` + `sitemap.xml`. |
| `tools/make_images.py` | Generates the SVG placeholder art for the sample products. |
| `worker/checkout-worker.js` | Optional Cloudflare Worker for full multi-item Stripe Checkout (free tier). |
| `CNAME` | Custom domain for GitHub Pages. Don't delete. |

## Brand

- Logo, favicons and social images come from the NS Strong brand kit (master files: the **NS Strong Clothing Brand** folder on OneDrive).
- Colours (CSS variables at the top of `assets/css/style.css`): Atlantic Navy `#0B2545`, Harbour Blue `#1F6FB2`, Lobster Red `#C8102E`, Bone White `#F2EFE8`, Fog Grey `#9AA5B1`, Sky Tint `#9CC9F0`, Sea Glass `#7FB8A4`, Beacon Gold `#F4B942`, Granite Ink `#14171A`.
- Fonts: Barlow Condensed (headings) and Inter (text), self-hosted in `assets/fonts/` (SIL Open Font License, no Google requests).
- Lifestyle photos: `assets/img/brand/` (WebP). Product mockups: `assets/img/products/*.webp` (AI-generated sample art; replace with real photos before launch). The old `*.svg` product placeholders are no longer used.

## Add or edit products

1. Open `data/products.json` (you can edit it right on GitHub with the pencil icon).
2. Copy an existing product block and change the fields:
   - `id` — unique, lowercase, dashes (used in the URL: `product.html?id=your-id`)
   - `name`, `category` (categories create the Shop filters automatically), `description`, `details` (bullet list)
   - `price` — CAD, before tax, e.g. `34.99`
   - `sizes` — e.g. `["S","M","L","XL"]` or `["One Size"]`
   - `colours` — `{ "name": "Atlantic Navy", "hex": "#0b2545", "image": "assets/img/products/my-photo-navy.jpg" }`
   - `images` — first image is used on product cards
   - `inStock` — `false` shows "Sold out"
   - `featured` — `true` shows it on the home page
   - `sample` — **delete this line (or set false) for real products** (it shows a "Sample" badge)
   - `paymentLink` / `paymentLinks` — only for checkout Option A (below)
3. Put product photos in `assets/img/products/` (square JPG/WebP, ~1200×1200, under ~300 KB).
4. Commit. GitHub Pages republishes in about a minute. No build step is needed for product changes.
5. Optional, for SEO: run `python3 tools/build_pages.py` so `sitemap.xml` lists the new product.

> The six products shipped now are **samples with placeholder art**. Replace them with real products and photos before launch.

## Set up checkout (Stripe)

Until checkout is configured, `checkout.mode` is `"disabled"`: the cart works, and the Checkout button says **"Checkout coming soon."**

First, create a free Stripe account at https://dashboard.stripe.com/register (business in Canada, currency CAD) and finish account verification. Stripe charges per transaction only (no monthly fee).

### Option A: Stripe Payment Links (simplest, no code)
Best while you have just a few products. Limitation: one cart line per checkout.
1. In Stripe: **Products → Add product** (name, price in CAD). For each size/colour you want to track, either make one product with a custom field, or a separate product.
2. **Payment Links → New**, choose the product, enable "Collect shipping address" (Canada), "Let customers adjust quantity", and set the after-payment redirect to `https://nsstrongclothing.ca/thank-you.html`.
3. Paste the link into the product in `data/products.json`:
   - one link for the whole product: `"paymentLink": "https://buy.stripe.com/..."`
   - or per variant: `"paymentLinks": { "M|Atlantic Navy": "https://buy.stripe.com/...", "Fog Grey": "https://buy.stripe.com/..." }` (keys are `Size|Colour` or just `Colour`)
4. In `assets/js/config.js` set `checkout.mode: "payment_link"`.

### Option B: Full cart checkout via Cloudflare Worker (recommended, still free)
Shopify-style: customers check out the whole cart at once.
1. Install Node.js, then from this folder:
   ```bash
   npx wrangler login
   npx wrangler deploy worker/checkout-worker.js --name nss-checkout --compatibility-date 2026-11-01
   npx wrangler secret put STRIPE_SECRET_KEY --name nss-checkout   # paste your Stripe secret key (sk_live_...)
   ```
2. Optional: give it a nice address (Cloudflare → Workers → nss-checkout → Settings → Domains & Routes → add `checkout.nsstrongclothing.ca`).
3. In `assets/js/config.js` set `checkout.mode: "worker"` and `checkout.workerUrl` to the Worker URL.
4. Check the shipping rate constants at the top of the worker. Test first with a Stripe **test** key (`sk_test_...`) and card `4242 4242 4242 4242`.

The worker re-reads prices from the live `products.json`, so shoppers can't tamper with prices. **Never** put a Stripe secret key in this repo; it's public.

**Taxes:** We are not currently registered for GST/HST, and Stripe Tax is off, so checkout does not add sales tax. Stripe can calculate GST/HST automatically with Stripe Tax (extra per-transaction fee); uncomment `automatic_tax` in the worker once you register and enable it. Ask your accountant when you need to register for GST/HST (the small-supplier threshold is $30,000 in sales over four quarters).

## Contact form

In `assets/js/config.js`:
- `contactEmail` — **TODO:** set your public business email. The form then opens the customer's email app pre-filled.
- `formEndpoint` — optional: a free form service (e.g. Formspree or Web3Forms) for submissions without an email app.

Do **not** put a home/street address on the website.

## Edit pages

Edit the page in `src/` (e.g. `src/about.html`), then run:
```bash
python3 tools/build_pages.py
```
and commit both the `src/` file and the generated root `.html` file. The header, footer and cart drawer live in `tools/build_pages.py` (`LAYOUT`).

## Deploy

GitHub Pages publishes the `main` branch root automatically on every push. Preview locally:
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Domains / DNS (Cloudflare)

- `nsstrongclothing.ca`: apex A/AAAA → GitHub Pages (185.199.108-111.153 / 2606:50c0:8000-8003::153), `www` CNAME → `open-stack-forge.github.io`. Set to DNS only (grey cloud) so GitHub can issue and renew the HTTPS certificate.
- `nsstrongclothing.com`: proxied placeholder records + a Cloudflare Redirect Rule → `https://nsstrongclothing.ca` (301, keeps the path).
- Email routing (MX/SPF/DKIM) records on both domains are untouched.

## Policies

Shipping & Returns, Privacy Policy and Terms of Sale are reasonable starting templates for a Nova Scotia online retailer. Review them (return window, shipping times/rates, exact registered company name) before taking real orders.

## Fulfilment (Printful, print-on-demand)

Paid Stripe checkouts are turned into Printful orders by the `nsstrong-checkout` Worker (`worker/checkout-worker.js`, config in `worker/wrangler.toml`).

- `POST /webhooks/stripe`: Stripe `checkout.session.completed` (signature-verified) → Printful order, then (if Resend is on) a customer order-confirmation email. Orders are created as **drafts** unless the event is live, the Stripe key is live, `PRINTFUL_AUTO_CONFIRM = "true"`, and every cart line is mapped. Duplicate deliveries are ignored (Printful `external_id`) and do not re-send the confirmation email.
- `GET /order?session_id=`: returns a paid order's reference, items and totals for the thank-you page (no secrets).
- `POST /webhooks/printful/<secret>`: `package_shipped` → shipping email to the customer (needs the `RESEND_API_KEY` secret); `order_failed` / `order_canceled` / `order_put_hold` → alert to `OWNER_EMAIL`.
- `GET /health`: shows which pieces are configured (true/false only).
- `data/fulfillment.json`: maps each product/colour/size to a Canada-fulfilled Printful variant, print placement and print file (`assets/print/`). Products or colours missing there are not auto-fulfilled; the draft is created without them and flagged.
- Secrets live only in Cloudflare: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRINTFUL_API_TOKEN`, `PRINTFUL_WEBHOOK_TOKEN`, `RESEND_API_KEY`. Never commit them.
- Deploy: `cd worker && npx wrangler deploy`.

## Customer emails (Resend) — ready, not switched on

Order confirmation and shipping emails are already implemented in the Worker and stay off until a `RESEND_API_KEY` secret is present (`EMAIL_ENABLED` is already `"true"` in `worker/wrangler.toml`). `GET /health` reports `email: true` once the key is in place. No code change is required to switch them on.

To turn emails on:

1. **Resend API key.** Create a Resend account, then an API key. Add it as a Cloudflare Worker secret named `RESEND_API_KEY` on `nsstrong-checkout` (Workers & Pages → nsstrong-checkout → Settings → Variables and Secrets → Add → Type Secret). Do not put it in this repo.
2. **Sending domain DNS** (IT Admin; do **not** replace existing mail records). The Worker sends from `orders@nsstrongclothing.ca` (`EMAIL_FROM`) with `reply_to` `hello@nsstrongclothing.ca`. In Resend, add and verify `nsstrongclothing.ca`. Resend will show exact records; typically:
   - One or more **CNAME or TXT DKIM** records (for example `resend._domainkey`) — add these; do not change the existing Cloudflare Email Routing DKIM (`cf2024-1._domainkey`).
   - **SPF:** the domain already has `v=spf1 include:_spf.mx.cloudflare.net ~all`. **Merge** Resend's include into that same TXT record (do not create a second SPF record and do not drop Cloudflare's include), e.g. `v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all` (use the include Resend displays).
   - **MX records must stay as they are** so Cloudflare Email Routing keeps receiving mail at this domain. Resend is used only for sending; it does not need the MX to change.
   - Optional: a DMARC TXT on `_dmarc` if you do not already have one.

After the domain is verified and the secret is set, the next paid checkout will send a confirmation (order number, items, total) and later a shipping email when Printful marks the package shipped. Existing test orders are not replayed.
