#!/usr/bin/env python3
"""Mine IB Physics question packages and visual-template plans from PDF papers.

Raw papers are never modified. The command writes a derived, reviewable run under
``dataset/_derived`` by default. Born-digital PDFs use their text and vector
geometry directly; scanned papers can be OCRed with RapidOCR.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pymupdf


EXTRACTION_VERSION = "paper-miner/0.1.0"
VISUAL_SCHEMA_VERSION = "visual-spec/0.1.0"
DEFAULT_OUTPUT = Path("dataset/_derived/paper-mining-v0.1")

ZONE_ALIASES = {"A": "1", "B": "2", "C": "3"}

VISUAL_FAMILIES: dict[str, dict[str, Any]] = {
    "cartesian_plot": {
        "template": "plot.cartesian.v1",
        "primitives": ["axis", "tick", "data-series", "curve", "region", "label"],
        "patterns": [
            r"\bgraph\b",
            r"\bplot\b",
            r"\baxes?\b",
            r"\bgradient\b",
            r"\bvariation\s+(?:of|with)\b",
            r"\bline of best fit\b",
            r"\b(?:p\s*[−–-]\s*v|pressure[– -]volume|spacetime|minkowski|hertzsprung[– -]russell|hr)\b.{0,20}\bdiagram\b",
            r"\b(?:Carnot|isothermal|adiabatic)\b.{0,100}\b(?:P\s*[−–-]\s*V|pressure[– -]volume)\b",
            r"\b(?:pressure|force|acceleration|velocity|current|voltage|energy|power|momentum|displacement|temperature)\b.{0,40}\b(?:with|against|versus)\b",
        ],
    },
    "circuit_network": {
        "template": "network.circuit.v1",
        "primitives": ["wire", "junction", "component", "meter", "source", "label"],
        "patterns": [
            r"\bcircuit\b",
            r"\bresistors?\b",
            r"\bthermistors?\b",
            r"\bvoltmeter\b",
            r"\bammeter\b",
            r"\bdiodes?\b",
            r"\bcapacitors?\b",
            r"\belectrical cell\b",
        ],
    },
    "vector_force": {
        "template": "vector.force.v1",
        "primitives": ["object", "vector", "origin", "coordinate-axis", "label"],
        "patterns": [
            r"\bfree[ -]body\b",
            r"\bforce diagram\b",
            r"\bvector diagram\b",
            r"\bresultant (?:force|vector)\b",
            r"\bcomponents? of (?:the )?force\b",
        ],
    },
    "ray_wave": {
        "template": "path.ray-wave.v1",
        "primitives": ["boundary", "ray", "wavefront", "normal", "angle", "label"],
        "patterns": [
            r"\bray diagram\b",
            r"\blens\b",
            r"\bmirror\b",
            r"\brefraction\b",
            r"\bwavefront\b",
            r"\bdiffraction\b",
            r"\bslits?\b",
            r"\binterference pattern\b",
            r"\brefractive indices?\b",
            r"\bray of light\b",
        ],
    },
    "field_map": {
        "template": "field.map.v1",
        "primitives": ["source", "field-line", "equipotential", "vector", "label"],
        "patterns": [
            r"\bfield lines?\b",
            r"\bequipotential\b",
            r"\belectric field pattern\b",
            r"\bmagnetic field pattern\b",
            r"\bflux lines?\b",
        ],
    },
    "experimental_apparatus": {
        "template": "scene.apparatus.v1",
        "primitives": ["apparatus", "connector", "sensor", "sample", "dimension", "label"],
        "patterns": [
            r"\bapparatus\b",
            r"\bexperimental set[ -]?up\b",
            r"\bexperiment shown\b",
            r"\bsensor\b",
            r"\bdata logger\b",
            r"\boscilloscope\b",
        ],
    },
    "data_table": {
        "template": "data.table.v1",
        "primitives": ["table", "header", "cell", "uncertainty", "unit"],
        "patterns": [
            r"\btable shows\b",
            r"\bdata (?:are|is) shown\b",
            r"\bfollowing table\b",
            r"\btabulated\b",
        ],
    },
    "energy_level": {
        "template": "levels.energy.v1",
        "primitives": ["level", "transition", "continuum", "particle", "label"],
        "patterns": [
            r"\benergy levels?\b",
            r"\btransition diagram\b",
            r"\benergy states?\b",
            r"\bground state\b.*\bexcited state\b",
        ],
    },
    "particle_interaction": {
        "template": "particle.interaction.v1",
        "primitives": ["particle", "track", "vertex", "interaction-line", "label"],
        "patterns": [
            r"\bfeynman\b",
            r"\bparticle tracks?\b",
            r"\bdecay diagram\b",
            r"\bnuclear reaction\b.*\bdiagram\b",
        ],
    },
    "material_particle_model": {
        "template": "matter.particle-model.v1",
        "primitives": ["particle", "bond", "container", "piston", "label"],
        "patterns": [
            r"\bparticle model\b",
            r"\bmolecular model\b",
            r"\blattice\b",
            r"\bpiston\b",
            r"\bparticles? in (?:a )?(?:box|container)\b",
        ],
    },
    "mechanics_scene": {
        "template": "scene.mechanics.v1",
        "primitives": ["object", "surface", "connector", "path", "dimension", "angle", "vector", "label"],
        "patterns": [
            r"\bprojectile\b",
            r"\b(?:inclined plane|ramp)\b",
            r"\bpulleys?\b",
            r"\b(?:blocks?|carts?)\b.{0,100}\b(?:force|friction|string|collid)",
            r"\b(?:ball|stone)\b.{0,100}\b(?:string|vertical circle|thrown|path)\b",
            r"\b(?:rolls?|rolling)\b.{0,100}\b(?:wheel|cylinder|sphere|incline)",
            r"\b(?:angular momentum|moment of inertia)\b",
            r"\bmass[– -]spring system\b",
            r"\bairbags?\b.{0,80}\bboat\b",
        ],
    },
    "electromagnetic_scene": {
        "template": "scene.electromagnetic.v1",
        "primitives": ["source", "object", "surface", "path", "vector", "dimension", "label"],
        "patterns": [
            r"\bcharged (?:parallel )?plates?\b",
            r"\bpoint charges?\b",
            r"\bcharged (?:spheres?|particles?|rod)\b",
            r"\b(?:electric|magnetic) field\b.{0,100}\b(?:particle|proton|electron|coil|ring|wire|rod|plate|path)",
            r"\bconducting (?:rod|ring|rails?|spheres?)\b",
            r"\bcurrent[ -]carrying wires?\b",
            r"\b(?:circular|rectangular) (?:coil|ring)\b",
            r"\bfalling magnet\b",
            r"\bcharge carriers?\b.{0,100}\bcoil\b",
        ],
    },
    "thermal_energy_scene": {
        "template": "scene.thermal-energy.v1",
        "primitives": ["object", "surface", "region", "path", "dimension", "label"],
        "patterns": [
            r"\bblock of ice\b.{0,160}\b(?:water|melt(?:s|ing|ed)?|thermal|temperature)\b",
            r"\bthermal conductiv",
            r"\bheat (?:engine|flow|transfer)\b",
            r"\benergy balance model\b",
            r"\bradiated (?:energy|intensit)",
            r"\b(?:conduction|convection|radiation)\b.{0,100}\b(?:diagram|shown|surface|layer)",
        ],
    },
    "spatial_orbital": {
        "template": "scene.spatial-orbital.v1",
        "primitives": ["body", "orbit", "path", "radius", "angle", "label"],
        "patterns": [
            r"\borbit\b",
            r"\bsatellite\b.*\bshown\b",
            r"\bplanet\b.*\bdiagram\b",
            r"\bstar system\b",
        ],
    },
    "geometry_scene": {
        "template": "scene.geometry.v1",
        "primitives": ["object", "surface", "path", "dimension", "angle", "vector", "label"],
        "patterns": [
            r"\bdiagram\b",
            r"\bshown\b",
            r"\bnot to scale\b",
            r"\barrangement\b",
            r"\bposition shown\b",
            r"\bpath shown\b",
        ],
    },
    "annotated_image": {
        "template": "image.annotated.v1",
        "primitives": ["image", "callout", "scale-bar", "region", "label"],
        "patterns": [
            r"\bphotograph\b",
            r"\bimage shows\b",
            r"\bthermal image\b",
            r"\bx-ray image\b",
        ],
    },
}

VISUAL_CUE = re.compile(
    r"\b(?:diagram|graph|plot|figure|shown|sketch|draw|axes?|image|photograph|"
    r"circuit|table|variation|not to scale|arrangement|waveform|field lines?)\b",
    re.IGNORECASE,
)
QUESTION_MARKER = re.compile(r"^\s*(\d{1,2})(?:\.\s*|\s*$)(.*)$")
MARK_PATTERN = re.compile(r"\[(\d{1,2})\]")
OPTION_PATTERN = re.compile(r"^\s*([A-D])\.\s*(.*)$")
SUBPART_PATTERN = re.compile(r"^\s*\(([a-z])\)\s*(.*)$", re.IGNORECASE)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_id(*parts: str, length: int = 20) -> str:
    value = "\x1f".join(parts).encode("utf-8")
    return hashlib.sha256(value).hexdigest()[:length]


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jsonl(path: Path, records: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def parse_zone(name: str) -> str | None:
    normalized = re.sub(r"[_-]+", " ", name)
    match = re.search(r"\bTZ\s*([123ABC])\b", normalized, re.IGNORECASE)
    if not match:
        match = re.search(r"\bZone\s*([ABC])\b", normalized, re.IGNORECASE)
    if not match:
        return None
    token = match.group(1).upper()
    return ZONE_ALIASES.get(token, token)


def classify_source(path: Path, dataset_root: Path) -> dict[str, Any]:
    relative = path.relative_to(dataset_root)
    relative_text = relative.as_posix()
    lowered = relative_text.lower()
    year_match = re.search(r"(20\d{2}) Examination Session", relative_text)
    year = int(year_match.group(1)) if year_match else None
    if "november" in lowered or re.search(r"\bN\d{2}\b", relative_text, re.IGNORECASE):
        session = "november"
    elif "may" in lowered or re.search(r"\bM\d{2}\b", relative_text, re.IGNORECASE):
        session = "may"
    else:
        session = "unknown"

    stem = path.stem
    stem_lower = stem.lower()
    normalized_stem = re.sub(r"[_-]+", " ", stem)
    if re.search(r"(?:\bpaper\s*|\bP)1A\b", normalized_stem, re.IGNORECASE):
        paper = "1A"
    elif re.search(r"(?:\bpaper\s*|\bP)2\b", normalized_stem, re.IGNORECASE):
        paper = "2"
    else:
        paper = None
    level_match = re.search(r"\b(HL|SL)\b", normalized_stem, re.IGNORECASE)
    level = level_match.group(1).upper() if level_match else None
    language = "fr" if "french" in stem_lower else "en"
    role = "markscheme" if "markscheme" in stem_lower else "question_paper"
    source_kind = "donated_scan" if "donated papers" in lowered else "official_pdf"
    checksum = sha256_file(path)
    source_id = "src_" + stable_id(relative_text, checksum)
    return {
        "source_id": source_id,
        "relative_path": relative_text,
        "filename": path.name,
        "sha256": checksum,
        "bytes": path.stat().st_size,
        "year": year,
        "session": session,
        "paper": paper,
        "level": level,
        "zone": parse_zone(stem),
        "language": language,
        "role": role,
        "source_kind": source_kind,
        "duplicate_of": None,
        "duplicate_method": None,
    }


def source_match_key(source: dict[str, Any]) -> tuple[Any, ...]:
    return (
        source["year"],
        source["session"],
        source["paper"],
        source["level"],
        source["zone"],
        source["language"],
        source["role"],
    )


def link_duplicates(sources: list[dict[str, Any]]) -> None:
    by_checksum: dict[str, dict[str, Any]] = {}
    for source in sorted(sources, key=lambda item: item["source_kind"] != "official_pdf"):
        canonical = by_checksum.get(source["sha256"])
        if canonical:
            source["duplicate_of"] = canonical["source_id"]
            source["duplicate_method"] = "sha256"
        else:
            by_checksum[source["sha256"]] = source

    official_by_key = {
        source_match_key(source): source
        for source in sources
        if source["source_kind"] == "official_pdf"
    }
    for source in sources:
        if source["duplicate_of"] or source["source_kind"] != "donated_scan":
            continue
        canonical = official_by_key.get(source_match_key(source))
        if canonical:
            source["duplicate_of"] = canonical["source_id"]
            source["duplicate_method"] = "session-paper-level-zone metadata"


def native_page_lines(page: pymupdf.Page) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    content = page.get_text("dict", sort=True)
    for block in content.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
            if not text:
                continue
            bbox = [round(float(value), 2) for value in line["bbox"]]
            lines.append({"text": text, "bbox": bbox, "confidence": 1.0})
    return sorted(lines, key=lambda item: (round(item["bbox"][1] / 3), item["bbox"][0]))


def load_ocr() -> Any:
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as error:
        raise RuntimeError(
            "Scanned OCR requested but RapidOCR is unavailable. Install "
            "scripts/paper-mining/requirements-ocr.txt."
        ) from error
    return RapidOCR()


def ocr_page_lines(page: pymupdf.Page, engine: Any, dpi: int) -> list[dict[str, Any]]:
    import numpy as np

    scale = dpi / 72
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(
        pixmap.height, pixmap.width, pixmap.n
    )
    result, _ = engine(pixels)
    lines: list[dict[str, Any]] = []
    for item in result or []:
        points, text, confidence = item
        xs = [float(point[0]) / scale for point in points]
        ys = [float(point[1]) / scale for point in points]
        lines.append(
            {
                "text": str(text).strip(),
                "bbox": [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)],
                "confidence": round(float(confidence), 4),
            }
        )
    return sorted(lines, key=lambda item: (round(item["bbox"][1] / 4), item["bbox"][0]))


def profile_pdf(path: Path) -> dict[str, Any]:
    document = pymupdf.open(path)
    char_counts: list[int] = []
    image_counts: list[int] = []
    for page in document:
        char_counts.append(len(page.get_text("text").strip()))
        image_counts.append(len(page.get_images(full=True)))
    textless_pages = sum(count < 40 for count in char_counts)
    scanned = bool(char_counts) and textless_pages / len(char_counts) >= 0.8
    return {
        "page_count": len(document),
        "native_text_characters": sum(char_counts),
        "median_native_characters_per_page": round(statistics.median(char_counts), 1)
        if char_counts
        else 0,
        "native_image_objects": sum(image_counts),
        "extraction_mode": "scanned" if scanned else "born_digital",
    }


def find_question_markers(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    expected = 1
    for page_index, page in enumerate(pages):
        width = page["width"]
        for line_index, line in enumerate(page["lines"]):
            match = QUESTION_MARKER.match(line["text"])
            # IB question numbers sit in the dedicated left gutter. Mathematical
            # answer content can also begin with the next expected integer (for
            # example, option B may be ``3.0 m`` while question 3 is next). A
            # wider 20% page allowance admitted those answer values and silently
            # shifted every following question boundary. Fifteen percent still
            # covers native and OCR question gutters in the corpus while keeping
            # the answer column out.
            if not match or line["bbox"][0] > width * 0.15:
                continue
            number = int(match.group(1))
            if number != expected:
                continue
            start_line_index = line_index
            while start_line_index > 0:
                previous = page["lines"][start_line_index - 1]
                same_baseline = abs(previous["bbox"][1] - line["bbox"][1]) <= 6
                sits_to_right = previous["bbox"][0] > line["bbox"][0]
                if not (same_baseline and sits_to_right):
                    break
                start_line_index -= 1
            markers.append(
                {
                    "number": number,
                    "page_index": page_index,
                    "line_index": start_line_index,
                    "y": line["bbox"][1],
                }
            )
            expected += 1
    return markers


def normalize_question_text(lines: list[str]) -> str:
    kept: list[str] = []
    boilerplate = (
        re.compile(r"^\s*\d{4}\s*[–-]\s*\d{4}\s*$"),
        re.compile(r"^\s*\d{1,2}EP\d{2}\s*$", re.IGNORECASE),
        re.compile(r"^\s*[–-]\s*\d+\s*[–-](?:\s+.*)?$"),
        re.compile(r"^\s*(?:Turn over|Blank page)\s*$", re.IGNORECASE),
        re.compile(r"^\s*Scanned with\s*$", re.IGNORECASE),
        re.compile(r"^\s*CamScanner\s*$", re.IGNORECASE),
        re.compile(r"^\s*\(?This question continues.*$", re.IGNORECASE),
        re.compile(r"^\s*\(?Question\s+\d+\s+continued\)?\s*$", re.IGNORECASE),
    )
    for line in lines:
        line = line.replace("\u0007", "").strip()
        if not line or any(pattern.match(line) for pattern in boilerplate):
            continue
        if len(line) > 20 and len(set(line)) <= 3:
            continue
        kept.append(line)
    return "\n".join(kept).strip()


def extract_options(lines: list[str]) -> list[dict[str, str]]:
    options: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for line in lines:
        match = OPTION_PATTERN.match(line)
        if match:
            if current:
                options.append(current)
            current = {"label": match.group(1), "text": match.group(2).strip()}
        elif current:
            current["text"] = (current["text"] + "\n" + line.strip()).strip()
    if current:
        options.append(current)
    if [item["label"] for item in options] == ["A", "B", "C", "D"]:
        return options

    # Some MCQs place A-D directly on a graph or diagram instead of printing
    # four text rows. Preserve those as graphical choices: their meaning lives
    # in the linked visual asset, so an empty text value is intentional rather
    # than a failed extraction.
    graphical_labels = {
        match.group(1)
        for line in lines
        if (match := re.match(r"^\s*([A-D])[.]?\s*$", line))
    }
    if graphical_labels == {"A", "B", "C", "D"}:
        return [
            {"label": label, "text": "", "presentation": "visual_label"}
            for label in ("A", "B", "C", "D")
        ]
    return []


def apply_question_context_to_figures(
    figures: list[dict[str, Any]],
    primary: dict[str, Any] | None,
    paper: str,
) -> None:
    """Resolve low-text crops when the surrounding question is unambiguous.

    A crop often contains only strokes, so its local classifier falls back to
    ``geometry_scene`` even when the stem explicitly says "circuit" or
    "velocity-time graph". It is safe to carry that context into a single
    figure, and into Paper 1 option panels where the panels answer the same
    visual prompt. Multi-figure Paper 2 questions may mix visual families and
    remain review-gated.
    """

    if (
        not primary
        or primary["confidence"] < 0.6
        or primary["family"] == "geometry_scene"
        or (paper != "1A" and len(figures) != 1)
    ):
        return

    for figure in figures:
        if figure["confidence"] >= 0.6 or figure["primary_family"] != "geometry_scene":
            continue
        original = {
            "primary_family": figure["primary_family"],
            "confidence": figure["confidence"],
            "evidence": figure["evidence"],
        }
        family = primary["family"]
        figure.update(
            {
                "primary_family": family,
                "template_id": VISUAL_FAMILIES[family]["template"],
                "confidence": round(min(0.8, max(0.6, primary["confidence"] - 0.02)), 2),
                "evidence": sorted(
                    set(
                        [
                            *primary["evidence"],
                            "question context applied to low-text crop",
                        ]
                    )
                ),
                "required_primitives": VISUAL_FAMILIES[family]["primitives"],
                "classification_provenance": {
                    "method": "question_context",
                    "original": original,
                },
            }
        )


def extract_subparts(lines: list[str]) -> list[dict[str, Any]]:
    subparts: list[dict[str, Any]] = []
    for index, line in enumerate(lines):
        match = SUBPART_PATTERN.match(line)
        if not match:
            continue
        end = len(lines)
        for next_index in range(index + 1, len(lines)):
            if SUBPART_PATTERN.match(lines[next_index]):
                end = next_index
                break
        text = "\n".join([match.group(2), *lines[index + 1 : end]]).strip()
        subparts.append({"label": match.group(1).lower(), "text": text})
    return subparts


def classify_visual(text: str, has_asset: bool) -> tuple[list[dict[str, Any]], list[str]]:
    lowered = text.lower()
    scored: list[dict[str, Any]] = []
    evidence_all: list[str] = []
    for family, definition in VISUAL_FAMILIES.items():
        evidence: list[str] = []
        for pattern in definition["patterns"]:
            match = re.search(pattern, lowered, re.IGNORECASE | re.DOTALL)
            if match:
                evidence.append(match.group(0))
        if evidence:
            base = 0.52 + min(0.32, 0.08 * len(evidence))
            if has_asset:
                base += 0.08
            if family == "geometry_scene":
                # "Shown" and "diagram" establish that a visual exists, not
                # which reusable renderer it belongs to. Keep the fallback
                # explicitly review-gated even when several generic cues occur.
                base = min(base, 0.45)
            scored.append(
                {
                    "family": family,
                    "confidence": round(min(0.96, base), 2),
                    "evidence": sorted(set(evidence)),
                }
            )
            evidence_all.extend(evidence)

    scene_families = {
        "mechanics_scene",
        "electromagnetic_scene",
        "thermal_energy_scene",
        "spatial_orbital",
        "material_particle_model",
    }
    scored.sort(
        key=lambda item: (
            2 if item["family"] == "geometry_scene" else 1 if item["family"] in scene_families else 0,
            -item["confidence"],
        )
    )
    if has_asset and not scored:
        scored.append(
            {
                "family": "geometry_scene",
                "confidence": 0.45,
                "evidence": ["vector or raster asset detected"],
            }
        )
    return scored, sorted(set(evidence_all))


def rects_touch(left: pymupdf.Rect, right: pymupdf.Rect, gap: float = 8) -> bool:
    expanded = pymupdf.Rect(left.x0 - gap, left.y0 - gap, left.x1 + gap, left.y1 + gap)
    return expanded.intersects(right)


def merge_rectangles(rectangles: list[pymupdf.Rect]) -> list[pymupdf.Rect]:
    merged: list[pymupdf.Rect] = []
    for rectangle in rectangles:
        for index, current in enumerate(merged):
            if rects_touch(current, rectangle):
                merged[index] = current | rectangle
                break
        else:
            merged.append(rectangle)
    changed = True
    while changed:
        changed = False
        for left_index in range(len(merged)):
            for right_index in range(left_index + 1, len(merged)):
                if rects_touch(merged[left_index], merged[right_index]):
                    merged[left_index] |= merged[right_index]
                    merged.pop(right_index)
                    changed = True
                    break
            if changed:
                break
    return merged


def classify_asset_region(
    page: pymupdf.Page, rectangle: pymupdf.Rect
) -> tuple[list[dict[str, Any]], str]:
    local_text = page.get_textbox(rectangle).strip()
    classifications, _ = classify_visual(local_text, True)
    horizontal_lines = 0
    vertical_lines = 0
    curves = 0
    for drawing in page.get_drawings():
        if not rectangle.intersects(drawing["rect"]):
            continue
        for item in drawing["items"]:
            if item[0] == "l":
                start, end = item[1], item[2]
                if abs(start.y - end.y) <= 1.5:
                    horizontal_lines += 1
                if abs(start.x - end.x) <= 1.5:
                    vertical_lines += 1
            elif item[0] == "c":
                curves += 1

    symbols = set(re.findall(r"(?<![A-Za-z])[A-Za-z](?![A-Za-z])", local_text))
    symbol_pairs = [
        {"P", "V"},
        {"I", "V"},
        {"I", "t"},
        {"v", "t"},
        {"a", "t"},
        {"x", "t"},
        {"F", "x"},
        {"E", "x"},
        {"f", "t"},
        {"d", "t"},
        {"s", "t"},
        {"T", "t"},
    ]
    quantity_words = set(
        re.findall(
            r"\b(?:pressure|volume|current|voltage|acceleration|velocity|displacement|"
            r"distance|time|force|energy|power|frequency|temperature|intensity|angle|"
            r"wavelength|amplitude|charge|density|resistance|luminosity|count|rate)\b",
            local_text.lower(),
        )
    )
    plot_geometry = (
        curves > 0
        and horizontal_lines > 0
        and vertical_lines > 0
        and (
            any(pair <= symbols for pair in symbol_pairs)
            or len(quantity_words) >= 2
        )
    )
    if plot_geometry:
        plot_candidate = {
            "family": "cartesian_plot",
            "confidence": 0.82,
            "evidence": ["axis/curve geometry and quantitative labels detected in crop"],
        }
        classifications = [
            plot_candidate,
            *[item for item in classifications if item["family"] != "cartesian_plot"],
        ]
    return classifications, local_text


def detect_visual_regions(page: pymupdf.Page) -> list[pymupdf.Rect]:
    page_area = page.rect.get_area()
    drawing_rects = [drawing["rect"] for drawing in page.get_drawings()]
    candidates: list[pymupdf.Rect] = []
    for cluster in page.cluster_drawings():
        path_hits = sum(1 for rectangle in drawing_rects if cluster.intersects(rectangle))
        if path_hits < 2:
            continue
        if cluster.get_area() < 300 or cluster.width < 20 or cluster.height < 12:
            continue
        if cluster.y1 < 60 or cluster.y0 > page.rect.height - 80:
            continue
        if cluster.get_area() / page_area > 0.72:
            continue
        candidates.append(cluster)

    for image in page.get_images(full=True):
        xref = image[0]
        for rectangle in page.get_image_rects(xref):
            ratio = rectangle.get_area() / page_area
            if 0.002 <= ratio <= 0.72:
                candidates.append(rectangle)

    return sorted(merge_rectangles(candidates), key=lambda rectangle: (rectangle.y0, rectangle.x0))


def nearest_question_number(
    page_index: int, y: float, markers: list[dict[str, Any]]
) -> int | None:
    preceding = [
        marker
        for marker in markers
        if marker["page_index"] < page_index
        or (marker["page_index"] == page_index and marker["y"] <= y + 8)
    ]
    return preceding[-1]["number"] if preceding else None


def render_visual_assets(
    document: pymupdf.Document,
    pages: list[dict[str, Any]],
    markers: list[dict[str, Any]],
    source_id: str,
    assets_root: Path,
) -> list[dict[str, Any]]:
    assets: list[dict[str, Any]] = []
    source_root = assets_root / source_id
    for page_index, page in enumerate(document):
        if pages[page_index]["method"] != "native":
            continue
        for region_index, rectangle in enumerate(detect_visual_regions(page), start=1):
            clip = pymupdf.Rect(
                max(0, rectangle.x0 - 24),
                max(0, rectangle.y0 - 24),
                min(page.rect.width, rectangle.x1 + 24),
                min(page.rect.height, rectangle.y1 + 24),
            )
            question_number = nearest_question_number(page_index, rectangle.y0, markers)
            if question_number is None:
                continue
            classifications, local_text = classify_asset_region(page, clip)
            primary = classifications[0]
            asset_id = "vis_" + stable_id(source_id, str(page_index + 1), str(region_index))
            relative = Path("assets") / source_id / f"p{page_index + 1:03d}_v{region_index:02d}.png"
            destination = assets_root.parent / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=clip, alpha=False)
            pixmap.save(destination)
            assets.append(
                {
                    "asset_id": asset_id,
                    "source_id": source_id,
                    "question_number": question_number,
                    "page": page_index + 1,
                    "bbox_pdf_points": [round(value, 2) for value in clip],
                    "path": relative.as_posix(),
                    "extraction_method": "vector-cluster crop",
                    "local_text": local_text,
                    "classification": {
                        "primary_family": primary["family"],
                        "confidence": primary["confidence"],
                        "evidence": primary["evidence"],
                        "alternatives": classifications[1:4],
                    },
                }
            )
    if not assets and source_root.exists():
        source_root.rmdir()
    return assets


def extract_document(
    source: dict[str, Any],
    dataset_root: Path,
    assets_root: Path,
    ocr_engine: Any | None,
    ocr_dpi: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    path = dataset_root / source["relative_path"]
    document = pymupdf.open(path)
    is_scan = source["profile"]["extraction_mode"] == "scanned"
    pages: list[dict[str, Any]] = []
    for page_index, page in enumerate(document):
        if is_scan:
            if ocr_engine is None:
                lines: list[dict[str, Any]] = []
                method = "scan_without_ocr"
            else:
                lines = ocr_page_lines(page, ocr_engine, ocr_dpi)
                method = "rapidocr"
        else:
            lines = native_page_lines(page)
            method = "native"
        pages.append(
            {
                "page": page_index + 1,
                "width": float(page.rect.width),
                "height": float(page.rect.height),
                "method": method,
                "lines": lines,
            }
        )

    markers = find_question_markers(pages)
    visual_assets = render_visual_assets(
        document, pages, markers, source["source_id"], assets_root
    )
    assets_by_question: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for asset in visual_assets:
        if asset["question_number"] is not None:
            assets_by_question[asset["question_number"]].append(asset)

    questions: list[dict[str, Any]] = []
    visual_plans: list[dict[str, Any]] = []
    for marker_index, marker in enumerate(markers):
        next_marker = markers[marker_index + 1] if marker_index + 1 < len(markers) else None
        selected_lines: list[dict[str, Any]] = []
        for page_index in range(marker["page_index"], (next_marker or {"page_index": len(pages) - 1})["page_index"] + 1):
            start = marker["line_index"] if page_index == marker["page_index"] else 0
            end = (
                next_marker["line_index"]
                if next_marker and page_index == next_marker["page_index"]
                else len(pages[page_index]["lines"])
            )
            selected_lines.extend(pages[page_index]["lines"][start:end])
        line_texts = [line["text"] for line in selected_lines]
        normalized = normalize_question_text(line_texts)
        question_number = marker["number"]
        question_id = "q_" + stable_id(source["source_id"], str(question_number))
        question_assets = assets_by_question.get(question_number, [])
        has_visual_cue = bool(VISUAL_CUE.search(normalized))
        classifications, evidence = classify_visual(normalized, bool(question_assets))
        has_visual = bool(question_assets) or has_visual_cue
        if has_visual and not classifications:
            classifications = [
                {
                    "family": "geometry_scene",
                    "confidence": 0.35,
                    "evidence": ["visual cue requires manual family classification"],
                }
            ]
        primary = classifications[0] if classifications and has_visual else None
        figures: list[dict[str, Any]] = []
        for asset in question_assets:
            asset_family = asset["classification"]["primary_family"]
            figures.append(
                {
                    "figure_id": "fig_" + stable_id(asset["asset_id"], VISUAL_SCHEMA_VERSION),
                    "source_asset_ids": [asset["asset_id"]],
                    "primary_family": asset_family,
                    "template_id": VISUAL_FAMILIES[asset_family]["template"],
                    "confidence": asset["classification"]["confidence"],
                    "evidence": asset["classification"]["evidence"],
                    "alternatives": asset["classification"]["alternatives"],
                    "required_primitives": VISUAL_FAMILIES[asset_family]["primitives"],
                    "composition_role": "panel" if len(question_assets) > 1 else "single",
                }
            )
        if has_visual and not figures and primary:
            figures.append(
                {
                    "figure_id": "fig_" + stable_id(question_id, "unisolated", VISUAL_SCHEMA_VERSION),
                    "source_asset_ids": [],
                    "primary_family": primary["family"],
                    "template_id": VISUAL_FAMILIES[primary["family"]]["template"],
                    "confidence": primary["confidence"],
                    "evidence": primary["evidence"],
                    "alternatives": classifications[1:4],
                    "required_primitives": VISUAL_FAMILIES[primary["family"]]["primitives"],
                    "composition_role": "unisolated",
                }
            )
        apply_question_context_to_figures(figures, primary, source["paper"])
        page_end = (
            next_marker["page_index"] + 1
            if next_marker and next_marker["page_index"] == marker["page_index"]
            else (next_marker["page_index"] if next_marker else len(pages))
        )
        confidences = [line["confidence"] for line in selected_lines] or [0.0]
        extraction_method = pages[marker["page_index"]]["method"]
        extraction_confidence = round(statistics.mean(confidences), 3)
        visual_plan_id = "plan_" + stable_id(question_id, VISUAL_SCHEMA_VERSION)
        marks = [int(value) for value in MARK_PATTERN.findall(normalized)]
        options = extract_options(line_texts) if source["paper"] == "1A" else []
        subparts = extract_subparts(line_texts) if source["paper"] == "2" else []
        review_reasons: list[str] = []
        if extraction_method != "native":
            review_reasons.append("OCR-derived text requires comparison with the scan")
        if has_visual and not question_assets and extraction_method == "native":
            review_reasons.append("visual cue found but no vector/raster crop was isolated")
        if has_visual and primary and primary["confidence"] < 0.6:
            review_reasons.append("visual family classification is low-confidence")
        if any(figure["confidence"] < 0.6 for figure in figures):
            review_reasons.append("one or more figure classifications are low-confidence")
        if source["paper"] == "1A" and len(options) != 4:
            review_reasons.append("four labelled answer options were not parsed")

        plan = {
            "visual_plan_id": visual_plan_id,
            "schema_version": VISUAL_SCHEMA_VERSION,
            "question_id": question_id,
            "required": has_visual,
            "primary_family": primary["family"] if primary else None,
            "template_id": VISUAL_FAMILIES[primary["family"]]["template"] if primary else None,
            "confidence": primary["confidence"] if primary else None,
            "alternatives": classifications[1:4] if has_visual else [],
            "evidence": evidence,
            "source_assets": [asset["asset_id"] for asset in question_assets],
            "figures": figures,
            "composition": (
                "panel-grid" if len(figures) > 1 and source["paper"] == "1A"
                else "sequence" if len(figures) > 1
                else "single"
            ),
            "source_pages": list(range(marker["page_index"] + 1, page_end + 1)),
            "required_primitives": sorted(
                {
                    primitive
                    for figure in figures
                    for primitive in figure["required_primitives"]
                }
            ),
            "semantic_requirements": {
                "derive_from_scenario": True,
                "layout_separate_from_physics": True,
                "student_visible_fields_allowlist_required": True,
                "answer_leak_check_required": True,
            },
            "review_status": "needs_review" if review_reasons else "auto_catalogued",
            "review_reasons": review_reasons,
        }
        question = {
            "question_id": question_id,
            "schema_version": "question-package/0.1.0",
            "source_id": source["source_id"],
            "markscheme_source_id": source.get("markscheme_source_id"),
            "provenance": {
                "relative_path": source["relative_path"],
                "sha256": source["sha256"],
                "question_number": question_number,
                "page_start": marker["page_index"] + 1,
                "page_end": page_end,
                "extraction_version": EXTRACTION_VERSION,
            },
            "classification": {
                "year": source["year"],
                "session": source["session"],
                "paper": source["paper"],
                "level": source["level"],
                "zone": source["zone"],
                "language": source["language"],
            },
            "question_number": question_number,
            "question_type": "multiple_choice" if source["paper"] == "1A" else "multipart",
            "text": {
                "raw_lines": line_texts,
                "normalized": normalized,
                "options": options,
                "subparts": subparts,
                "printed_marks": marks,
            },
            "extraction": {
                "method": extraction_method,
                "confidence": extraction_confidence,
                "status": "needs_review" if review_reasons else "auto_extracted",
                "review_reasons": review_reasons,
            },
            "visual_plan_id": visual_plan_id if has_visual else None,
            "visual_asset_ids": [asset["asset_id"] for asset in question_assets],
        }
        questions.append(question)
        if has_visual:
            visual_plans.append(plan)

    return questions, visual_plans, visual_assets


def link_markschemes(sources: list[dict[str, Any]]) -> None:
    schemes = {
        (
            source["year"],
            source["session"],
            source["paper"],
            source["level"],
            source["zone"],
            source["language"],
        ): source["source_id"]
        for source in sources
        if source["role"] == "markscheme"
    }
    for source in sources:
        key = (
            source["year"],
            source["session"],
            source["paper"],
            source["level"],
            source["zone"],
            source["language"],
        )
        source["markscheme_source_id"] = schemes.get(key)


def catalogue_markdown(summary: dict[str, Any]) -> str:
    family_rows = "\n".join(
        f"| `{item['family']}` | {item['primary_questions']} | {item['candidate_questions']} | "
        f"{item['source_crops']} | "
        f"`{VISUAL_FAMILIES[item['family']]['template']}` |"
        for item in summary["visual_families"]
    )
    return f"""# Paper-mining catalogue

