#!/usr/bin/env python3
"""Generate PWA icons (PNG) for the School Management System.

We render the brand mark directly with PIL because SVG-to-PNG conversion
tools (rsvg-convert, inkscape, cairosvg) aren't installed in this env.
The mark mirrors the favicon.svg design: rounded square in primary blue
with a white 'S' glyph — visually identical to the favicon.
"""
from PIL import Image, ImageDraw, ImageFont
import os

# Brand palette — matches styles.scss --primary in light mode.
PRIMARY = (20, 83, 116)        # #145374
PRIMARY_DARK = (15, 41, 66)    # #0f2942
WHITE = (255, 255, 255, 255)

OUT_DIR = "/home/z/my-project/School-Managment-System-/frontend/public/icons"

def find_bold_font():
    """Locate a bold TrueType font available on the system."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def draw_mark(size, maskable=False):
    """Render the brand mark at the requested size.

    For maskable icons we keep the logo inside the 'safe zone' (the centre 80%
    of the canvas) so the platform's circle crop never clips the glyph.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Rounded-rect background filling the whole canvas.
    radius = int(size * 0.18)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=PRIMARY)
    # Slight inner shadow band at the bottom-right for a subtle depth feel.
    band = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(band)
    bdraw.rounded_rectangle(
        [(0, int(size * 0.78)), (size - 1, size - 1)],
        radius=radius, fill=(0, 0, 0, 40),
    )
    img = Image.alpha_composite(img, band)

    # Glyph 'S' centred. Maskable icons need padding around the glyph.
    draw = ImageDraw.Draw(img)
    font_path = find_bold_font()
    font_size = int(size * (0.55 if not maskable else 0.42))
    if font_path:
        font = ImageFont.truetype(font_path, font_size)
    else:
        font = ImageFont.load_default()
    text = "S"
    # Use textbbox for accurate centring (textlength is horizontal only).
    try:
        bbox = draw.textbbox((0, 0), text, font=font, stroke_width=0)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        text_x = (size - text_w) / 2 - bbox[0]
        text_y = (size - text_h) / 2 - bbox[1] - int(size * (0.02 if not maskable else 0))
    except AttributeError:
        # Pillow < 8.0 fallback — load_default gives a tiny font so we just centre.
        text_w, text_h = font_size, font_size
        text_x = (size - text_w) / 2
        text_y = (size - text_h) / 2
    draw.text((text_x, text_y), text, font=font, fill=WHITE)
    return img

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # Standard PWA sizes — Chrome requires at least 192 and 512.
    # Maskable variants must be 512 (declared with 'purpose':'maskable').
    sizes = [
        (72,   "icon-72x72.png",        False),
        (96,   "icon-96x96.png",        False),
        (128,  "icon-128x128.png",      False),
        (144,  "icon-144x144.png",      False),
        (152,  "icon-152x152.png",      False),
        (192,  "icon-192x192.png",      False),
        (384,  "icon-384x384.png",      False),
        (512,  "icon-512x512.png",      False),
        (192,  "icon-maskable-192.png", True),
        (512,  "icon-maskable-512.png", True),
    ]
    for size, name, maskable in sizes:
        path = os.path.join(OUT_DIR, name)
        draw_mark(size, maskable=maskable).save(path, "PNG")
        print(f"  wrote {path} ({size}x{size}{', maskable' if maskable else ''})")

    # Apple touch icon — single 180x180 PNG without transparency (iOS expects opaque).
    apple = draw_mark(180, maskable=True).convert("RGB")
    apple_path = os.path.join(OUT_DIR, "apple-touch-icon.png")
    apple.save(apple_path, "PNG")
    print(f"  wrote {apple_path} (180x180, opaque for iOS)")

    # Favicon PNG (32x32) for older browsers that don't read SVG favicons.
    fav = draw_mark(32, maskable=False)
    fav_path = "/home/z/my-project/School-Managment-System-/frontend/public/favicon-32x32.png"
    fav.save(fav_path, "PNG")
    print(f"  wrote {fav_path} (32x32 PNG fallback)")

if __name__ == "__main__":
    main()
