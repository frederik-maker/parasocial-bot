"""Generate the Parasocial P logo — 512×512 PNG, circle-safe for Telegram PFP."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent
SIZE = 512

# Colors — matching the site brand mark
BG_DARK = (10, 10, 10, 255)          # #0a0a0a
ACCENT  = (34, 197, 94, 255)         # #22c55e
INK     = (250, 250, 249, 255)       # #fafaf9
DARK_ON_GREEN = (8, 37, 17, 255)     # deep forest for contrast on green

SERIF_ITALIC = "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf"


def render(bg, fg, name, accent_ring=False):
    """Square canvas with a centered italic P. Circle-safe — all content fits
    inside the inscribed circle so Telegram's round crop keeps every pixel."""
    img = Image.new("RGBA", (SIZE, SIZE), bg)
    draw = ImageDraw.Draw(img)

    if accent_ring:
        # Subtle inner ring ~20px from the edge so nothing clips in the circle.
        ring_inset = 24
        ring_width = 6
        draw.ellipse(
            (ring_inset, ring_inset, SIZE - ring_inset, SIZE - ring_inset),
            outline=ACCENT, width=ring_width,
        )

    font = ImageFont.truetype(SERIF_ITALIC, 360)
    bbox = draw.textbbox((0, 0), "P", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (SIZE - tw) / 2 - bbox[0]
    # Optically nudge the P up a touch so descenders / cap spacing read centered.
    y = (SIZE - th) / 2 - bbox[1] - 10
    draw.text((x, y), "P", font=font, fill=fg)

    out = OUT_DIR / name
    img.save(out, "PNG", optimize=True)
    print(f"wrote {out}  ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    # Primary: dark bg, green italic P with accent ring (matches site brand mark)
    render(BG_DARK, ACCENT, "logo.png", accent_ring=True)
    # Alt: green bg, deep-dark P (maximum legibility at 32×32)
    render(ACCENT, DARK_ON_GREEN, "logo-green.png", accent_ring=False)
    # Alt: dark bg, off-white P, no ring (minimalist)
    render(BG_DARK, INK, "logo-ink.png", accent_ring=False)
