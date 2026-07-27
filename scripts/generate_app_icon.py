from __future__ import annotations

import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "build" / "appicon.png"
OUTPUT = ROOT / "build" / "windows" / "icon.ico"
SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg is required to rasterize icon sizes")
    if not SOURCE.exists():
        raise SystemExit(f"missing icon source: {SOURCE}")

    images: list[tuple[int, bytes]] = []
    with tempfile.TemporaryDirectory(prefix="boundless-icon-") as temp:
        temp_dir = Path(temp)
        for size in SIZES:
            target = temp_dir / f"icon-{size}.png"
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    str(SOURCE),
                    "-vf",
                    f"scale={size}:{size}:flags=lanczos",
                    "-frames:v",
                    "1",
                    str(target),
                ],
                check=True,
            )
            data = target.read_bytes()
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RuntimeError(f"invalid PNG generated for {size}px")
            images.append((size, data))

    header_size = 6 + len(images) * 16
    offset = header_size
    entries = []
    payload = []
    for size, data in images:
        entries.append(
            struct.pack(
                "<BBBBHHII",
                0 if size == 256 else size,
                0 if size == 256 else size,
                0,
                0,
                1,
                32,
                len(data),
                offset,
            )
        )
        payload.append(data)
        offset += len(data)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(struct.pack("<HHH", 0, 1, len(images)) + b"".join(entries) + b"".join(payload))
    print(f"created {OUTPUT} with sizes: {', '.join(map(str, SIZES))}")


if __name__ == "__main__":
    main()