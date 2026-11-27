"""Builds the site's HTML pages from src/*.html using one shared layout (header, footer, cart drawer).
Run after editing anything in src/:   python3 tools/build_pages.py
Each src page starts with a JSON comment:  <!--{"title": "...", "description": "...", "nav": "shop"}-->
Re-run after editing data/products.json too: it pre-renders /products/<id>/index.html (full content, meta, JSON-LD),
the shop/home product grids and sitemap.xml. The browser still re-reads data/products.json for the cart."""
import json, os, re, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://nsstrongclothing.ca"
BRAND = "NS Strong Clothing Co."
NAV = [("index.html", "Home", "home"), ("shop.html", "Shop", "shop"), ("about.html", "About", "about"), ("faq.html", "FAQ", "faq"), ("contact.html", "Contact", "contact")]

LAYOUT = """<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#0b2545">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="NS Strong Clothing Company">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:width" content="{og_w}">
<meta property="og:image:height" content="{og_h}">
<meta property="og:image:alt" content="{og_alt}">
<meta property="og:locale" content="en_CA">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{og_image}">
<meta name="twitter:image:alt" content="{og_alt}">
<link rel="alternate" hreflang="en-CA" href="{url}">
<link rel="alternate" hreflang="x-default" href="{url}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<link rel="stylesheet" href="assets/css/style.css?v={v_css}">
{robots}{head_extra}{jsonld}<script src="assets/js/config.js?v={v_cfg}" defer></script>
<script src="assets/js/store.js?v={v_js}" defer></script>
</head>
<body>
{test_banner}<a class="skip-link" href="#main">Skip to content</a>
<div class="announce" id="announce-text">Proudly Nova Scotian · Online store</div>
<header class="site-header">
  <div class="container header-inner">
    <a class="logo" href="index.html" aria-label="NS Strong Clothing Co. home"><img src="assets/img/logo.svg" alt="NS Strong Clothing Co." width="149" height="46"></a>
    <nav class="nav" id="site-nav" aria-label="Main">{nav}</nav>
    <div class="header-actions">
      <a class="icon-btn" href="cart.html" data-open-cart aria-label="Open cart">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
        <span class="cart-count" data-count="0">0</span>
      </a>
      <button class="icon-btn menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Menu">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </div>
  </div>
</header>
<main id="main">
{body}
</main>
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand"><img src="assets/img/logo-white.svg" alt="NS Strong Clothing Co." width="181" height="56">
        <p>Apparel built for the people who make Nova Scotia strong. Online only, shipped from Nova Scotia, Canada.</p></div>
      <div><h2>Shop</h2><ul><li><a href="shop.html">All products</a></li><li><a href="shop.html?category=Tees">Tees</a></li><li><a href="shop.html?category=Hoodies">Hoodies</a></li><li><a href="cart.html">Cart</a></li></ul></div>
      <div><h2>Help</h2><ul><li><a href="shipping-returns.html">Shipping &amp; Returns</a></li><li><a href="faq.html">FAQ</a></li><li><a href="contact.html">Contact</a></li></ul></div>
      <div><h2>Company</h2><ul><li><a href="about.html">About</a></li><li><a href="terms.html">Terms of Sale</a></li><li><a href="privacy.html">Privacy Policy</a></li></ul></div>
      <div><h2>Follow</h2><ul id="social-links"></ul></div>
    </div>
    <div class="footer-bottom"><span>&copy; <span id="year">{year}</span> NS Strong Clothing Company. Nova Scotia, Canada.</span><span>All prices in Canadian dollars (CAD).</span></div>
  </div>
</footer>
<div class="drawer-backdrop" data-close-cart></div>
<aside class="drawer" id="cart-drawer" aria-label="Shopping cart" aria-hidden="true" inert>
  <div class="drawer-head"><h2>Your cart</h2><button class="icon-btn" id="drawer-close" type="button" data-close-cart aria-label="Close cart">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  <div class="drawer-body" id="drawer-body" aria-live="polite"></div>
  <div class="drawer-foot">
    <div class="totals"><span>Subtotal</span><span id="drawer-subtotal">$0.00</span></div>
    <div class="totals"><span>Shipping</span><span id="drawer-shipping">—</span></div>
    <p class="small" id="drawer-note" style="margin:0"></p>
    <button class="btn btn-block" type="button" id="drawer-checkout" data-checkout disabled>Checkout</button>
    <p class="notice notice-info checkout-msg" role="status" hidden></p>
    <a class="small" href="cart.html" style="text-align:center">View full cart</a>
  </div>
</aside>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
</body>
</html>
"""

