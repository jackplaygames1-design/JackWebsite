from pathlib import Path
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
LIBRARY = Path(r"C:\Users\jackp\OneDrive\Desktop\Jack_Sockwell_Portfolio_2026\asset library")

IMPORTS = {
    LIBRARY / "2026" / "Thebest" / "caine.png": ROOT / "portfolio-assets" / "2026" / "amazing-digital-circus" / "caine.webp",
    LIBRARY / "2026" / "Thebest" / "jax.png": ROOT / "portfolio-assets" / "2026" / "amazing-digital-circus" / "jax.webp",
    LIBRARY / "2026" / "Thebest" / "pomni.png": ROOT / "portfolio-assets" / "2026" / "amazing-digital-circus" / "pomni.webp",
    LIBRARY / "2026" / "Thebest" / "rag.png": ROOT / "portfolio-assets" / "2026" / "amazing-digital-circus" / "ragatha.webp",
    LIBRARY / "2023" / "Screenshot 2023-06-18 002231.png": ROOT / "portfolio-assets" / "2023" / "rainbow-friends-environments" / "ferris-wheel.webp",
    LIBRARY / "2023" / "Screenshot 2023-06-18 000425.png": ROOT / "portfolio-assets" / "2023" / "rainbow-friends-environments" / "castle-courtyard.webp",
    LIBRARY / "2023" / "Screenshot 2023-06-18 212624.png": ROOT / "portfolio-assets" / "2023" / "rainbow-friends-environments" / "stone-corridor.webp",
    LIBRARY / "2023" / "Screenshot 2023-06-19 045652.png": ROOT / "portfolio-assets" / "2023" / "rainbow-friends-environments" / "throne-room.webp",
}

for index, source in enumerate(sorted((LIBRARY / "colorsimulator").glob("*.png")), start=1):
    IMPORTS[source] = ROOT / "portfolio-assets" / "2026" / "color-simulator" / f"asset-{index:02d}.webp"


def save_webp(source: Path, destination: Path) -> None:
    if not source.exists():
        raise FileNotFoundError(source)

    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original)
        image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
        image.save(destination, "WEBP", quality=88, method=6)
    print(f"{source} -> {destination.relative_to(ROOT)}")


for source_path, destination_path in IMPORTS.items():
    save_webp(source_path, destination_path)
