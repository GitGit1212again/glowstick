"""Draw the Glowstick launcher icon: a bent neon tube on a near-black disc.

Writes
  android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_fg.png   432x432 adaptive foreground (safe zone 264px centre)
  android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png      192x192 legacy icon
  src/assets/icon.png                                          192x192 favicon / web icon

    python tools/make_icon.py        (needs Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res" / "mipmap-xxxhdpi"
WEB = ROOT / "src" / "assets"

BG = (7, 4, 16, 255)
PINK = (255, 47, 210)
CYAN = (33, 240, 255)
LIME = (195, 255, 61)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def tube(size, thickness, glow):
    """A diagonal tube from lower-left to upper-right, gradient pink -> cyan -> lime, with a soft glow."""
    S = size * 4  # supersample
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = S * 0.27, S * 0.74, S * 0.73, S * 0.26
    n = 160
    th = thickness * 4
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        c = lerp(PINK, CYAN, t0 * 2) if t0 < 0.5 else lerp(CYAN, LIME, (t0 - 0.5) * 2)
        ax, ay = x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0
        bx, by = x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1
        d.ellipse([ax - th / 2, ay - th / 2, ax + th / 2, ay + th / 2], fill=c + (255,))
        d.line([(ax, ay), (bx, by)], fill=c + (255,), width=int(th))
    # rounded ends
    d.ellipse([x0 - th / 2, y0 - th / 2, x0 + th / 2, y0 + th / 2], fill=PINK + (255,))
    d.ellipse([x1 - th / 2, y1 - th / 2, x1 + th / 2, y1 + th / 2], fill=LIME + (255,))
    # highlight stripe
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    off = th * 0.22
    hd.line([(x0 - off * 0.7, y0 - off * 0.7), (x1 - off * 0.7, y1 - off * 0.7)], fill=(255, 255, 255, 120), width=int(th * 0.28))
    img = Image.alpha_composite(img, hl)
    # glow layer
    g = img.filter(ImageFilter.GaussianBlur(glow * 4))
    g = Image.eval(g, lambda v: v)  # keep colours
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out = Image.alpha_composite(out, g)
    out = Image.alpha_composite(out, g)
    out = Image.alpha_composite(out, img)
    return out.resize((size, size), Image.LANCZOS)


def foreground():
    # 432 canvas, content inside the 264 safe circle (Android masks the outer ring)
    canvas = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    t = tube(300, 34, 9)
    canvas.alpha_composite(t, (66, 66))
    return canvas


def legacy(size=192):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = size * 0.22
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)
    t = tube(int(size * 0.92), int(size * 0.13), size * 0.03)
    img.alpha_composite(t, (int(size * 0.04), int(size * 0.04)))
    return img


def main():
    RES.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    foreground().save(RES / "ic_launcher_fg.png")
    legacy(192).save(RES / "ic_launcher.png")
    legacy(192).save(WEB / "icon.png")
    print("wrote", RES / "ic_launcher_fg.png", RES / "ic_launcher.png", WEB / "icon.png")


if __name__ == "__main__":
    main()
