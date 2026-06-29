from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_GIF = ROOT / "public" / "six-twelve-meme-hand-gesture.gif"
OUT_CONTACT = ROOT / "public" / "six-twelve-meme-contact-sheet.png"

SIZE = 640
FRAME_COUNT = 24
DURATION_MS = 58


def load_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Avenir Next Condensed.ttc",
        "/System/Library/Fonts/Avenir.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size, index=1 if bold else 0)
        except Exception:
            continue
    return ImageFont.load_default()


NUMBER_FONT = load_font(84)
SMALL_FONT = load_font(30)


def text_center(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=0)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = box[0] + (box[2] - box[0] - tw) / 2 - bbox[0]
    y = box[1] + (box[3] - box[1] - th) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=fill)


def overlay(base: Image.Image, layer: Image.Image):
    base.alpha_composite(layer)


def draw_soft_shadow(draw: ImageDraw.ImageDraw, xy, offset=(0, 10), radius=24):
    x0, y0, x1, y1 = xy
    draw.ellipse((x0 + offset[0], y0 + offset[1], x1 + offset[0], y1 + offset[1]), fill=(45, 55, 95, radius))


def draw_background(frame: Image.Image, pulse: float):
    draw = ImageDraw.Draw(frame, "RGBA")
    draw.rectangle((0, 0, SIZE, SIZE), fill=(248, 247, 235, 255))
    draw.rectangle((0, 0, SIZE, SIZE), fill=(236, 252, 247, 100))

    # Poster-style radial burst, kept subtle so the hand cards remain readable.
    cx, cy = SIZE // 2, 334
    for i in range(24):
        angle = i * math.tau / 24 + 0.03 * pulse
        inner = 88
        outer = 480
        p1 = (cx + math.cos(angle - 0.035) * inner, cy + math.sin(angle - 0.035) * inner)
        p2 = (cx + math.cos(angle + 0.035) * inner, cy + math.sin(angle + 0.035) * inner)
        p3 = (cx + math.cos(angle + 0.035) * outer, cy + math.sin(angle + 0.035) * outer)
        p4 = (cx + math.cos(angle - 0.035) * outer, cy + math.sin(angle - 0.035) * outer)
        color = (255, 202, 96, 35) if i % 2 == 0 else (72, 171, 184, 26)
        draw.polygon((p1, p2, p3, p4), fill=color)

    for i in range(16):
        x = 50 + (i * 83) % 540
        y = 56 + (i * 47) % 470
        tilt = math.sin(i * 1.7 + pulse) * 15
        color = [(255, 95, 87, 150), (45, 132, 188, 150), (255, 201, 76, 155), (58, 179, 129, 150)][i % 4]
        draw.rounded_rectangle((x, y, x + 18, y + 7), radius=3, fill=color)
        if abs(tilt) > 10:
            draw.line((x, y, x + 17, y + 7), fill=color, width=3)

    draw.ellipse((110, 530, 530, 600), fill=(57, 59, 96, 32))


def draw_body(draw: ImageDraw.ImageDraw, bob: float):
    body_y = 374 + bob
    draw.rounded_rectangle((214, body_y, 426, body_y + 188), radius=42, fill=(43, 74, 126, 255), outline=(30, 42, 70, 255), width=5)
    draw.polygon(((230, body_y + 20), (410, body_y + 20), (380, body_y + 72), (260, body_y + 72)), fill=(51, 91, 148, 255))
    draw.line((320, body_y + 72, 320, body_y + 180), fill=(252, 185, 61, 255), width=6)
    draw.ellipse((302, body_y + 100, 314, body_y + 112), fill=(252, 185, 61, 255))
    draw.ellipse((326, body_y + 100, 338, body_y + 112), fill=(252, 185, 61, 255))
    draw.rounded_rectangle((280, body_y + 96, 360, body_y + 130), radius=18, fill=(34, 59, 101, 255))


def draw_head(draw: ImageDraw.ImageDraw, bob: float):
    face = (250, 154 + bob, 390, 306 + bob)
    neck = (292, 292 + bob, 348, 370 + bob)
    draw.rounded_rectangle(neck, radius=22, fill=(224, 148, 94, 255), outline=(95, 56, 55, 255), width=4)
    draw_soft_shadow(draw, face, offset=(0, 12), radius=36)
    draw.ellipse(face, fill=(238, 169, 112, 255), outline=(73, 50, 60, 255), width=5)

    hair = [
        (260, 183 + bob),
        (274, 146 + bob),
        (321, 132 + bob),
        (371, 151 + bob),
        (388, 191 + bob),
        (363, 175 + bob),
        (336, 187 + bob),
        (306, 169 + bob),
        (282, 194 + bob),
    ]
    draw.polygon(hair, fill=(49, 42, 47, 255))
    draw.arc((262, 142 + bob, 386, 224 + bob), 188, 356, fill=(28, 31, 44, 255), width=9)

    draw.ellipse((284, 224 + bob, 300, 240 + bob), fill=(32, 35, 46, 255))
    draw.ellipse((340, 224 + bob, 356, 240 + bob), fill=(32, 35, 46, 255))
    draw.arc((302, 244 + bob, 338, 274 + bob), 8, 172, fill=(107, 50, 63, 255), width=6)
    draw.arc((275, 213 + bob, 305, 225 + bob), 190, 350, fill=(65, 45, 58, 255), width=4)
    draw.arc((335, 213 + bob, 365, 225 + bob), 190, 350, fill=(65, 45, 58, 255), width=4)
    draw.ellipse((243, 221 + bob, 261, 255 + bob), fill=(233, 155, 101, 255), outline=(73, 50, 60, 255), width=3)
    draw.ellipse((379, 221 + bob, 397, 255 + bob), fill=(233, 155, 101, 255), outline=(73, 50, 60, 255), width=3)


