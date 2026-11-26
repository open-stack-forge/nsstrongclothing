"""Builds the site's HTML pages from src/*.html using one shared layout (header, footer, cart drawer).
Run after editing anything in src/:   python3 tools/build_pages.py
Each src page starts with a JSON comment:  <!--{"title": "...", "description": "...", "nav": "shop"}-->
Products do NOT need a rebuild: they load from data/products.json in the browser."""
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
<meta property="og:type" content="website">
<meta property="og:site_name" content="NS Strong Clothing Company">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{site}/assets/img/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="NS Strong Clothing Co. logo over a Nova Scotia lighthouse at blue hour">
<meta property="og:locale" content="en_CA">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<link rel="stylesheet" href="assets/css/style.css">
{robots}{jsonld}<script src="assets/js/config.js" defer></script>
<script src="assets/js/store.js" defer></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
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
      <div><h3>Shop</h3><ul><li><a href="shop.html">All products</a></li><li><a href="shop.html?category=Tees">Tees</a></li><li><a href="shop.html?category=Hoodies">Hoodies</a></li><li><a href="cart.html">Cart</a></li></ul></div>
      <div><h3>Help</h3><ul><li><a href="shipping-returns.html">Shipping &amp; Returns</a></li><li><a href="faq.html">FAQ</a></li><li><a href="contact.html">Contact</a></li></ul></div>
      <div><h3>Company</h3><ul><li><a href="about.html">About</a></li><li><a href="terms.html">Terms of Sale</a></li><li><a href="privacy.html">Privacy Policy</a></li></ul></div>
      <div><h3>Follow</h3><ul id="social-links"></ul></div>
    </div>
    <div class="footer-bottom"><span>&copy; <span id="year">{year}</span> NS Strong Clothing Company. Nova Scotia, Canada.</span><span>All prices in Canadian dollars (CAD).</span></div>
  </div>
</footer>
<div class="drawer-backdrop" data-close-cart></div>
<aside class="drawer" id="cart-drawer" aria-label="Shopping cart" aria-hidden="true">
  <div class="drawer-head"><h2>Your cart</h2><button class="icon-btn" id="drawer-close" type="button" data-close-cart aria-label="Close cart">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  <div class="drawer-body" id="drawer-body" aria-live="polite"></div>
  <div class="drawer-foot">
    <div class="totals"><span>Subtotal</span><span id="drawer-subtotal">$0.00</span></div>
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

ORG_LD = {"@context": "https://schema.org", "@type": "OnlineStore", "name": "NS Strong Clothing Company", "url": SITE,
          "logo": SITE + "/icon-512.png", "image": SITE + "/assets/img/og-image.jpg", "areaServed": "CA",
          "address": {"@type": "PostalAddress", "addressRegion": "NS", "addressCountry": "CA"}}

def build():
    pages = []
    for fn in sorted(os.listdir(os.path.join(ROOT, "src"))):
        if not fn.endswith(".html"): continue
        raw = open(os.path.join(ROOT, "src", fn), encoding="utf-8").read()
        m = re.match(r"\s*<!--(\{.*?\})-->\s*", raw, re.S)
        meta = json.loads(m.group(1)); body = raw[m.end():]
        nav = "".join('<a href="%s"%s>%s</a>' % (h, ' aria-current="page"' if k == meta.get("nav") else "", t) for h, t, k in NAV)
        url = SITE + "/" + ("" if fn == "index.html" else fn)
        jsonld = '<script type="application/ld+json">%s</script>\n' % json.dumps(ORG_LD) if fn == "index.html" else ""
        robots = '<meta name="robots" content="noindex">\n' if meta.get("noindex") else ""
        html = LAYOUT.format(title=meta["title"], description=meta["description"], url=url, site=SITE, nav=nav,
                             body=body.strip(), year=datetime.date.today().year, jsonld=jsonld, robots=robots)
        if fn == "404.html":  # served from any path, so make links absolute
            html = re.sub(r'(href|src)="(?!https?:|#|mailto:|/)', r'\1="/', html)
        open(os.path.join(ROOT, fn), "w", encoding="utf-8").write(html)
        if not meta.get("noindex") and fn != "product.html": pages.append(url)
    for prod in json.load(open(os.path.join(ROOT, "data", "products.json")))["products"]:
        pages.append(SITE + "/product.html?id=" + prod["id"])
    today = datetime.date.today().isoformat()
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += ["  <url><loc>%s</loc><lastmod>%s</lastmod></url>" % (u, today) for u in pages]
    sm.append("</urlset>")
    open(os.path.join(ROOT, "sitemap.xml"), "w").write("\n".join(sm) + "\n")
    print("built", len(pages), "indexed pages")

if __name__ == "__main__":
    build()
