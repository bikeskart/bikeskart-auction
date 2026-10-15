"""Prepare the existing brand icon on macOS; no new artwork or credentials required."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent
assets = root / 'BikesKartAuction' / 'Assets.xcassets'
icon = assets / 'AppIcon.appiconset'
icon.mkdir(parents=True, exist_ok=True)
subprocess.run([
    'sips', '-s', 'format', 'jpeg', '-z', '1024', '1024',
    str(root.parent / 'android/app/src/main/res/drawable/icon.png'),
    '--out', str(icon / 'AppIcon.jpg'),
], check=True)
(assets / 'Contents.json').write_text(json.dumps({'info': {'author': 'xcode', 'version': 1}}, indent=2))
(icon / 'Contents.json').write_text(json.dumps({
    'images': [{'filename': 'AppIcon.jpg', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}],
    'info': {'author': 'xcode', 'version': 1},
}, indent=2))
