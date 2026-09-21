#!/usr/bin/env python3
"""Build review contact sheets from a paper-mining run."""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "run",
        nargs="?",
        type=Path,
        default=Path("dataset/_derived/paper-mining-v0.1"),
    )
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--rows", type=int, default=4)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    run = args.run.resolve()
    assets = {record["asset_id"]: record for record in read_jsonl(run / "visual-assets.jsonl")}
    plans = read_jsonl(run / "visual-plans.jsonl")
    grouped: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    for plan in plans:
        for figure in plan["figures"]:
            for asset_id in figure["source_asset_ids"]:
                asset = assets.get(asset_id)
                if asset:
                    grouped[figure["primary_family"]].append((plan, asset))

    output = run / "contact-sheets"
    output.mkdir(exist_ok=True)
    tile_width, tile_height, caption_height = 320, 230, 42
    per_sheet = args.columns * args.rows
    font = ImageFont.load_default(size=14)
    manifest: list[dict[str, Any]] = []
    for family, records in sorted(grouped.items()):
        for sheet_index in range(math.ceil(len(records) / per_sheet)):
            batch = records[sheet_index * per_sheet : (sheet_index + 1) * per_sheet]
            sheet = Image.new(
                "RGB",
                (args.columns * tile_width, args.rows * (tile_height + caption_height)),
                "white",
            )
            draw = ImageDraw.Draw(sheet)
            for item_index, (plan, asset) in enumerate(batch):
                row, column = divmod(item_index, args.columns)
                x = column * tile_width
                y = row * (tile_height + caption_height)
                with Image.open(run / asset["path"]) as source:
                    image = source.convert("RGB")
                    image.thumbnail((tile_width - 12, tile_height - 12))
                    image_x = x + (tile_width - image.width) // 2
                    image_y = y + (tile_height - image.height) // 2
                    sheet.paste(image, (image_x, image_y))
                caption = (
                    f"q:{plan['question_id'][2:12]}  p:{asset['page']}\n"
                    f"asset:{asset['asset_id'][4:14]}"
                )
                draw.multiline_text(
                    (x + 6, y + tile_height + 4), caption, fill="black", font=font, spacing=2
                )
            filename = f"{family}-{sheet_index + 1:02d}.jpg"
            sheet.save(output / filename, quality=88, optimize=True)
            manifest.append(
                {
                    "family": family,
                    "sheet": filename,
                    "items": len(batch),
                    "first_asset_id": batch[0][1]["asset_id"],
                    "last_asset_id": batch[-1][1]["asset_id"],
                }
            )
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(manifest)} contact sheets to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
