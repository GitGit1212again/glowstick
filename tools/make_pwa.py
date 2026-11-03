#!/usr/bin/env python3
"""Turn a built single-file app (dist/Glowstick-store.html) into an installable iPhone/Android web app.
(Copied from the shared pwa.py tool so this repo builds on its own; plus: relative favicon link.)

Output folder gets:
  index.html            the app, with Apple home-screen meta tags, manifest link, service-worker
                        registration and a one-time "Add to Home Screen" hint for iOS Safari
  manifest.webmanifest  name, colours, icons, standalone display
  sw.js                 cache-first service worker (app works offline after the first load)
  icon-180.png          apple-touch-icon
  icon-192.png, icon-512.png

Usage:
  python tools/make_pwa.py --html dist/App.html --name "App" --out dist/pwa --theme "#070410" --bg "#070410" \
                [--icon src/assets/icon.png] [--short "App"] [--key app.a2hs]

Python 3 + Pillow (icons only).
"""
import argparse, hashlib, json, os, re, shutil
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("--html", required=True)
ap.add_argument("--name", required=True)
ap.add_argument("--short")
ap.add_argument("--out", required=True)
ap.add_argument("--theme", default="#000000")
ap.add_argument("--bg", default="#000000")
ap.add_argument("--icon", help="square PNG; omitted -> plain tile with the first letter")
ap.add_argument("--key", help="localStorage key for the install hint (default <name>.a2hs)")
a = ap.parse_args()
short = a.short or a.name
key = a.key or (a.name.lower() + ".a2hs")

os.makedirs(a.out, exist_ok=True)
html = open(a.html, encoding="utf-8").read()
ver = hashlib.sha1(html.encode("utf-8")).hexdigest()[:10]
# Every path the page uses must be relative so it works from a sub-folder such as https://user.github.io/glowstick/.
# The app's own favicon link points at assets/icon.png, which is not part of the PWA folder: use the PWA icon.
html = re.sub(r'(<link rel="icon" href=")[^"]*(")', r"\1icon-192.png\2", html, count=1)

# --- icons -------------------------------------------------------------------------------------
def base_icon():
    if a.icon:
        return Image.open(a.icon).convert("RGBA")
    im = Image.new("RGBA", (512, 512), a.bg)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((40, 40, 472, 472), 96, fill=a.theme)
    return im

src = base_icon()
for n in (180, 192, 512):
    # iOS composites apple-touch-icon over black; give it an opaque background in the app's colour.
    tile = Image.new("RGBA", (n, n), a.bg)
    im = src.resize((n, n), Image.LANCZOS)
    tile.alpha_composite(im)
    tile.convert("RGB").save(os.path.join(a.out, f"icon-{n}.png"), optimize=True)

# --- manifest ----------------------------------------------------------------------------------
manifest = {
    "name": a.name, "short_name": short, "start_url": "./index.html", "scope": "./",
    "display": "standalone", "orientation": "portrait",
    "background_color": a.bg, "theme_color": a.theme,
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}],
}
json.dump(manifest, open(os.path.join(a.out, "manifest.webmanifest"), "w"), indent=2)

# --- service worker ----------------------------------------------------------------------------
open(os.path.join(a.out, "sw.js"), "w", encoding="utf-8").write(f"""// {a.name} service worker, build {ver}
const CACHE = "{a.name.lower()}-{ver}";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
}});
self.addEventListener("activate", e => {{
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener("fetch", e => {{
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {{
    e.respondWith(caches.match("./index.html").then(r => r || fetch(req)));
    return;
  }}
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {{
    // cache fonts and other same-origin/opaque GETs so the app is whole offline
    if (res && (res.ok || res.type === "opaque")) {{
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
    }}
    return res;
  }}).catch(() => hit)));
}});
""")

# --- index.html ----------------------------------------------------------------------------------
head_add = f"""<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="{short}">
<meta name="theme-color" content="{a.theme}">
"""
# drop any existing theme-color so ours is the one that counts
html = re.sub(r'[ \t]*<meta name="theme-color"[^>]*>\s*\n?', "", html, flags=re.I)
html = re.sub(r"</head>", head_add + "</head>", html, count=1, flags=re.I) if re.search(r"</head>", html, re.I) \
    else re.sub(r"(<title>.*?</title>)", r"\1\n" + head_add, html, count=1, flags=re.I | re.S)

tail_add = f"""<div id="a2hs" style="display:none;position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:9999;background:{a.theme};color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:14px;padding:12px 14px;font:15px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45)">
  <b>Put {short} on your home screen</b><br>Tap <span style="display:inline-block;border:1px solid rgba(255,255,255,.5);border-radius:5px;padding:0 5px">&#x2191;</span> Share, then <b>Add to Home Screen</b>. It then opens full-screen and works offline.
  <button id="a2hs-x" style="float:right;margin:-4px -6px 0 8px;background:none;border:0;color:#fff;font-size:20px;line-height:1">&times;</button>
</div>
<script>
(function(){{
  if ("serviceWorker" in navigator && location.protocol !== "file:") {{
    navigator.serviceWorker.register("sw.js").catch(function(){{}});
  }}
  var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var ios = (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) && !window.MSStream;
  var seen = false; try {{ seen = localStorage.getItem({json.dumps(key)}) === "1"; }} catch (e) {{}}
  if (ios && !standalone && !seen) {{
    var el = document.getElementById("a2hs");
    document.getElementById("a2hs-x").onclick = function(){{ el.style.display = "none"; try {{ localStorage.setItem({json.dumps(key)}, "1"); }} catch (e) {{}} }};
    // Wait until the app has no dialog open (the first-run walkthrough, which opens about 0.4 s after load, has its
    // buttons at the bottom, where this hint sits).
    var show = function(){{ var m = document.getElementById("modal"); if (m && !m.classList.contains("hidden")) {{ setTimeout(show, 700); }} else {{ el.style.display = "block"; }} }};
    setTimeout(show, 1000);
  }}
}})();
</script>
"""
html = re.sub(r"</body>", tail_add + "</body>", html, count=1, flags=re.I) if re.search(r"</body>", html, re.I) else html + tail_add
open(os.path.join(a.out, "index.html"), "w", encoding="utf-8").write(html)
print(f"{a.name}: {a.out} ({len(html)//1024} KB, build {ver})")
