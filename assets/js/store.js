/* NS Strong Clothing — storefront logic (no frameworks, no server). */
(function () {
  "use strict";
  var CFG = window.NSS_CONFIG || {};
  var CART_KEY = "nss_cart_v1";
  var productsPromise = null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { return new Intl.NumberFormat(CFG.locale || "en-CA", { style: "currency", currency: CFG.currency || "CAD" }).format(n); }

  function loadProducts() {
    if (!productsPromise) {
      productsPromise = fetch("/data/products.json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("products " + r.status); return r.json(); })
        .then(function (d) { return d.products || []; });
    }
    return productsPromise;
  }
  /* Renamed products: old ids still resolve (old links, saved carts). */
  var LEGACY_IDS = { "bluenose-tee": "schooner-strong-tee", "saltire-hoodie": "salt-water-strong-hoodie" };
  function canonId(id) { return Object.prototype.hasOwnProperty.call(LEGACY_IDS, id) ? LEGACY_IDS[id] : id; }
  /* Root-absolute paths so pages work at any depth (e.g. /products/<id>/). */
  function abs(u) { u = String(u || ""); return /^(https?:|\/|data:|#|mailto:)/.test(u) || !u ? u : "/" + u; }
  function productUrl(p) { return "/products/" + encodeURIComponent(p.id) + "/"; }
  function thumb(u) { return /^assets\/img\/products\/.*\.webp$/.test(u) ? u.replace(/\.webp$/, "-480.webp") : ""; }
  function originPerk(p) {
    return p.shipsFrom === "US"
      ? "🚚 Designed in Nova Scotia, printed in the US (duties, GST/HST or brokerage may apply)"
      : "🚚 Designed in Nova Scotia, printed in Canada";
  }
  function preorderNotice(p) {
    return (p.sample && p.inStock) ? '<p class="notice"><strong>Pre-order.</strong> This item is listed for preview and will ship after launch.</p>' : "";
  }
  function ctaLabel(p) { return !p.inStock ? "Sold out" : (p.sample ? "Pre-order" : "Add to cart"); }
  function findProduct(list, id) { id = canonId(id); for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function colourOf(p, name) { for (var i = 0; i < (p.colours || []).length; i++) if (p.colours[i].name === name) return p.colours[i]; return null; }
  function imageFor(p, colourName) { var c = colourOf(p, colourName); return abs((c && c.image) || (p.images && p.images[0]) || ""); }

  /* ---------- cart storage ---------- */
  function getCart() { try { var c = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); return Array.isArray(c) ? c.map(function (l) { if (l && l.id) l.id = canonId(l.id); return l; }) : []; } catch (e) { return []; } }
  function saveCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); updateCount(); document.dispatchEvent(new CustomEvent("cart:change")); }
  function keyOf(l) { return l.id + "|" + l.size + "|" + l.colour; }
  function addToCart(item) {
    var c = getCart(), k = keyOf(item), found = false;
    c.forEach(function (l) { if (keyOf(l) === k) { l.qty = Math.min(99, l.qty + item.qty); found = true; } });
    if (!found) c.push(item);
    saveCart(c);
  }
  function setQty(k, q) { var c = getCart().map(function (l) { if (keyOf(l) === k) l.qty = Math.max(1, Math.min(99, q)); return l; }); saveCart(c); }
  function removeLine(k) { saveCart(getCart().filter(function (l) { return keyOf(l) !== k; })); }
  function updateCount() { var n = getCart().reduce(function (s, l) { return s + l.qty; }, 0); $$(".cart-count").forEach(function (el) { el.textContent = n; el.setAttribute("data-count", n); }); }

  function toast(msg) { var t = $("#toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2400); }

  /* ---------- cart rendering (drawer + cart page) ---------- */
  function resolveLines(products) {
    return getCart().map(function (l) { var p = findProduct(products, l.id); return p ? { line: l, p: p, key: keyOf(l), total: p.price * l.qty } : null; }).filter(Boolean);
  }
  function linesHTML(lines) {
    if (!lines.length) return '<div class="empty"><p>Your cart is empty.</p><a class="btn btn-outline" href="/shop.html">Shop the collection</a></div>';
    return lines.map(function (x) {
      var href = productUrl(x.p);
      return '<div class="line" data-key="' + esc(x.key) + '">' +
        '<a href="' + href + '"><img src="' + esc(imageFor(x.p, x.line.colour)) + '" alt="" width="72" height="72" loading="lazy"></a>' +
        '<div><a class="line-title" href="' + href + '">' + esc(x.p.name) + '</a>' +
        '<div class="line-meta">' + esc(x.line.colour) + ' / ' + esc(x.line.size) + '</div>' +
        (x.p.shipsFrom === "US" ? '<div class="line-meta">Ships from the US. Duties/GST may apply on delivery.</div>' : "") +
        '<div class="qty" style="margin-top:.4rem"><button type="button" data-act="dec" aria-label="Decrease quantity">−</button>' +
        '<input type="number" min="1" max="99" value="' + x.line.qty + '" aria-label="Quantity for ' + esc(x.p.name) + '">' +
        '<button type="button" data-act="inc" aria-label="Increase quantity">+</button></div></div>' +
        '<div style="text-align:right"><div>' + money(x.total) + '</div><button type="button" class="link-btn" data-act="remove">Remove</button></div></div>';
    }).join("");
  }
  function subtotal(lines) { return lines.reduce(function (s, x) { return s + x.total; }, 0); }
  function stickerOnlyCart(lines) {
    return lines.length > 0 && lines.every(function (x) { return x.p && x.p.shippingClass === "sticker"; });
  }
  function shippingAmount(lines, sub) {
    var t = CFG.freeShippingThreshold || 0;
    if (t && sub >= t) return 0;
    return stickerOnlyCart(lines) ? (CFG.stickerShipping || 8.99) : (CFG.standardShipping || 12);
  }
  function shippingLabel(lines, sub) {
    var t = CFG.freeShippingThreshold || 0;
    if (!lines.length) return "—";
    if (t && sub >= t) return "Free";
    return money(shippingAmount(lines, sub));
  }
  function shippingNote(lines, sub) {
    var t = CFG.freeShippingThreshold || 0;
    if (!lines.length) return "";
    if (t && sub >= t) return "You qualify for free shipping in Canada. HST is calculated at checkout.";
    var rate = shippingAmount(lines, sub);
    var kind = stickerOnlyCart(lines) ? "Sticker-only shipping is " : "Standard shipping is ";
    var extra = t ? " Add " + money(t - sub) + " more for free shipping." : "";
    return kind + money(rate) + " in Canada." + extra + " HST is calculated at checkout.";
  }
  function bindLineEvents(root) {
    root.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]"); if (!b) return;
      var row = b.closest(".line"); if (!row) return; var k = row.getAttribute("data-key");
      var input = $("input", row), q = parseInt(input.value, 10) || 1;
      if (b.dataset.act === "inc") setQty(k, q + 1);
      else if (b.dataset.act === "dec") { if (q <= 1) removeLine(k); else setQty(k, q - 1); }
      else if (b.dataset.act === "remove") removeLine(k);
    });
    root.addEventListener("change", function (e) {
      if (e.target.matches(".line input")) setQty(e.target.closest(".line").getAttribute("data-key"), parseInt(e.target.value, 10) || 1);
    });
  }
  function renderDrawer() {
    var body = $("#drawer-body"); if (!body) return;
    loadProducts().then(function (products) {
      var lines = resolveLines(products), sub = subtotal(lines);
      body.innerHTML = linesHTML(lines);
      $("#drawer-subtotal").textContent = money(sub);
      var ds = $("#drawer-shipping"); if (ds) ds.textContent = shippingLabel(lines, sub);
      $("#drawer-note").textContent = shippingNote(lines, sub);
      $("#drawer-checkout").disabled = !lines.length;
    });
  }
  function renderCartPage() {
    var root = $("#cart-lines"); if (!root) return;
    loadProducts().then(function (products) {
      var lines = resolveLines(products), sub = subtotal(lines);
      root.innerHTML = linesHTML(lines);
      $("#cart-subtotal").textContent = money(sub);
      var cs = $("#cart-shipping"); if (cs) cs.textContent = shippingLabel(lines, sub);
      $("#cart-note").textContent = shippingNote(lines, sub);
      $("#cart-checkout").disabled = !lines.length;
    });
  }
  function openDrawer() { document.body.classList.add("drawer-open"); var dr = $("#cart-drawer"); dr.setAttribute("aria-hidden", "false"); dr.removeAttribute("inert"); renderDrawer(); setTimeout(function () { var c = $("#drawer-close"); if (c) c.focus(); }, 50); }
  function closeDrawer() { document.body.classList.remove("drawer-open"); var dr = $("#cart-drawer"); dr.setAttribute("aria-hidden", "true"); dr.setAttribute("inert", ""); }

  /* ---------- checkout ---------- */
  function checkout(btn) {
    var mode = (CFG.checkout && CFG.checkout.mode) || "disabled";
    var msgEl = btn.parentNode.querySelector(".checkout-msg");
    function say(m) { if (msgEl) { msgEl.textContent = m; msgEl.hidden = false; } else toast(m); }
    var cart = getCart(); if (!cart.length) return;
    if (mode === "disabled") { say("Checkout coming soon! Our secure online payments are being set up. Your cart is saved on this device."); return; }
    loadProducts().then(function (products) {
      if (mode === "payment_link") {
        if (cart.length > 1) { say("Please check out one item at a time for now (remove the others, then check out)."); return; }
        var l = cart[0], p = findProduct(products, l.id); if (!p) return;
        var links = p.paymentLinks || {};
        var url = links[l.size + "|" + l.colour] || links[l.colour] || p.paymentLink;
        if (!url) { say("Checkout for this item is coming soon."); return; }
        window.location.href = url; return;
      }
      if (mode === "worker" && CFG.checkout.workerUrl) {
        btn.disabled = true; say("Taking you to secure checkout…");
        fetch(CFG.checkout.workerUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cart }) })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (d && d.url) window.location.href = d.url; else throw new Error((d && d.error) || "No checkout URL"); })
          .catch(function () { btn.disabled = false; say("Sorry, checkout is unavailable right now. Please try again shortly."); });
        return;
      }
      say("Checkout coming soon!");
    });
  }

  /* ---------- product cards ---------- */
  function cardHTML(p) {
    var badges = "";
    if (!p.inStock) badges += '<span class="badge badge-out">Sold out</span>';
    if (p.sample && p.inStock) badges += '<span class="badge badge-preorder">Pre-order</span>';
    var dots = (p.colours || []).map(function (c) { return '<span class="swatch-dot" style="background:' + esc(c.hex) + '" title="' + esc(c.name) + '"></span>'; }).join("");
    var t = thumb(p.images[0]), srcset = t ? ' srcset="' + esc(abs(t)) + ' 480w, ' + esc(abs(p.images[0])) + ' 900w" sizes="(max-width:600px) 50vw, 300px"' : "";
    return '<a class="card" href="' + productUrl(p) + '">' +
      '<div class="card-media"><img src="' + esc(abs(p.images[0])) + '"' + srcset + ' alt="' + esc(p.name) + '" width="600" height="600" loading="lazy" decoding="async">' + badges + '</div>' +
      '<div class="card-body"><div class="card-cat">' + esc(p.category) + '</div><div class="card-title">' + esc(p.name) + '</div>' +
      '<div class="card-price">' + money(p.price) + '</div><div class="swatches" aria-label="' + (p.colours || []).length + ' colours">' + dots + '</div></div></a>';
  }
  function renderFeatured() {
    var el = $("#featured"); if (!el) return;
    loadProducts().then(function (ps) { var f = ps.filter(function (p) { return p.featured; }); el.innerHTML = (f.length ? f : ps.slice(0, 4)).map(cardHTML).join(""); })
      .catch(function () { el.innerHTML = '<p class="small">Products could not be loaded.</p>'; });
  }
  function renderCatalog() {
    var el = $("#catalog"); if (!el) return;
    loadProducts().then(function (ps) {
      var cats = ["All"]; ps.forEach(function (p) { if (cats.indexOf(p.category) < 0) cats.push(p.category); });
      var fil = $("#filters"), params = new URLSearchParams(location.search), active = params.get("category") || "All";
      function draw() {
        fil.innerHTML = cats.map(function (c) { return '<button type="button" class="chip" aria-pressed="' + (c === active) + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join("");
        var list = active === "All" ? ps : ps.filter(function (p) { return p.category === active; });
        el.innerHTML = list.map(cardHTML).join("") || '<p class="small">No products in this category yet.</p>';
        $("#result-count").textContent = list.length + (list.length === 1 ? " product" : " products");
      }
      fil.addEventListener("click", function (e) { var b = e.target.closest(".chip"); if (!b) return; active = b.dataset.cat; history.replaceState(null, "", active === "All" ? "shop.html" : "shop.html?category=" + encodeURIComponent(active)); draw(); });
      draw();
    }).catch(function () { el.innerHTML = '<p class="small">Products could not be loaded.</p>'; });
  }

  /* ---------- product detail ---------- */
  function setMeta(sel, attr, val) { var m = $(sel); if (m) m.setAttribute(attr, val); }
  function renderPDP() {
    var el = $("#pdp"); if (!el) return;
    var id = el.dataset.id || new URLSearchParams(location.search).get("id");
    loadProducts().then(function (ps) {
      var p = findProduct(ps, id);
      if (p && !el.dataset.id && location.replace) { location.replace(productUrl(p)); return; }
      if (!p) { el.innerHTML = '<div class="empty" style="grid-column:1/-1"><h1>Product not found</h1><p>It may have sold out or moved.</p><a class="btn" href="/shop.html">Back to shop</a></div>'; return; }
      if (!el.dataset.id) { // pre-rendered pages (/products/<id>/) already carry their own title and meta
        document.title = p.name + " | NS Strong Clothing Co.";
        setMeta('meta[name="description"]', "content", p.description);
      }
      var crumb = $("#crumb-name"); if (crumb) crumb.textContent = p.name;
      var c0 = p.colours[0].name, s0 = p.sizes.length === 1 ? p.sizes[0] : "";
      var colours = p.colours.map(function (c, i) {
        return '<label class="opt opt-colour" title="' + esc(c.name) + '"><input type="radio" name="colour" value="' + esc(c.name) + '"' + (i === 0 ? " checked" : "") + '><span style="background:' + esc(c.hex) + '"><span class="sr-only">' + esc(c.name) + '</span></span></label>';
      }).join("");
      var sizes = p.sizes.map(function (s) {
        return '<label class="opt"><input type="radio" name="size" value="' + esc(s) + '"' + (s === s0 ? " checked" : "") + '><span>' + esc(s) + '</span></label>';
      }).join("");
      var details = (p.details || []).map(function (d) { return "<li>✓ " + esc(d) + "</li>"; }).join("");
      el.innerHTML =
        '<div class="pdp-media"><img id="pdp-img" src="' + esc(imageFor(p, c0)) + '" alt="' + esc(p.name + " in " + c0) + '" width="900" height="900" fetchpriority="high"></div>' +
        '<div><div class="card-cat">' + esc(p.category) + '</div><h1>' + esc(p.name) + '</h1>' +
        '<div class="price">' + money(p.price) + ' <span class="small">CAD + HST</span></div>' +
        preorderNotice(p) +
        '<p>' + esc(p.description) + '</p>' +
        (p.shipsFrom === "US" && p.shippingNote ? '<p class="notice"><strong>Designed in Nova Scotia, printed in the US.</strong> ' + esc(p.shippingNote) + '</p>' : "") +
        '<form id="add-form" novalidate>' +
        '<fieldset class="option-group"><legend>Colour: <span id="colour-name">' + esc(c0) + '</span></legend><div class="options">' + colours + '</div></fieldset>' +
        '<fieldset class="option-group"><legend>Size</legend><div class="options">' + sizes + '</div></fieldset>' +
        '<p class="small" id="size-error" role="alert" hidden style="color:#c8102e">Please choose a size.</p>' +
        '<div class="pdp-actions"><div class="qty"><button type="button" data-q="-1" aria-label="Decrease quantity">−</button><input id="qty" type="number" min="1" max="99" value="1" aria-label="Quantity"><button type="button" data-q="1" aria-label="Increase quantity">+</button></div>' +
        '<button class="btn" type="submit"' + (p.inStock ? "" : " disabled") + '>' + ctaLabel(p) + '</button></div></form>' +
        '<ul class="perks">' + details + '<li>' + originPerk(p) + '</li><li>↩ Easy 30-day returns on unworn items</li></ul></div>';
      var form = $("#add-form");
      function applySizes(colourName) {
        var cc = p.colours.filter(function (c) { return c.name === colourName; })[0];
        var allowed = (cc && cc.sizes) || p.sizes;
        form.querySelectorAll('input[name="size"]').forEach(function (i) {
          var ok = allowed.indexOf(i.value) > -1;
          i.disabled = !ok; i.parentNode.classList.toggle("opt-disabled", !ok);
          if (!ok && i.checked) i.checked = false;
        });
      }
      applySizes(c0);
      form.addEventListener("change", function (e) {
        if (e.target.name === "colour") { applySizes(e.target.value); }
        if (e.target.name === "colour") { $("#colour-name").textContent = e.target.value; var img = $("#pdp-img"); img.src = imageFor(p, e.target.value); img.alt = p.name + " in " + e.target.value; }
        if (e.target.name === "size") $("#size-error").hidden = true;
      });
      form.addEventListener("click", function (e) { var b = e.target.closest("button[data-q]"); if (!b) return; var q = $("#qty"); q.value = Math.max(1, Math.min(99, (parseInt(q.value, 10) || 1) + parseInt(b.dataset.q, 10))); });
      form.addEventListener("submit", function (e) {
        e.preventDefault(); if (!p.inStock) return;
        var size = (form.querySelector('input[name="size"]:checked') || {}).value;
        var colour = (form.querySelector('input[name="colour"]:checked') || {}).value;
        if (!size) { $("#size-error").hidden = false; return; }
        addToCart({ id: p.id, size: size, colour: colour, qty: Math.max(1, Math.min(99, parseInt($("#qty").value, 10) || 1)) });
        toast("Added to cart"); openDrawer();
      });
    }).catch(function () { el.innerHTML = '<p class="small">Product could not be loaded.</p>'; });
  }

  /* ---------- contact ---------- */
  function initContact() {
    var form = $("#contact-form"); if (!form) return;
    var emailEl = $("#contact-email");
    if (CFG.contactEmail && emailEl) { emailEl.innerHTML = 'Email us at <a href="mailto:' + esc(CFG.contactEmail) + '">' + esc(CFG.contactEmail) + '</a>.'; }
    if (CFG.formEndpoint) { form.action = CFG.formEndpoint; form.method = "POST"; return; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = $("#form-status");
      if (!CFG.contactEmail) { status.hidden = false; status.textContent = "Our contact inbox is being set up. Please check back soon."; return; }
      var d = new FormData(form);
      var body = "Name: " + d.get("name") + "\nEmail: " + d.get("email") + "\nOrder #: " + (d.get("order") || "-") + "\n\n" + d.get("message");
      window.location.href = "mailto:" + CFG.contactEmail + "?subject=" + encodeURIComponent("Website enquiry: " + (d.get("topic") || "General")) + "&body=" + encodeURIComponent(body);
    });
  }

  function initSocial() {
    var s = CFG.social || {}, el = $("#social-links"); if (!el) return;
    var html = ["instagram", "facebook", "tiktok"].filter(function (k) { return s[k]; }).map(function (k) { return '<li><a href="' + esc(s[k]) + '" rel="noopener" target="_blank">' + k.charAt(0).toUpperCase() + k.slice(1) + "</a></li>"; }).join("");
    if (html) el.innerHTML = html; else el.closest("div").hidden = true;
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    updateCount();
    var t = CFG.freeShippingThreshold, a = $("#announce-text");
    if (a && t) a.textContent = "Free shipping across Canada on orders over " + money(t).replace(".00", "") + " · Proudly Nova Scotian";
    var stb = $(".test-banner"); if (stb && !CFG.testMode) stb.remove();
    if (CFG.testMode && !stb) { var tb = document.createElement("div"); tb.className = "test-banner"; tb.setAttribute("role", "status"); tb.textContent = "TEST MODE: payments are not live. Use Stripe test card 4242 4242 4242 4242. No real charges."; document.body.insertBefore(tb, document.body.firstChild); }
    var y = $("#year"); if (y) y.textContent = new Date().getFullYear();
    var mt = $(".menu-toggle"), nav = $("#site-nav");
    if (mt) mt.addEventListener("click", function () { var o = nav.classList.toggle("open"); mt.setAttribute("aria-expanded", o); });
    $$("[data-open-cart]").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); openDrawer(); }); });
    $$("[data-close-cart]").forEach(function (b) { b.addEventListener("click", closeDrawer); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && document.body.classList.contains("drawer-open")) closeDrawer(); });
    $$("[data-checkout]").forEach(function (b) { b.addEventListener("click", function () { checkout(b); }); });
    var db = $("#drawer-body"); if (db) bindLineEvents(db);
    var cl = $("#cart-lines"); if (cl) bindLineEvents(cl);
    document.addEventListener("cart:change", function () { if (document.body.classList.contains("drawer-open")) renderDrawer(); renderCartPage(); });
    window.addEventListener("storage", function (e) { if (e.key === CART_KEY) { updateCount(); renderCartPage(); } });
    var ck = new URLSearchParams(location.search).get("checkout");
    if ($("#thank-you")) { localStorage.removeItem(CART_KEY); updateCount(); }
    renderFeatured(); renderCatalog(); renderPDP(); renderCartPage(); initContact(); initSocial();
  });
})();