def draw_arm(draw: ImageDraw.ImageDraw, shoulder, elbow, hand, skin):
    outline = (73, 50, 60, 255)
    sleeve = (43, 74, 126, 255)
    draw.line((shoulder, elbow, hand), fill=outline, width=54, joint="curve")
    draw.line((shoulder, elbow), fill=sleeve, width=42, joint="curve")
    draw.line((elbow, hand), fill=skin, width=38, joint="curve")
    hx, hy = hand
    draw.ellipse((hx - 34, hy - 23, hx + 44, hy + 28), fill=outline)
    draw.ellipse((hx - 30, hy - 26, hx + 38, hy + 24), fill=skin)
    draw.ellipse((hx + 18, hy - 18, hx + 50, hy + 9), fill=skin, outline=outline, width=3)


def card_image(text: str, border, width: int) -> Image.Image:
    card = Image.new("RGBA", (width, 122), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card, "RGBA")
    draw.rounded_rectangle((8, 16, width - 8, 112), radius=22, fill=(0, 0, 0, 45))
    draw.rounded_rectangle((4, 8, width - 12, 104), radius=22, fill=(255, 252, 236, 255), outline=(52, 48, 67, 255), width=5)
    draw.rounded_rectangle((14, 18, width - 22, 94), radius=15, outline=border, width=5)
    text_center(draw, (18, 10, width - 24, 100), text, NUMBER_FONT, (34, 34, 45, 255))
    return card


def paste_card(frame: Image.Image, center, text: str, rotation: float, border, width: int):
    card = card_image(text, border, width)
    rotated = card.rotate(rotation, resample=Image.Resampling.BICUBIC, expand=True)
    x = int(center[0] - rotated.width / 2)
    y = int(center[1] - rotated.height / 2)
    frame.alpha_composite(rotated, (x, y))


def draw_motion_lines(draw: ImageDraw.ImageDraw, left_hand, right_hand, wave: float):
    lx, ly = left_hand
    rx, ry = right_hand
    alpha = int(120 + 50 * abs(wave))
    draw.arc((lx - 82, ly - 55, lx + 62, ly + 68), 205, 335, fill=(237, 86, 76, alpha), width=5)
    draw.arc((lx - 105, ly - 84, lx + 85, ly + 90), 205, 335, fill=(237, 86, 76, 70), width=3)
    draw.arc((rx - 62, ry - 55, rx + 82, ry + 68), 205, 335, fill=(40, 139, 185, alpha), width=5)
    draw.arc((rx - 85, ry - 84, rx + 105, ry + 90), 205, 335, fill=(40, 139, 185, 70), width=3)


def draw_frame(index: int) -> Image.Image:
    phase = math.tau * index / FRAME_COUNT
    wave = math.sin(phase)
    bounce = math.sin(phase * 2.0) * 4

    frame = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_background(frame, phase)
    draw = ImageDraw.Draw(frame, "RGBA")

    left_y = 355 - 58 * wave
    right_y = 355 + 58 * wave
    left_x = 164 - 9 * math.cos(phase)
    right_x = 476 + 9 * math.cos(phase)
    left_hand = (int(left_x), int(left_y))
    right_hand = (int(right_x), int(right_y))

    draw_motion_lines(draw, left_hand, right_hand, wave)
    draw_body(draw, bounce)
    draw_head(draw, bounce)

    left_shoulder = (246, int(382 + bounce))
    right_shoulder = (394, int(382 + bounce))
    left_elbow = (205, int(405 - 24 * wave + bounce))
    right_elbow = (435, int(405 + 24 * wave + bounce))

    draw_arm(draw, left_shoulder, left_elbow, left_hand, (237, 169, 114, 255))
    draw_arm(draw, right_shoulder, right_elbow, right_hand, (237, 169, 114, 255))

    paste_card(frame, (left_hand[0] - 4, left_hand[1] - 44), "6", -10 - 8 * wave, (236, 83, 73, 255), 120)
    paste_card(frame, (right_hand[0] + 3, right_hand[1] - 44), "12", 10 + 8 * wave, (35, 137, 183, 255), 158)

    draw = ImageDraw.Draw(frame, "RGBA")
    text_center(draw, (230, 574, 410, 612), "6 / 12", SMALL_FONT, (62, 59, 79, 150))
    return frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128)


def make_contact_sheet(frames: list[Image.Image]):
    picks = [0, 6, 12, 18]
    sheet = Image.new("RGB", (SIZE * 2, SIZE * 2), (250, 248, 238))
    for n, pick in enumerate(picks):
        tile = frames[pick].convert("RGB")
        x = (n % 2) * SIZE
        y = (n // 2) * SIZE
        sheet.paste(tile, (x, y))
    sheet = sheet.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    sheet.save(OUT_CONTACT)


def main():
    OUT_GIF.parent.mkdir(parents=True, exist_ok=True)
    frames = [draw_frame(i) for i in range(FRAME_COUNT)]
    frames[0].save(
        OUT_GIF,
        save_all=True,
        append_images=frames[1:],
        duration=DURATION_MS,
        loop=0,
        optimize=False,
        disposal=2,
    )
    make_contact_sheet(frames)
    print(OUT_GIF)
    print(OUT_CONTACT)


if __name__ == "__main__":
    main()
