#!/usr/bin/env python3
"""
Generate all Android, iOS, and Flutter app icons and notification assets
from apps/web/public/onlyorders-mark.png using ffmpeg.
"""

import os
import subprocess
import json

SOURCE = "apps/web/public/onlyorders-mark.png"
BG_COLOR = "0x141234"  # OnlyOrders deep midnight navy brand color

def run_cmd(cmd):
    p = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        print(f"Error running: {cmd}\n{p.stderr}")
        raise RuntimeError(p.stderr)

def main():
    assert os.path.exists(SOURCE), f"Source image {SOURCE} not found!"
    print(f"Using source: {SOURCE}")

    # =========================================================================
    # 1. Android Adaptive Foregrounds (mipmap-*/ic_launcher_foreground.png)
    # Safe zone ~ 65% of canvas centered with transparent padding
    # =========================================================================
    adaptive_sizes = {
        "mipmap-mdpi": (108, 70),
        "mipmap-hdpi": (162, 105),
        "mipmap-xhdpi": (216, 140),
        "mipmap-xxhdpi": (324, 210),
        "mipmap-xxxhdpi": (432, 280),
    }

    for folder, (canvas, mark) in adaptive_sizes.items():
        out_dir = f"flutter/android/app/src/main/res/{folder}"
        os.makedirs(out_dir, exist_ok=True)
        out_file = f"{out_dir}/ic_launcher_foreground.png"
        cmd = (
            f"ffmpeg -y -i {SOURCE} "
            f"-vf \"scale={mark}:{mark}:force_original_aspect_ratio=decrease,pad={canvas}:{canvas}:(ow-iw)/2:(oh-ih)/2:color=0x00000000\" "
            f"-frames:v 1 -update 1 {out_file}"
        )
        run_cmd(cmd)
        print(f"Generated adaptive foreground: {out_file} ({canvas}x{canvas})")

    # =========================================================================
    # 2. Android Legacy / Installer Launcher Icons (mipmap-*/ic_launcher.png)
    # Rounded rectangle on #141234 background
    # =========================================================================
    legacy_sizes = {
        "mipmap-mdpi": (48, 34, 10),
        "mipmap-hdpi": (72, 51, 14),
        "mipmap-xhdpi": (96, 68, 19),
        "mipmap-xxhdpi": (144, 102, 29),
        "mipmap-xxxhdpi": (192, 136, 38),
    }

    for folder, (canvas, mark, radius) in legacy_sizes.items():
        out_dir = f"flutter/android/app/src/main/res/{folder}"
        os.makedirs(out_dir, exist_ok=True)
        out_file = f"{out_dir}/ic_launcher.png"
        half = canvas // 2
        d = half - radius
        cmd = (
            f"ffmpeg -y -i {SOURCE} -filter_complex \""
            f"[0:v]scale={mark}:{mark}:force_original_aspect_ratio=decrease[mark];"
            f"color=color={BG_COLOR}:s={canvas}x{canvas},format=rgba[bg];"
            f"[bg][mark]overlay=(W-w)/2:(H-h)/2[combined];"
            f"color=black:s={canvas}x{canvas},format=gray,geq='lum=if(lte(pow(max(abs(X-{half})-{d},0),2)+pow(max(abs(Y-{half})-{d},0),2),pow({radius},2)),255,0)'[mask];"
            f"[combined][mask]alphamerge\" -frames:v 1 -update 1 {out_file}"
        )
        run_cmd(cmd)
        print(f"Generated launcher icon: {out_file} ({canvas}x{canvas})")

    # =========================================================================
    # 3. Android Round Icons (mipmap-*/ic_launcher_round.png)
    # Circular mask on #141234 background
    # =========================================================================
    for folder, (canvas, mark, _) in legacy_sizes.items():
        out_dir = f"flutter/android/app/src/main/res/{folder}"
        os.makedirs(out_dir, exist_ok=True)
        out_file = f"{out_dir}/ic_launcher_round.png"
        half = canvas // 2
        cmd = (
            f"ffmpeg -y -i {SOURCE} -filter_complex \""
            f"[0:v]scale={mark}:{mark}:force_original_aspect_ratio=decrease[mark];"
            f"color=color={BG_COLOR}:s={canvas}x{canvas},format=rgba[bg];"
            f"[bg][mark]overlay=(W-w)/2:(H-h)/2[combined];"
            f"color=black:s={canvas}x{canvas},format=gray,geq='lum=if(lte(hypot(X-{half},Y-{half}),{half-1}),255,0)'[mask];"
            f"[combined][mask]alphamerge\" -frames:v 1 -update 1 {out_file}"
        )
        run_cmd(cmd)
        print(f"Generated round launcher icon: {out_file} ({canvas}x{canvas})")

    # =========================================================================
    # 4. Android Status Bar Notification Small Icons (drawable-*/ic_notification.png)
    # Pure white (#FFFFFF) silhouette with alpha transparency matching mark
    # =========================================================================
    notif_sizes = {
        "drawable": (48, 42),
        "drawable-mdpi": (24, 20),
        "drawable-hdpi": (36, 30),
        "drawable-xhdpi": (48, 42),
        "drawable-xxhdpi": (72, 62),
        "drawable-xxxhdpi": (96, 84),
    }

    for folder, (canvas, mark) in notif_sizes.items():
        out_dir = f"flutter/android/app/src/main/res/{folder}"
        os.makedirs(out_dir, exist_ok=True)
        out_file = f"{out_dir}/ic_notification.png"
        cmd = (
            f"ffmpeg -y -i {SOURCE} -filter_complex \""
            f"[0:v]scale={mark}:{mark}:force_original_aspect_ratio=decrease,pad={canvas}:{canvas}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba,alphaextract[alpha];"
            f"color=white:s={canvas}x{canvas},format=rgba[white];"
            f"[white][alpha]alphamerge\" -frames:v 1 -update 1 {out_file}"
        )
        run_cmd(cmd)
        print(f"Generated notification silhouette: {out_file} ({canvas}x{canvas})")

    # =========================================================================
    # 5. Android Notification Large Icons (drawable-*/ic_notification_large.png)
    # Full color brand logo in notification drawer
    # =========================================================================
    for folder, (canvas, mark) in notif_sizes.items():
        out_dir = f"flutter/android/app/src/main/res/{folder}"
        os.makedirs(out_dir, exist_ok=True)
        out_file = f"{out_dir}/ic_notification_large.png"
        half = canvas // 2
        cmd = (
            f"ffmpeg -y -i {SOURCE} -filter_complex \""
            f"[0:v]scale={mark}:{mark}:force_original_aspect_ratio=decrease[mark];"
            f"color=color={BG_COLOR}:s={canvas}x{canvas},format=rgba[bg];"
            f"[bg][mark]overlay=(W-w)/2:(H-h)/2[combined];"
            f"color=black:s={canvas}x{canvas},format=gray,geq='lum=if(lte(hypot(X-{half},Y-{half}),{half-1}),255,0)'[mask];"
            f"[combined][mask]alphamerge\" -frames:v 1 -update 1 {out_file}"
        )
        run_cmd(cmd)
        print(f"Generated notification large icon: {out_file} ({canvas}x{canvas})")

    # =========================================================================
    # 6. iOS AppIcon Requirements (flutter/ios/Runner/Assets.xcassets/AppIcon.appiconset)
    # Solid #141234 background with centered mark (RGB24, no transparency per Apple specs)
    # =========================================================================
    ios_icons = [
        {"name": "Icon-App-20x20@2x.png", "size": 40, "mark": 28, "idiom": "iphone", "size_pt": "20x20", "scale": "2x"},
        {"name": "Icon-App-20x20@3x.png", "size": 60, "mark": 42, "idiom": "iphone", "size_pt": "20x20", "scale": "3x"},
        {"name": "Icon-App-29x29@1x.png", "size": 29, "mark": 20, "idiom": "iphone", "size_pt": "29x29", "scale": "1x"},
        {"name": "Icon-App-29x29@2x.png", "size": 58, "mark": 40, "idiom": "iphone", "size_pt": "29x29", "scale": "2x"},
        {"name": "Icon-App-29x29@3x.png", "size": 87, "mark": 60, "idiom": "iphone", "size_pt": "29x29", "scale": "3x"},
        {"name": "Icon-App-40x40@2x.png", "size": 80, "mark": 56, "idiom": "iphone", "size_pt": "40x40", "scale": "2x"},
        {"name": "Icon-App-40x40@3x.png", "size": 120, "mark": 84, "idiom": "iphone", "size_pt": "40x40", "scale": "3x"},
        {"name": "Icon-App-60x60@2x.png", "size": 120, "mark": 84, "idiom": "iphone", "size_pt": "60x60", "scale": "2x"},
        {"name": "Icon-App-60x60@3x.png", "size": 180, "mark": 126, "idiom": "iphone", "size_pt": "60x60", "scale": "3x"},
        {"name": "Icon-App-20x20@1x.png", "size": 20, "mark": 14, "idiom": "ipad", "size_pt": "20x20", "scale": "1x"},
        {"name": "Icon-App-20x20@2x-ipad.png", "size": 40, "mark": 28, "idiom": "ipad", "size_pt": "20x20", "scale": "2x"},
        {"name": "Icon-App-29x29@1x-ipad.png", "size": 29, "mark": 20, "idiom": "ipad", "size_pt": "29x29", "scale": "1x"},
        {"name": "Icon-App-29x29@2x-ipad.png", "size": 58, "mark": 40, "idiom": "ipad", "size_pt": "29x29", "scale": "2x"},
        {"name": "Icon-App-40x40@1x.png", "size": 40, "mark": 28, "idiom": "ipad", "size_pt": "40x40", "scale": "1x"},
        {"name": "Icon-App-40x40@2x-ipad.png", "size": 80, "mark": 56, "idiom": "ipad", "size_pt": "40x40", "scale": "2x"},
        {"name": "Icon-App-76x76@1x.png", "size": 76, "mark": 54, "idiom": "ipad", "size_pt": "76x76", "scale": "1x"},
        {"name": "Icon-App-76x76@2x.png", "size": 152, "mark": 108, "idiom": "ipad", "size_pt": "76x76", "scale": "2x"},
        {"name": "Icon-App-83.5x83.5@2x.png", "size": 167, "mark": 118, "idiom": "ipad", "size_pt": "83.5x83.5", "scale": "2x"},
        {"name": "ItunesArtwork@2x.png", "size": 1024, "mark": 720, "idiom": "ios-marketing", "size_pt": "1024x1024", "scale": "1x"},
    ]

    ios_dir = "flutter/ios/Runner/Assets.xcassets/AppIcon.appiconset"
    os.makedirs(ios_dir, exist_ok=True)

    contents_images = []
    for item in ios_icons:
        filename = item["name"]
        size = item["size"]
        mark = item["mark"]
        out_file = f"{ios_dir}/{filename}"
        cmd = (
            f"ffmpeg -y -i {SOURCE} -filter_complex \""
            f"[0:v]scale={mark}:{mark}:force_original_aspect_ratio=decrease[mark];"
            f"color=color={BG_COLOR}:s={size}x{size},format=rgb24[bg];"
            f"[bg][mark]overlay=(W-w)/2:(H-h)/2\" -frames:v 1 -update 1 {out_file}"
        )
        run_cmd(cmd)
        contents_images.append({
            "size": item["size_pt"],
            "idiom": item["idiom"],
            "filename": filename,
            "scale": item["scale"]
        })
        print(f"Generated iOS icon: {out_file} ({size}x{size})")

    contents_json = {
        "images": contents_images,
        "info": {
            "version": 1,
            "author": "xcode"
        }
    }
    with open(f"{ios_dir}/Contents.json", "w") as f:
        json.dump(contents_json, f, indent=2)
    print(f"Generated iOS Contents.json at {ios_dir}/Contents.json")

    # =========================================================================
    # 7. Flutter Assets (flutter/assets/)
    # =========================================================================
    flutter_assets = [
        ("flutter/assets/logo.png", 512, 360),
        ("flutter/assets/icon-192.png", 192, 136),
        ("flutter/assets/icon-96.png", 96, 68),
    ]

    for out_file, size, mark in flutter_assets:
        cmd = (
            f"ffmpeg -y -i {SOURCE} -filter_complex \""
            f"[0:v]scale={mark}:{mark}:force_original_aspect_ratio=decrease[mark];"
            f"color=color={BG_COLOR}:s={size}x{size},format=rgba[bg];"
            f"[bg][mark]overlay=(W-w)/2:(H-h)/2\" -frames:v 1 -update 1 {out_file}"
        )
        run_cmd(cmd)
        print(f"Generated Flutter asset: {out_file} ({size}x{size})")

    # Copy original mark to flutter/assets/onlyorders-mark.png
    run_cmd(f"cp -f {SOURCE} flutter/assets/onlyorders-mark.png")
    print("Copied onlyorders-mark.png to flutter/assets/onlyorders-mark.png")

if __name__ == "__main__":
    main()