ORG_ID = SITE + "/#organization"
ORG_LD = {"@type": "OnlineStore", "@id": ORG_ID, "name": "NS Strong Clothing Company", "alternateName": "NS Strong Clothing Co.",
          "url": SITE + "/", "logo": SITE + "/icon-512.png", "image": SITE + "/assets/img/og-image.jpg",
          "description": "Online Nova Scotia apparel brand: tees, hoodies, crewnecks, hats and gifts with Nova Scotia pride.",
          "email": "hello@nsstrongclothing.ca", "areaServed": {"@type": "Country", "name": "Canada"},
          "address": {"@type": "PostalAddress", "addressRegion": "NS", "addressCountry": "CA"},
          "contactPoint": {"@type": "ContactPoint", "contactType": "customer service", "email": "hello@nsstrongclothing.ca",
                           "areaServed": "CA", "availableLanguage": "en"}}
WEBSITE_LD = {"@type": "WebSite", "@id": SITE + "/#website", "name": "NS Strong Clothing Co.", "url": SITE + "/",
              "inLanguage": "en-CA", "publisher": {"@id": ORG_ID}}
OG_DEFAULT = (SITE + "/assets/img/og-image.jpg", 1200, 630, "NS Strong Clothing Co. logo over a Nova Scotia lighthouse at blue hour")
CAT_WORD = {"Tees": "T-Shirt", "Hoodies": "Hoodie", "Sweatshirts": "Sweatshirt", "Hats": "Hat",
            "Accessories": "Gift", "Kids": "Kids' Tee"}
ROOT_SRC_PAGES_WITH_CARDS = {"index.html": "featured", "shop.html": "catalog"}

