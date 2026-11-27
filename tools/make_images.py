"""Generates the simple SVG placeholder art used by the sample products, plus logo/favicon.
Run: python3 tools/make_images.py  (replace with real product photos later)."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "products")

SHAPES = {
 "tee": "M60 70 L110 45 Q150 70 190 45 L240 70 L270 130 L230 145 L225 120 L225 260 L75 260 L75 120 L70 145 L30 130 Z",
 "long": "M60 70 L110 45 Q150 70 190 45 L240 70 L285 245 L250 252 L225 130 L225 260 L75 260 L75 130 L50 252 L15 245 Z",
 "hoodie": "M65 85 Q90 60 115 55 Q120 25 150 25 Q180 25 185 55 Q210 60 235 85 L280 245 L245 252 L225 140 L225 265 L75 265 L75 140 L55 252 L20 245 Z",
 "crew": "M65 75 L115 50 Q150 68 185 50 L235 75 L280 245 L245 252 L225 135 L225 262 L75 262 L75 135 L55 252 L20 245 Z",
 "toque": "M80 230 L80 140 Q80 60 150 60 Q220 60 220 140 L220 230 Z",
}
KIND = {"schooner-strong-tee":"tee","salt-water-strong-hoodie":"hoodie","coastline-crewneck":"crew","ns-strong-toque":"toque","lighthouse-long-sleeve":"long"}

def light(h):
    h=h.lstrip('#'); r,g,b=(int(h[i:i+2],16) for i in (0,2,4)); return (0.299*r+0.587*g+0.114*b)>160

def svg(pid, colour, label):
    kind = KIND.get(pid, "tee")
    ink = "#0b2545" if light(colour) else "#ffffff"
    mark = ('<g transform="translate(150 150)" stroke="%s" stroke-width="7" stroke-linecap="round" opacity=".9">'
            '<line x1="-22" y1="-22" x2="22" y2="22"/><line x1="22" y1="-22" x2="-22" y2="22"/></g>' % ink)
    if kind == "toque":
        mark = ('<rect x="80" y="190" width="140" height="40" fill="%s" opacity=".15"/>'
                '<rect x="125" y="198" width="50" height="24" rx="3" fill="#ffffff" stroke="%s" stroke-width="2"/>'
                '<g transform="translate(150 210)" stroke="#0b2545" stroke-width="3"><line x1="-7" y1="-7" x2="7" y2="7"/><line x1="7" y1="-7" x2="-7" y2="7"/></g>' % (ink, ink))
    text = '' if kind == "toque" else '<text x="150" y="205" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="20" fill="%s" letter-spacing="2">NS STRONG</text>' % ink
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" role="img" aria-label="{label} (sample illustration)">
<rect width="300" height="300" fill="#eef2f6"/>
<path d="{SHAPES[kind]}" fill="{colour}" stroke="#0b2545" stroke-opacity=".25" stroke-width="2"/>
{mark}{text}
<text x="292" y="292" text-anchor="end" font-family="Arial,sans-serif" font-size="11" fill="#5b6b7b">SAMPLE</text>
</svg>
'''

data = json.load(open(os.path.join(ROOT, "data", "products.json")))
os.makedirs(OUT, exist_ok=True)
for p in data["products"]:
    for i, c in enumerate(p["colours"]):
        slug = c["name"].lower().replace(" ", "-")
        open(os.path.join(OUT, f'{p["id"]}-{slug}.svg'), "w").write(svg(p["id"], c["hex"], f'{p["name"]} in {c["name"]}'))
        if i == 0:
            open(os.path.join(OUT, f'{p["id"]}.svg'), "w").write(svg(p["id"], c["hex"], p["name"]))
print("done")
