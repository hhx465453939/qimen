#!/usr/bin/env python3
"""生成 Android 启动图标（含自适应图标）与启动图（CHG-001 / ADR-005）。

源图：icons/icon-512.png（仓库内既有资产）
输出：android/app/src/main/res/**
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "icons" / "icon-512.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
BACKGROUND = (0x23, 0x55, 0xC4, 0xFF)   # manifest theme_color #2355c4
SPLASH_BG = (0xF8, 0xF9, 0xFD, 0xFF)   # manifest background_color #f8f9fd


def load_source() -> Image.Image:
    if not SRC.exists():
        raise SystemExit(f"源图标不存在: {SRC}")
    return Image.open(SRC).convert("RGBA")


def circular(img: Image.Image) -> Image.Image:
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main() -> None:
    src = load_source()
    RES.mkdir(parents=True, exist_ok=True)

    written = []
    for density, size in DENSITIES.items():
        d = RES / f"mipmap-{density}"
        d.mkdir(parents=True, exist_ok=True)

        legacy = src.resize((size, size), Image.LANCZOS)
        legacy.save(d / "ic_launcher.png", optimize=True)
        circular(legacy).save(d / "ic_launcher_round.png", optimize=True)

        # 自适应图标前景：透明画布 + 居中 62% 安全区
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        inner = max(1, int(size * 0.62))
        logo = src.resize((inner, inner), Image.LANCZOS)
        offset = (size - inner) // 2
        fg.paste(logo, (offset, offset), logo)
        fg.save(d / "ic_launcher_foreground.png", optimize=True)
        written.append(f"mipmap-{density}")

    # 自适应图标描述（Android 8.0+）
    anydpi = RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n'
    )
    (anydpi / "ic_launcher.xml").write_text(xml, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(xml, encoding="utf-8")

    # 清掉模板的多密度启动图变体（统一用单张 drawable/splash.png，避免旧图抢先命中）
    for stale in list(RES.glob("drawable-port-*")) + list(RES.glob("drawable-land-*")):
        for f in stale.glob("splash.png"):
            f.unlink()
        try:
            stale.rmdir()
        except OSError:
            pass

    # 启动图：单张 1024 方图，由主题居中铺底
    drawable = RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)
    splash = Image.new("RGBA", (1024, 1024), SPLASH_BG)
    logo = src.resize((420, 420), Image.LANCZOS)
    splash.paste(logo, ((1024 - 420) // 2, (1024 - 420) // 2), logo)
    splash.save(drawable / "splash.png", optimize=True)

    print(f"[icons] 完成：{len(written)} 个密度 + 自适应图标 + 启动图")
    print(f"[icons] 输出目录: {RES}")


if __name__ == "__main__":
    main()
