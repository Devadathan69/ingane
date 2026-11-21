"""Create local browser test inputs from the redistributable practice photograph (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

root = Path(__file__).resolve().parents[1]
target = root / "tmp" / "fixtures"
target.mkdir(parents=True, exist_ok=True)
source = root / "public" / "devices" / "coolux-practice.jpg"
photo = Image.open(source).convert("RGB")
(target / "practice.jpg").write_bytes(source.read_bytes())
photo.filter(ImageFilter.GaussianBlur(12)).save(target / "practice-blurry.jpg")
rotated = photo.transpose(Image.Transpose.ROTATE_90)
metadata = Image.Exif()
metadata[274] = 6
metadata[271] = "TestCam"
metadata[270] = "SECRET-METADATA"
rotated.save(target / "practice-rotated.jpg", quality=90, exif=metadata)
rotated.save(target / "landscape.jpg", quality=90)
screen = Image.new("RGB", (800, 450), "#152b29")
draw = ImageDraw.Draw(screen)
for i, label in enumerate(("TV", "HDMI 1", "HDMI 2")):
    draw.text((65, 70 + 70 * i), label, fill="white", font_size=38)
screen.save(target / "tv-screen.jpg")
(target / "photo.heic").write_bytes(b"\0\0\0\x18ftypheic" + bytes(25))
(target / "notes.txt").write_text("This fixture contains plain text.", encoding="utf-8")
print("Browser test fixtures are ready in tmp/fixtures.")