Generated: {summary['generated_at']}  
Extractor: `{EXTRACTION_VERSION}`  
Visual schema: `{VISUAL_SCHEMA_VERSION}`

## Corpus receipt

- Source PDFs: {summary['sources']['total']}
- Question papers / mark schemes: {summary['sources']['question_papers']} / {summary['sources']['markschemes']}
- Born-digital / scanned: {summary['sources']['born_digital']} / {summary['sources']['scanned']}
- Scanned copies linked to canonical official PDFs: {summary['sources']['linked_scanned_duplicates']}
- Canonical English question papers extracted: {summary['extraction']['documents']}
- Questions extracted: {summary['extraction']['questions']}
- Questions requiring review: {summary['extraction']['questions_needing_review']}
- Visual plans: {summary['extraction']['visual_plans']}
- Cropped visual assets: {summary['extraction']['visual_assets']}

## Visual-family evidence

Counts are question-level primary classifications, not claims of renderer completion.

| Family | Primary question | Primary or alternative question | Source crops | Planned template |
| --- | ---: | ---: | ---: | --- |
{family_rows}

## Review boundary

OCR records, low-confidence classifications, and questions whose visual cue did not
yield an isolated crop remain in `review-queue.jsonl`. Source PDFs are immutable;
every derived record carries its source checksum, pages, extraction method, and
version. Do not use an OCR or auto-classified record as a training target until its
review status is resolved.
"""


def build_summary(
    sources: list[dict[str, Any]],
    questions: list[dict[str, Any]],
    visual_plans: list[dict[str, Any]],
    visual_assets: list[dict[str, Any]],
) -> dict[str, Any]:
    primary_family_counts = Counter(
        plan["primary_family"] for plan in visual_plans if plan["primary_family"]
    )
    candidate_family_counts = Counter()
    figure_family_counts = Counter()
    for plan in visual_plans:
        if plan["primary_family"]:
            candidate_family_counts[plan["primary_family"]] += 1
        for alternative in plan["alternatives"]:
            candidate_family_counts[alternative["family"]] += 1
        for figure in plan["figures"]:
            figure_family_counts[figure["primary_family"]] += len(figure["source_asset_ids"])
    question_paper_counts = Counter(question["classification"]["paper"] for question in questions)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "extractor_version": EXTRACTION_VERSION,
        "visual_schema_version": VISUAL_SCHEMA_VERSION,
        "sources": {
            "total": len(sources),
            "question_papers": sum(source["role"] == "question_paper" for source in sources),
            "markschemes": sum(source["role"] == "markscheme" for source in sources),
            "born_digital": sum(
                source["profile"]["extraction_mode"] == "born_digital" for source in sources
            ),
            "scanned": sum(source["profile"]["extraction_mode"] == "scanned" for source in sources),
            "linked_scanned_duplicates": sum(
                source["source_kind"] == "donated_scan" and bool(source["duplicate_of"])
                for source in sources
            ),
        },
        "extraction": {
            "documents": len({question["source_id"] for question in questions}),
            "questions": len(questions),
            "questions_by_paper": dict(sorted(question_paper_counts.items())),
            "questions_needing_review": sum(
                question["extraction"]["status"] == "needs_review" for question in questions
            ),
            "visual_plans": len(visual_plans),
            "visual_assets": len(visual_assets),
        },
        "visual_families": [
            {
                "family": family,
                "primary_questions": primary_family_counts[family],
                "candidate_questions": candidate_family_counts[family],
                "source_crops": figure_family_counts[family],
                "observed": candidate_family_counts[family] > 0,
            }
            for family in sorted(
                VISUAL_FAMILIES,
                key=lambda item: (-candidate_family_counts[item], item),
            )
        ],
    }


def prepare_output(output: Path, force: bool) -> tuple[Path, Path | None]:
    backup: Path | None = None
    if output.exists():
        if not force:
            raise FileExistsError(f"Output already exists: {output}. Pass --force to preserve and replace it.")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = output.with_name(f"{output.name}.bak-{stamp}")
        output.rename(backup)
    temporary = output.with_name(f".{output.name}.tmp-{stable_id(str(datetime.now()))[:8]}")
    temporary.mkdir(parents=True)
    return temporary, backup


def carry_forward_review_decisions(
    backup: Path | None, temporary: Path, valid_ids: set[str]
) -> int:
    """Keep still-relevant manual decisions across a reproducible rerun."""

    if not backup or not (backup / "review-decisions.json").is_file():
        return 0
    previous = json.loads((backup / "review-decisions.json").read_text(encoding="utf-8"))
    retained = {
        item_id: decision
        for item_id, decision in previous.get("decisions", {}).items()
        if item_id in valid_ids
    }
    write_json(
        temporary / "review-decisions.json",
        {
            "schema_version": previous.get("schema_version", "review-decisions/0.1.0"),
            "updated_at": previous.get("updated_at"),
            "decisions": retained,
        },
    )
    return len(retained)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=Path("dataset"))
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--ocr-scans", action="store_true", help="OCR unmatched scanned question papers")
    parser.add_argument("--ocr-dpi", type=int, default=180)
    parser.add_argument("--force", action="store_true", help="Back up and replace an existing output run")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dataset_root = args.dataset.resolve()
    output = args.output.resolve()
    if not dataset_root.is_dir():
        print(f"Dataset directory not found: {dataset_root}", file=sys.stderr)
        return 2
    pdf_paths = sorted(dataset_root.rglob("*.pdf"))
    if not pdf_paths:
        print(f"No PDF files found under {dataset_root}", file=sys.stderr)
        return 2

    sources = [classify_source(path, dataset_root) for path in pdf_paths]
    link_duplicates(sources)
    link_markschemes(sources)
    for source in sources:
        source["profile"] = profile_pdf(dataset_root / source["relative_path"])

    extraction_sources = [
        source
        for source in sources
        if source["role"] == "question_paper"
        and source["language"] == "en"
        and source["paper"] in {"1A", "2"}
        and source["level"] in {"HL", "SL"}
        and not source["duplicate_of"]
    ]
    needs_ocr = any(
        source["profile"]["extraction_mode"] == "scanned" for source in extraction_sources
    )
    ocr_engine = load_ocr() if needs_ocr and args.ocr_scans else None
    temporary, backup = prepare_output(output, args.force)
    assets_root = temporary / "assets"
    assets_root.mkdir(parents=True)
    all_questions: list[dict[str, Any]] = []
    all_visual_plans: list[dict[str, Any]] = []
    all_visual_assets: list[dict[str, Any]] = []
    try:
        for index, source in enumerate(extraction_sources, start=1):
            print(
                f"[{index:02d}/{len(extraction_sources):02d}] {source['relative_path']}",
                flush=True,
            )
            questions, visual_plans, visual_assets = extract_document(
                source, dataset_root, assets_root, ocr_engine, args.ocr_dpi
            )
            expected_questions = (
                40 if source["paper"] == "1A" and source["level"] == "HL"
                else 25 if source["paper"] == "1A" and source["level"] == "SL"
                else None
            )
            source["extraction_result"] = {
                "question_count": len(questions),
                "highest_question_number": max(
                    (question["question_number"] for question in questions), default=None
                ),
                "expected_question_count": expected_questions,
                "complete_sequence": bool(questions)
                and (expected_questions is None or len(questions) == expected_questions),
            }
            all_questions.extend(questions)
            all_visual_plans.extend(visual_plans)
            all_visual_assets.extend(visual_assets)

        review_queue: list[dict[str, Any]] = []
        for question in all_questions:
            if question["extraction"]["status"] == "needs_review":
                review_queue.append(
                    {
                        "kind": "question",
                        "id": question["question_id"],
                        "source_id": question["source_id"],
                        "reasons": question["extraction"]["review_reasons"],
                    }
                )
        extracted_source_ids = {question["source_id"] for question in all_questions}
        for source in extraction_sources:
            if source["source_id"] not in extracted_source_ids:
                review_queue.append(
                    {
                        "kind": "source",
                        "id": source["source_id"],
                        "source_id": source["source_id"],
                        "reasons": [
                            "no sequential question markers were extracted",
                            "enable OCR or inspect document structure",
                        ],
                    }
                )
            elif not source["extraction_result"]["complete_sequence"]:
                review_queue.append(
                    {
                        "kind": "source",
                        "id": source["source_id"],
                        "source_id": source["source_id"],
                        "reasons": [
                            "extracted question sequence did not reach the expected Paper 1 count"
                        ],
                    }
                )
            if source["markscheme_source_id"] is None:
                review_queue.append(
                    {
                        "kind": "source",
                        "id": source["source_id"],
                        "source_id": source["source_id"],
                        "reasons": ["no matching mark scheme is present in the corpus"],
                    }
                )

        summary = build_summary(sources, all_questions, all_visual_plans, all_visual_assets)
        review_reason_counts = Counter(
            reason for item in review_queue for reason in item["reasons"]
        )
        summary["review"] = {
            "queue_items": len(review_queue),
            "question_items": sum(item["kind"] == "question" for item in review_queue),
            "source_items": sum(item["kind"] == "source" for item in review_queue),
            "reason_counts": dict(sorted(review_reason_counts.items())),
            "note": "Reason counts overlap; one record may have more than one reason.",
        }
        catalogue = {
            "schema_version": VISUAL_SCHEMA_VERSION,
            "families": [
                {
                    "family": family,
                    "template_id": definition["template"],
                    "required_primitives": definition["primitives"],
                    "question_count": next(
                        (
                            item["primary_questions"]
                            for item in summary["visual_families"]
                            if item["family"] == family
                        ),
                        0,
                    ),
                    "candidate_question_count": next(
                        (
                            item["candidate_questions"]
                            for item in summary["visual_families"]
                            if item["family"] == family
                        ),
                        0,
                    ),
                    "source_crop_count": next(
                        (
                            item["source_crops"]
                            for item in summary["visual_families"]
                            if item["family"] == family
                        ),
                        0,
                    ),
                }
                for family, definition in VISUAL_FAMILIES.items()
            ],
        }
        write_jsonl(temporary / "sources.jsonl", sources)
        write_jsonl(temporary / "questions.jsonl", all_questions)
        write_jsonl(temporary / "visual-plans.jsonl", all_visual_plans)
        write_jsonl(temporary / "visual-assets.jsonl", all_visual_assets)
        write_jsonl(temporary / "review-queue.jsonl", review_queue)
        write_json(temporary / "summary.json", summary)
        write_json(temporary / "visual-catalogue.json", catalogue)
        (temporary / "CATALOGUE.md").write_text(catalogue_markdown(summary), encoding="utf-8")
        carried = carry_forward_review_decisions(
            backup, temporary, {item["id"] for item in review_queue}
        )
        if carried:
            print(f"Carried forward {carried} still-relevant review decisions")
        temporary.rename(output)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        if backup and not output.exists():
            backup.rename(output)
        raise

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    if backup:
        print(f"Previous output preserved at {backup}")
    print(f"Wrote derived run to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