def esc(x):
    return (str(x).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;"))

def money(v):
    return "${:,.2f}".format(v)

def ld(obj):
    return '<script type="application/ld+json">%s</script>\n' % json.dumps({"@context": "https://schema.org", "@graph": obj} if isinstance(obj, list) else dict({"@context": "https://schema.org"}, **obj), ensure_ascii=False).replace("</", "<\\/")

def absolutize(html):
    return re.sub(r'(href|src|srcset)="(?!https?:|#|mailto:|/|data:)', r'\1="/', html)

def thumb(img):
    t = re.sub(r"\.webp$", "-480.webp", img)
    src, dst = os.path.join(ROOT, img), os.path.join(ROOT, t)
    if t != img and not os.path.exists(dst) and os.path.exists(src):  # card thumbnail (needs ImageMagick)
        try: __import__("subprocess").run(["magick", src, "-resize", "480x480", "-quality", "80", dst], check=True)
        except Exception as e: print("thumbnail skipped:", t, e)
    return t if t != img and os.path.exists(os.path.join(ROOT, t)) else ""

def purl(p):
    return "/products/%s/" % p["id"]

def card(p):
    badges = ('<span class="badge badge-out">Sold out</span>' if not p["inStock"] else "") + \
             ('<span class="badge badge-sample" title="Placeholder product for preview">Sample</span>' if p.get("sample") else "")
    dots = "".join('<span class="swatch-dot" style="background:%s" title="%s"></span>' % (esc(c["hex"]), esc(c["name"])) for c in p["colours"])
    img = "/" + p["images"][0]; t = thumb(p["images"][0])
    srcset = ' srcset="/%s 480w, %s 900w" sizes="(max-width:600px) 50vw, 300px"' % (esc(t), esc(img)) if t else ""
    return ('<a class="card" href="%s"><div class="card-media"><img src="%s"%s alt="%s" width="600" height="600" loading="lazy" decoding="async">%s</div>'
            '<div class="card-body"><div class="card-cat">%s</div><div class="card-title">%s</div><div class="card-price">%s</div>'
            '<div class="swatches" aria-label="%d colours">%s</div></div></a>') % (purl(p), esc(img), srcset, esc(p["name"]), badges,
            esc(p["category"]), esc(p["name"]), money(p["price"]), len(p["colours"]), dots)

def pdp_html(p):
    """Same markup as renderPDP() in assets/js/store.js, so the JS re-render causes no layout shift."""
    c0 = p["colours"][0]["name"]; s0 = p["sizes"][0] if len(p["sizes"]) == 1 else ""
    allowed = p["colours"][0].get("sizes") or p["sizes"]
    colours = "".join('<label class="opt opt-colour" title="%s"><input type="radio" name="colour" value="%s"%s><span style="background:%s"><span class="sr-only">%s</span></span></label>'
                      % (esc(c["name"]), esc(c["name"]), " checked" if i == 0 else "", esc(c["hex"]), esc(c["name"])) for i, c in enumerate(p["colours"]))
    sizes = "".join('<label class="opt%s"><input type="radio" name="size" value="%s"%s%s><span>%s</span></label>'
                    % ("" if s in allowed else " opt-disabled", esc(s), " checked" if s == s0 else "", "" if s in allowed else " disabled", esc(s)) for s in p["sizes"])
    details = "".join("<li>✓ %s</li>" % esc(d) for d in p.get("details", []))
    us = p.get("shipsFrom") == "US"
    img = "/" + p["colours"][0].get("image", p["images"][0])
    return ('<div class="pdp-media"><img id="pdp-img" src="%s" alt="%s" width="900" height="900" fetchpriority="high"></div>' % (esc(img), esc(p["name"] + " in " + c0)) +
            '<div><div class="card-cat">%s</div><h1>%s</h1>' % (esc(p["category"]), esc(p["name"])) +
            '<div class="price">%s <span class="small">CAD + HST</span></div>' % money(p["price"]) +
            ('<p class="notice">This is a sample product for preview purposes. Real products are coming soon.</p>' if p.get("sample") else "") +
            '<p>%s</p>' % esc(p["description"]) +
            ('<p class="notice"><strong>Printed and shipped from the US.</strong> %s</p>' % esc(p["shippingNote"]) if us and p.get("shippingNote") else "") +
            '<form id="add-form" novalidate>' +
            '<fieldset class="option-group"><legend>Colour: <span id="colour-name">%s</span></legend><div class="options">%s</div></fieldset>' % (esc(c0), colours) +
            '<fieldset class="option-group"><legend>Size</legend><div class="options">%s</div></fieldset>' % sizes +
            '<p class="small" id="size-error" role="alert" hidden style="color:#c8102e">Please choose a size.</p>' +
            '<div class="pdp-actions"><div class="qty"><button type="button" data-q="-1" aria-label="Decrease quantity">−</button><input id="qty" type="number" min="1" max="99" value="1" aria-label="Quantity"><button type="button" data-q="1" aria-label="Increase quantity">+</button></div>' +
            '<button class="btn" type="submit"%s>%s</button></div></form>' % ("" if p["inStock"] else " disabled", "Add to cart" if p["inStock"] else "Sold out") +
            '<ul class="perks">%s<li>%s</li><li>↩ Easy 30-day returns on unworn items</li></ul></div>' % (details,
            "🚚 Printed and shipped from the US (duties, GST/HST or brokerage may apply)" if us else "🚚 Ships from Nova Scotia across Canada"))

def trim(text, n):
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= n: return text
    cut = text[:n - 1].rsplit(" ", 1)[0].rstrip(",.;:")
    return cut + "…"

def product_meta(p):
    word = CAT_WORD.get(p["category"], "Apparel")
    title = "%s | Nova Scotia %s | NS Strong" % (p["name"], word)
    if len(title) > 60: title = "%s | NS Strong Clothing Co." % p["name"]
    if len(title) > 60: title = p["name"]
    lead = "%s, %s CAD. " % (p["name"], money(p["price"]))
    desc = trim(lead + p["description"], 158)
    return title, desc

def product_ld(p, url):
    us = p.get("shipsFrom") == "US"
    sticker = p["id"] == "shore-leave-sticker-sheet"
    imgs = []
    for x in [c.get("image") for c in p["colours"]] + p["images"]:
        if x and SITE + "/" + x not in imgs: imgs.append(SITE + "/" + x)
    ship = {"@type": "OfferShippingDetails",
            "shippingRate": {"@type": "MonetaryAmount", "value": "8.99" if sticker else "12.00", "currency": "CAD"},
            "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "CA"},
            "deliveryTime": {"@type": "ShippingDeliveryTime",
                             "handlingTime": {"@type": "QuantitativeValue", "minValue": 2, "maxValue": 5, "unitCode": "DAY"},
                             "transitTime": {"@type": "QuantitativeValue", "minValue": 3 if us else 2, "maxValue": 10 if us else 8, "unitCode": "DAY"}}}
    returns = {"@type": "MerchantReturnPolicy", "applicableCountry": "CA",
               "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow", "merchantReturnDays": 30,
               "returnMethod": "https://schema.org/ReturnByMail", "returnFees": "https://schema.org/ReturnFeesCustomerResponsibility"}
    offer = {"@type": "Offer", "url": url, "priceCurrency": "CAD", "price": "%.2f" % p["price"],
             "availability": "https://schema.org/InStock" if p["inStock"] else "https://schema.org/OutOfStock",
             "itemCondition": "https://schema.org/NewCondition", "seller": {"@id": ORG_ID},
             "shippingDetails": ship, "hasMerchantReturnPolicy": returns}
    prod = {"@type": "Product", "@id": url + "#product", "name": p["name"], "description": p["description"], "sku": p["id"],
            "image": imgs, "url": url, "category": p["category"],
            "brand": {"@type": "Brand", "name": "NS Strong"}, "offers": offer}
    if len(p["colours"]) > 1 or p["colours"][0]["name"]:
        prod["color"] = ", ".join(c["name"] for c in p["colours"])
    crumbs = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": "Shop", "item": SITE + "/shop.html"},
        {"@type": "ListItem", "position": 3, "name": p["name"], "item": url}]}
    return [prod, crumbs]

