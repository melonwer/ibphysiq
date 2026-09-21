#!/usr/bin/env python3
"""Serve a private, contextual review UI for one paper-mining run."""

from __future__ import annotations

import argparse
import json
import mimetypes
import re
from collections import defaultdict
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import pymupdf


DEFAULT_RUN = Path("dataset/_derived/paper-mining-v0.1")
UI_PATH = Path(__file__).with_name("review-ui.html")
FAMILY_IDS = {
    "annotated_image",
    "cartesian_plot",
    "circuit_network",
    "data_table",
    "energy_level",
    "experimental_apparatus",
    "field_map",
    "geometry_scene",
    "material_particle_model",
    "mechanics_scene",
    "electromagnetic_scene",
    "thermal_energy_scene",
    "particle_interaction",
    "ray_wave",
    "spatial_orbital",
    "vector_force",
}
DECISION_STATUSES = {"accepted", "corrected", "excluded", "deferred"}

REASON_CONTEXT = {
    "OCR-derived text requires comparison with the scan": {
        "code": "ocr_text",
        "bucket": "source_limit",
        "title": "Scanned text needs a spot-check",
        "explanation": (
            "This paper is an image scan, so the question text came from OCR rather than "
            "embedded PDF text. The record is usable only after its wording and symbols are "
            "compared with the page image."
        ),
        "action": "Compare the extracted text with the displayed source page; correct or exclude it.",
    },
    "no matching mark scheme is present in the corpus": {
        "code": "missing_markscheme",
        "bucket": "source_limit",
        "title": "The matching mark scheme is absent",
        "explanation": (
            "The question paper exists, but the corresponding answer/mark-scheme PDF is not in "
            "the supplied corpus. Visual cataloguing can continue, but this source cannot become "
            "a verified training package yet."
        ),
        "action": "Keep it excluded from answer training until the mark scheme is supplied.",
    },
    "four labelled answer options were not parsed": {
        "code": "mcq_options",
        "bucket": "extraction",
        "title": "The four answer choices were not reconstructed",
        "explanation": (
            "The extractor could not form A-D into four choices. This may be a formula layout or "
            "four labels printed directly on a graph, rather than missing source content."
        ),
        "action": "Confirm that A-D are present and whether they are text choices or labels in the figure.",
    },
    "visual cue found but no vector/raster crop was isolated": {
        "code": "visual_crop",
        "bucket": "extraction",
        "title": "A visual is mentioned but no clean crop was isolated",
        "explanation": (
            "The wording refers to a graph or diagram, but the PDF stores it in a form that the "
            "automatic cropper did not separate from the rest of the page."
        ),
        "action": "Use the full source page to confirm the visual and mark it for a better crop.",
    },
    "visual family classification is low-confidence": {
        "code": "question_family",
        "bucket": "visual_semantics",
        "title": "The question-level visual type is uncertain",
        "explanation": (
            "The extractor knows a visual is involved but lacks enough evidence to distinguish, "
            "for example, a mechanics scene from apparatus or a field arrangement."
        ),
        "action": "Choose the reusable visual family that best describes what must be rendered.",
    },
    "one or more figure classifications are low-confidence": {
        "code": "figure_family",
        "bucket": "visual_semantics",
        "title": "One or more crops have an uncertain visual type",
        "explanation": (
            "A crop often contains only lines and labels. Its local evidence was too weak to assign "
            "a renderer family safely, even though it remains linked to the question."
        ),
        "action": "View the crop in question context, then accept or correct its visual family.",
    },
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def classify_bucket(reasons: list[str]) -> str:
    buckets = {
        REASON_CONTEXT.get(reason, {"bucket": "extraction"})["bucket"]
        for reason in reasons
    }
    for bucket in ("extraction", "source_limit", "visual_semantics"):
        if bucket in buckets:
            return bucket
    return "extraction"


def pilot_sample_ids(items: list[dict[str, Any]], limit: int = 20) -> set[str]:
    """Select a stable, diverse visual sample without treating it as acceptance."""

    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        if item["kind"] != "question" or item["bucket"] != "visual_semantics":
            continue
        plan = item["visual_plan"]
        if not plan:
            continue
        key = (plan["primary_family"], item["source"]["paper"])
        groups[key].append(item)

    selected: set[str] = set()
    seen_stems: set[str] = set()

    def choose(group_keys: list[tuple[str, str]], target: int) -> None:
        while len(selected) < target:
            added = False
            for key in group_keys:
                group = groups[key]
                while group:
                    candidate = group.pop(0)
                    stem = re.sub(
                        r"\s+", " ", candidate["question"]["normalized_text"].lower()
                    )[:180]
                    if stem in seen_stems:
                        continue
                    selected.add(candidate["id"])
                    seen_stems.add(stem)
                    added = True
                    break
                if len(selected) >= target:
                    break
            if not added:
                break

    paper_one = sorted(key for key in groups if key[1] == "1A")
    paper_two = sorted(key for key in groups if key[1] == "2")
    choose(paper_one, (limit + 1) // 2)
    choose(paper_two, limit)
    choose(sorted(groups), limit)
    return selected


def build_review_items(run: Path) -> list[dict[str, Any]]:
    sources = {
        record["source_id"]: record for record in read_jsonl(run / "sources.jsonl")
    }
    questions = {
        record["question_id"]: record
        for record in read_jsonl(run / "questions.jsonl")
    }
    plans = {
        record["question_id"]: record
        for record in read_jsonl(run / "visual-plans.jsonl")
    }
    assets = {
        record["asset_id"]: record
        for record in read_jsonl(run / "visual-assets.jsonl")
    }
    items: list[dict[str, Any]] = []
    for queued in read_jsonl(run / "review-queue.jsonl"):
        reasons = queued["reasons"]
        source = sources[queued["source_id"]]
        question = questions.get(queued["id"])
        plan = plans.get(queued["id"])
        source_assets = []
        if plan:
            source_assets = [
                assets[asset_id]
                for asset_id in plan["source_assets"]
                if asset_id in assets
            ]
        figures = []
        if plan:
            for figure in plan["figures"]:
                figures.append(
                    {
                        "figure_id": figure["figure_id"],
                        "primary_family": figure["primary_family"],
                        "confidence": figure["confidence"],
                        "composition_role": figure["composition_role"],
                        "source_asset_ids": figure["source_asset_ids"],
                        "assets": [
                            {
                                "asset_id": assets[asset_id]["asset_id"],
                                "page": assets[asset_id]["page"],
                                "path": assets[asset_id]["path"],
                            }
                            for asset_id in figure["source_asset_ids"]
                            if asset_id in assets
                        ],
                    }
                )
        items.append(
            {
                "id": queued["id"],
                "kind": queued["kind"],
                "bucket": classify_bucket(reasons),
                "issues": [
                    {
                        **REASON_CONTEXT.get(
                            reason,
                            {
                                "code": "unknown",
                                "bucket": "extraction",
                                "title": reason,
                                "explanation": reason,
                                "action": "Inspect and record a decision.",
                            },
                        ),
                        "raw_reason": reason,
                    }
                    for reason in reasons
                ],
                "source": {
                    "source_id": source["source_id"],
                    "relative_path": source["relative_path"],
                    "year": source["year"],
                    "session": source["session"],
                    "paper": source["paper"],
                    "level": source["level"],
                    "zone": source["zone"],
                },
                "question": (
                    {
                        "question_id": question["question_id"],
                        "number": question["question_number"],
                        "normalized_text": question["text"]["normalized"],
                        "options": question["text"]["options"],
                        "pages": list(
                            range(
                                question["provenance"]["page_start"],
                                question["provenance"]["page_end"] + 1,
                            )
                        ),
                    }
                    if question
                    else None
                ),
                "visual_plan": (
                    {
                        "primary_family": plan["primary_family"],
                        "confidence": plan["confidence"],
                        "composition": plan["composition"],
                        "figures": figures,
                    }
                    if plan
                    else None
                ),
                "assets": [
                    {
                        "asset_id": asset["asset_id"],
                        "page": asset["page"],
                        "path": asset["path"],
                        "primary_family": asset["classification"]["primary_family"],
                        "confidence": asset["classification"]["confidence"],
                    }
                    for asset in source_assets
                ],
            }
        )
    return items


class DecisionStore:
    def __init__(self, path: Path):
        self.path = path

    def read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {
                "schema_version": "review-decisions/0.1.0",
                "updated_at": None,
                "decisions": {},
            }
        return json.loads(self.path.read_text(encoding="utf-8"))

    def put(self, item_id: str, decision: dict[str, Any]) -> dict[str, Any]:
        data = self.read()
        recorded = {
            "item_id": item_id,
            "status": decision["status"],
            "family": decision.get("family"),
            "figure_families": decision.get("figure_families", {}),
            "notes": str(decision.get("notes", "")).strip(),
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
        data["decisions"][item_id] = recorded
        data["updated_at"] = recorded["reviewed_at"]
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        temporary.replace(self.path)
        return recorded


class ReviewApplication:
    def __init__(self, run: Path, dataset: Path):
        self.run = run.resolve()
        self.dataset = dataset.resolve()
        self.items = build_review_items(self.run)
        sample_ids = pilot_sample_ids(self.items)
        for item in self.items:
            item["pilot_sample"] = item["id"] in sample_ids
        self.items_by_id = {item["id"]: item for item in self.items}
        self.assets = {
            record["asset_id"]: record
            for record in read_jsonl(self.run / "visual-assets.jsonl")
        }
        self.store = DecisionStore(self.run / "review-decisions.json")

    def metadata(self) -> dict[str, Any]:
        decisions = self.store.read()["decisions"]
        final_statuses = {"accepted", "corrected", "excluded"}
        bucket_counts: dict[str, int] = {}
        for item in self.items:
            bucket_counts[item["bucket"]] = bucket_counts.get(item["bucket"], 0) + 1
        return {
            "total": len(self.items),
            "reviewed": sum(
                decisions.get(item["id"], {}).get("status") in final_statuses
                for item in self.items
            ),
            "remaining": sum(
                decisions.get(item["id"], {}).get("status") not in final_statuses
                for item in self.items
            ),
            "bucket_counts": bucket_counts,
            "pilot_sample_count": sum(item["pilot_sample"] for item in self.items),
            "families": sorted(FAMILY_IDS),
            "decisions": decisions,
        }


def make_handler(application: ReviewApplication) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "IBPhysiqReview/0.1"

        def send_bytes(self, body: bytes, content_type: str, status: int = 200) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def send_json(self, value: Any, status: int = 200) -> None:
            self.send_bytes(
                json.dumps(value, ensure_ascii=False).encode("utf-8"),
                "application/json; charset=utf-8",
                status,
            )

        def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
            path = unquote(urlparse(self.path).path)
            if path == "/":
                self.send_bytes(UI_PATH.read_bytes(), "text/html; charset=utf-8")
                return
            if path == "/api/items":
                self.send_json(application.items)
                return
            if path == "/api/meta":
                self.send_json(application.metadata())
                return
            asset_match = re.fullmatch(r"/api/asset/(vis_[a-f0-9]+)", path)
            if asset_match:
                asset = application.assets.get(asset_match.group(1))
                if not asset:
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                file_path = application.run / asset["path"]
                self.send_bytes(
                    file_path.read_bytes(),
                    mimetypes.guess_type(file_path.name)[0] or "application/octet-stream",
                )
                return
            page_match = re.fullmatch(r"/api/page/(q_[a-f0-9]+)/(\d+)", path)
            if page_match:
                item = application.items_by_id.get(page_match.group(1))
                if not item or not item["question"]:
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                page_number = int(page_match.group(2))
                if page_number not in item["question"]["pages"]:
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                source_path = application.dataset / item["source"]["relative_path"]
                with pymupdf.open(source_path) as document:
                    if not 1 <= page_number <= len(document):
                        self.send_error(HTTPStatus.NOT_FOUND)
                        return
                    pixmap = document[page_number - 1].get_pixmap(
                        matrix=pymupdf.Matrix(1.35, 1.35), alpha=False
                    )
                    self.send_bytes(pixmap.tobytes("png"), "image/png")
                return
            self.send_error(HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
            path = unquote(urlparse(self.path).path)
            if path != "/api/decision":
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length))
                item_id = str(payload["item_id"])
                status = str(payload["status"])
                family = payload.get("family")
                figure_families = payload.get("figure_families", {})
                if item_id not in application.items_by_id:
                    raise ValueError("Unknown review item")
                if status not in DECISION_STATUSES:
                    raise ValueError("Unknown decision status")
                if status == "corrected" and family not in FAMILY_IDS:
                    raise ValueError("A corrected item requires a known visual family")
                if not isinstance(figure_families, dict) or any(
                    figure_family not in FAMILY_IDS
                    for figure_family in figure_families.values()
                ):
                    raise ValueError("Figure corrections must use known visual families")
                item = application.items_by_id[item_id]
                if any(issue["code"] == "missing_markscheme" for issue in item["issues"]):
                    if status not in {"excluded", "deferred"}:
                        raise ValueError("A missing mark scheme can only be excluded or deferred")
                plan = item["visual_plan"]
                if status == "corrected" and not plan:
                    raise ValueError("This record has no visual plan to correct")
                if plan and status == "accepted" and (
                    family != plan["primary_family"]
                    or any(
                        figure_families.get(figure["figure_id"], figure["primary_family"])
                        != figure["primary_family"]
                        for figure in plan["figures"]
                    )
                ):
                    raise ValueError("Use Save corrected family when changing visual labels")
                decision = application.store.put(item_id, payload)
            except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
                return
            self.send_json(decision, HTTPStatus.CREATED)

        def log_message(self, format: str, *args: Any) -> None:
            print(f"review-ui: {format % args}")

    return Handler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", nargs="?", type=Path, default=DEFAULT_RUN)
    parser.add_argument("--dataset", type=Path, default=Path("dataset"))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    application = ReviewApplication(args.run, args.dataset)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(application))
    print(f"Review {len(application.items)} gated records at http://{args.host}:{args.port}")
    print(f"Decisions are saved to {application.store.path}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nReview server stopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