def related(p, products):
    same = [q for q in products if q["id"] != p["id"] and q["category"] == p["category"]]
    other = [q for q in products if q["id"] != p["id"] and q["category"] != p["category"] and q.get("featured")]
    rest = [q for q in products if q["id"] != p["id"] and q not in same and q not in other]
    return (same + other + rest)[:4]

def test_banner():  # baked in (no layout shift) while config.js has testMode: true; store.js removes it if testMode is turned off
    cfg = open(os.path.join(ROOT, "assets/js/config.js"), encoding="utf-8").read()
    if re.search(r"^\s*testMode:\s*true", cfg, re.M):
        return '<div class="test-banner" role="status">TEST MODE: payments are not live. Use Stripe test card 4242 4242 4242 4242. No real charges.</div>\n'
    return ""

def ver(rel):  # short content hash for cache-busting CSS/JS after deploys
    import hashlib
    return hashlib.sha1(open(os.path.join(ROOT, rel), "rb").read()).hexdigest()[:8]

def render(meta, body, url, nav_key, head_extra="", jsonld="", og=OG_DEFAULT, og_type="website", robots=""):
    nav = "".join('<a href="%s"%s>%s</a>' % (h, ' aria-current="page"' if k == nav_key else "", t) for h, t, k in NAV)
    return LAYOUT.format(title=esc(meta["title"]), description=esc(meta["description"]), url=url, site=SITE, nav=nav,
                         body=body.strip(), year=datetime.date.today().year, jsonld=jsonld, robots=robots, head_extra=head_extra,
                         test_banner=test_banner(), og_type=og_type, v_css=ver("assets/css/style.css"), v_cfg=ver("assets/js/config.js"), v_js=ver("assets/js/store.js"), og_image=og[0], og_w=og[1], og_h=og[2], og_alt=esc(og[3]))

def build():
    products = json.load(open(os.path.join(ROOT, "data", "products.json")))["products"]
    pages = []  # (url, [image urls])
    for fn in sorted(os.listdir(os.path.join(ROOT, "src"))):
        if not fn.endswith(".html"): continue
        raw = open(os.path.join(ROOT, "src", fn), encoding="utf-8").read()
        m = re.match(r"\s*<!--(\{.*?\})-->\s*", raw, re.S)
        meta = json.loads(m.group(1)); body = raw[m.end():]
        url = SITE + "/" + ("" if fn == "index.html" else fn)
        jsonld = ld([ORG_LD, WEBSITE_LD]) if fn == "index.html" else ""
        noindex = meta.get("noindex") or fn == "product.html"
        robots = '<meta name="robots" content="noindex, follow">\n' if noindex else ""
        head_extra = ""
        if fn == "index.html":
            head_extra = ('<link rel="preload" as="image" href="assets/img/brand/hero-lighthouse-coast-720.webp" media="(max-width:720px)" fetchpriority="high">\n'
                          '<link rel="preload" as="image" href="assets/img/brand/hero-lighthouse-coast.webp" media="(min-width:721px)" fetchpriority="high">\n')
            feat = [p for p in products if p.get("featured")] or products[:4]
            body = body.replace('<div class="grid" id="featured" aria-live="polite"></div>',
                                '<div class="grid" id="featured" aria-live="polite">%s</div>' % "".join(card(p) for p in feat))
        if fn == "shop.html":
            cats = ["All"] + sorted({p["category"] for p in products}, key=[p["category"] for p in products].index)
            chips = "".join('<button type="button" class="chip" aria-pressed="%s" data-cat="%s">%s</button>' % ("true" if c == "All" else "false", esc(c), esc(c)) for c in cats)
            body = body.replace('<div class="filters" id="filters" role="group" aria-label="Filter by category"></div>',
                                '<div class="filters" id="filters" role="group" aria-label="Filter by category">%s</div>' % chips)
            body = body.replace('<div class="grid" id="catalog" aria-live="polite"></div>',
                                '<div class="grid" id="catalog" aria-live="polite">%s</div>' % "".join(card(p) for p in products))
            body = body.replace('<span id="result-count"></span>', '<span id="result-count">%d products</span>' % len(products))
            jsonld = ld([{"@type": "CollectionPage", "@id": url + "#page", "name": "Shop Nova Scotia apparel", "url": url,
                          "isPartOf": {"@id": SITE + "/#website"},
                          "mainEntity": {"@type": "ItemList", "itemListElement": [
                              {"@type": "ListItem", "position": i + 1, "url": SITE + purl(p), "name": p["name"]} for i, p in enumerate(products)]}},
                         {"@type": "BreadcrumbList", "itemListElement": [
                             {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
                             {"@type": "ListItem", "position": 2, "name": "Shop", "item": url}]}])
        if fn == "product.html":  # legacy product.html?id=... URLs: store.js redirects to /products/<id>/
            body = body.replace('<section class="pdp" id="pdp" aria-live="polite"><p class="small">Loading…</p></section>',
                                '<section class="pdp" id="pdp" aria-live="polite"><div><p class="small">Loading…</p><ul>%s</ul></div></section>'
                                % "".join('<li><a href="%s">%s</a></li>' % (purl(p), esc(p["name"])) for p in products))
        html = render(meta, body, url, meta.get("nav"), head_extra, jsonld, robots=robots)
        if fn in ("404.html", "product.html"):  # served from other paths, so make links absolute
            html = absolutize(html)
        open(os.path.join(ROOT, fn), "w", encoding="utf-8").write(html)
        if not noindex:
            imgs = [SITE + "/" + x for x in re.findall(r'<img src="(assets/img/brand/[^"]+)"', body)]
            pages.append((url, imgs))
    # ---- static product pages: /products/<id>/index.html
    outdir = os.path.join(ROOT, "products")
    keep = set()
    for p in products:
        url = SITE + purl(p)
        title, desc = product_meta(p)
        c0img = p["colours"][0].get("image", p["images"][0])
        og = (SITE + "/" + c0img, 900, 900, p["name"] + " in " + p["colours"][0]["name"])
        body = ('<div class="container">\n  <nav aria-label="Breadcrumb" class="small" style="padding-top:1.5rem"><a href="index.html">Home</a> / '
                '<a href="shop.html">Shop</a> / <span id="crumb-name">%s</span></nav>\n' % esc(p["name"]) +
                '  <section class="pdp" id="pdp" data-id="%s" aria-live="polite">%s</section>\n</div>\n' % (esc(p["id"]), pdp_html(p)) +
                '<section class="section section-soft"><div class="container"><div class="section-head"><h2>You might also like</h2>'
                '<a href="shop.html">View all products →</a></div><div class="grid">%s</div></div></section>' % "".join(card(q) for q in related(p, products)))
        head_extra = ('<meta property="product:price:amount" content="%.2f">\n<meta property="product:price:currency" content="CAD">\n'
                      '<meta property="product:availability" content="%s">\n<meta property="product:condition" content="new">\n'
                      '<link rel="preload" as="image" href="/%s" fetchpriority="high">\n') % (p["price"], "in stock" if p["inStock"] else "out of stock", esc(c0img))
        html = render({"title": title, "description": desc}, body, url, "shop", head_extra, ld(product_ld(p, url)), og=og, og_type="product")
        html = absolutize(html)
        d = os.path.join(outdir, p["id"]); os.makedirs(d, exist_ok=True); keep.add(p["id"])
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(html)
        pages.append((url, [SITE + "/" + x for x in dict.fromkeys([c.get("image") for c in p["colours"] if c.get("image")] + p["images"])]))
    if os.path.isdir(outdir):  # remove pages for products that no longer exist
        for d in os.listdir(outdir):
            if d not in keep and os.path.exists(os.path.join(outdir, d, "index.html")):
                os.remove(os.path.join(outdir, d, "index.html")); os.rmdir(os.path.join(outdir, d))
    today = datetime.date.today().isoformat()
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    for u, imgs in pages:
        sm.append("  <url><loc>%s</loc><lastmod>%s</lastmod>%s</url>" % (u, today, "".join("<image:image><image:loc>%s</image:loc></image:image>" % i for i in imgs)))
    sm.append("</urlset>")
    open(os.path.join(ROOT, "sitemap.xml"), "w").write("\n".join(sm) + "\n")
    print("built", len(pages), "indexed pages (%d product pages)" % len(products))

if __name__ == "__main__":
    build()
