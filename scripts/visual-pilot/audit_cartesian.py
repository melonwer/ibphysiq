#!/usr/bin/env python3
"""Audit every mined Cartesian candidate against the current renderer pilot."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


REPOSITORY = Path(__file__).resolve().parents[2]
DEFAULT_RUN = REPOSITORY / "dataset/_derived/paper-mining-v0.1"
DEFAULT_PILOT = REPOSITORY / "dataset/_derived/visual-pilot-v0.1/manifest.json"
DEFAULT_EXPANSION = (
    REPOSITORY / "dataset/_derived/visual-pilot-v0.1/expansion-manifest.json"
)
DEFAULT_OUTPUT = REPOSITORY / "dataset/_derived/visual-pilot-v0.1"
SCHEMA_VERSION = "cartesian-coverage-audit/0.2.0"
TARGET_EXPANSION_SIZE = 24

CAPABILITIES: dict[str, dict[str, str]] = {
    "single_panel": {
        "label": "Single plot panel",
        "description": "One Cartesian drawing area.",
        "renderer_status": "tested",
    },
    "linear_axes": {
        "label": "Linear axes",
        "description": "Increasing linear horizontal and vertical scales.",
        "renderer_status": "tested",
    },
    "quantitative_ticks": {
        "label": "Quantitative ticks",
        "description": "Numerical tick labels and units are answer-relevant.",
        "renderer_status": "tested",
    },
    "qualitative_axes": {
        "label": "Qualitative axes",
        "description": "Shape and labels matter more than a numerical scale.",
        "renderer_status": "tested",
    },
    "polyline_curve": {
        "label": "Straight or piecewise curve",
        "description": "One series contains straight or piecewise-linear sections.",
        "renderer_status": "tested",
    },
    "smooth_curve": {
        "label": "Smooth curve",
        "description": "One continuous curve is sampled into a deterministic path.",
        "renderer_status": "tested",
    },
    "waveform_curve": {
        "label": "Oscillation or waveform",
        "description": "A periodic displacement, field or emf curve.",
        "renderer_status": "tested",
    },
    "student_drawn_curve": {
        "label": "Blank axes for student curve",
        "description": "The student view omits an answer curve and the teacher view supplies it.",
        "renderer_status": "tested",
    },
    "area_interpretation": {
        "label": "Area-under-curve reasoning",
        "description": "Area represents work, impulse, speed change or energy.",
        "renderer_status": "tested",
    },
    "option_panel_grid": {
        "label": "Graph answer-option grid",
        "description": "Several graph choices are labelled A–D in one composition.",
        "renderer_status": "tested",
    },
    "multi_panel_sequence": {
        "label": "Multiple plot panels",
        "description": "A multipart question uses two or more related plot panels.",
        "renderer_status": "tested",
    },
    "multiple_series": {
        "label": "Multiple distinguishable series",
        "description": "Several curves or data series share axes and need distinct styles.",
        "renderer_status": "tested",
    },
    "measured_points": {
        "label": "Measured points or best fit",
        "description": "Markers, scatter data or a fitted line must remain distinct.",
        "renderer_status": "tested",
    },
    "uncertainty_bars": {
        "label": "Uncertainty or error bars",
        "description": "Point uncertainties are rendered quantitatively.",
        "renderer_status": "missing",
    },
    "histogram_bars": {
        "label": "Bars or histogram",
        "description": "Discrete rectangular marks replace a continuous curve.",
        "renderer_status": "implemented_untested",
    },
    "shaded_region": {
        "label": "Shaded or bounded region",
        "description": "A region or area must be filled without hiding the data.",
        "renderer_status": "missing",
    },
    "tangent_construction": {
        "label": "Tangent or gradient construction",
        "description": "A visible tangent or slope construction is answer-relevant.",
        "renderer_status": "implemented_untested",
    },
    "intercept_construction": {
        "label": "Intercept or threshold construction",
        "description": "A crossing, threshold or guide line is answer-relevant.",
        "renderer_status": "missing",
    },
    "logarithmic_axis": {
        "label": "Logarithmic axis",
        "description": "At least one axis uses logarithmic spacing.",
        "renderer_status": "tested",
    },
    "reversed_axis": {
        "label": "Reversed axis",
        "description": "Values intentionally decrease from left to right.",
        "renderer_status": "tested",
    },
    "closed_cycle": {
        "label": "Closed thermodynamic cycle",
        "description": "A P–V path closes and may require directional process labels.",
        "renderer_status": "tested",
    },
    "decay_or_asymptote": {
        "label": "Decay or asymptotic curve",
        "description": "A smooth curve approaches an axis or terminal value.",
        "renderer_status": "tested",
    },
    "spacetime_axes": {
        "label": "Space–time axes",
        "description": "World lines and transformed x/ct axes require specialized geometry.",
        "renderer_status": "tested",
    },
    "pressure_volume_axes": {
        "label": "Pressure–volume axes",
        "description": "Thermodynamic processes and direction are plotted on P–V axes.",
        "renderer_status": "tested",
    },
    "hr_diagram": {
        "label": "Hertzsprung–Russell diagram",
        "description": "Log luminosity and reversed temperature axes form a specialized plot.",
        "renderer_status": "tested",
    },
    "missing_crop_evidence": {
        "label": "Missing clean plot crop",
        "description": "The question mentions a plot but no isolated plot asset is available.",
        "renderer_status": "evidence_gap",
    },
}

STATUS_LABELS = {
    "tested": "tested in source-linked fixtures",
    "implemented_untested": "renderer-tested, but no confirmed source fixture proves it",
    "missing": "renderer capability missing",
    "evidence_gap": "source evidence needs review",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def compact_text(value: str, limit: int = 1800) -> str:
    """Remove answer-line extraction noise while retaining question context."""

    lines = []
    for raw_line in value.replace("\b", "\n").splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        replacement_count = line.count("�") + line.count("_")
        if replacement_count > max(12, len(line) // 2):
            continue
        lines.append(line)
    cleaned = "\n".join(lines)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip() + "…"


def canonical_fingerprint(value: str) -> str:
    normalized = compact_text(value, 10000).lower()
    normalized = re.sub(r"^\s*\d+[.]?\s*", "", normalized)
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    # The opening stem is stable across duplicated zones while later subparts often
    # contain harmless extraction differences.
    normalized = re.sub(r"\s+", " ", normalized).strip()[:500]
    return "plot_" + hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]


def matches(pattern: str, value: str) -> bool:
    return re.search(pattern, value, re.IGNORECASE | re.DOTALL) is not None


def classify_capabilities(
    question: dict[str, Any],
    plan: dict[str, Any],
    assets: dict[str, dict[str, Any]],
) -> tuple[list[str], list[str], list[str]]:
    """Return capabilities, plot asset IDs and human-readable classification evidence."""

    plot_figures = [
        figure
        for figure in plan["figures"]
        if figure["primary_family"] == "cartesian_plot"
    ]
    plot_asset_ids = list(
        dict.fromkeys(
            asset_id
            for figure in plot_figures
            for asset_id in figure["source_asset_ids"]
            if asset_id in assets
        )
    )
    plot_text = "\n".join(assets[item]["local_text"] for item in plot_asset_ids)
    question_text = question["text"]["normalized"]
    evidence_text = f"{question_text}\n{plot_text}"
    capabilities: set[str] = set()
    evidence: list[str] = []

    if not plot_asset_ids:
        capabilities.add("missing_crop_evidence")
        evidence.append("No isolated Cartesian crop is linked to this plan.")

    if plan["composition"] == "panel-grid" or len(plot_figures) >= 4:
        capabilities.add("option_panel_grid")
        evidence.append("The visual plan contains an A–D-style panel grid.")
    elif len(plot_figures) > 1:
        capabilities.add("multi_panel_sequence")
        evidence.append("The visual plan contains multiple Cartesian figures.")
    else:
        capabilities.add("single_panel")

    is_hr = matches(r"\b(hertzsprung|h\s*[-–]?\s*r diagram|hr diagram)\b", evidence_text)
    is_spacetime = matches(r"\b(space\s*[-–]?\s*time|spacetime|world lines?|ct\s*[′']?)\b", evidence_text)
    is_pressure_volume = matches(
        r"\b(pressure\s*[-–]?\s*volume|p\s*[-–]?\s*v diagram|p\s+v diagram)\b",
        evidence_text,
    )

    if is_hr:
        capabilities.update({"hr_diagram", "logarithmic_axis", "reversed_axis"})
        evidence.append("Question wording identifies a Hertzsprung–Russell diagram.")
    elif is_spacetime:
        capabilities.add("spacetime_axes")
        evidence.append("Question wording identifies x/ct or world-line axes.")
    else:
        capabilities.add("linear_axes")

    if is_pressure_volume:
        capabilities.add("pressure_volume_axes")
        evidence.append("Question wording identifies pressure–volume axes.")
        if matches(r"\b(carnot cycle|cyclic process|undergoes? a cycle|closed cycle)\b", evidence_text):
            capabilities.add("closed_cycle")

    if plot_text and matches(r"(?:\d(?:[ .]\d)?|−\d)", plot_text):
        capabilities.add("quantitative_ticks")
    else:
        capabilities.add("qualitative_axes")

    if matches(
        r"\b(simple harmonic|oscillat|sinus|travelling wave|displacement.{0,45}(?:time|distance)|emf.{0,45}time)\b",
        evidence_text,
    ):
        capabilities.add("waveform_curve")
        evidence.append("Periodic motion or wave wording requires a waveform.")
    elif matches(
        r"\b(straight line|linearly|piecewise|constant acceleration|resultant force|triangular)\b",
        evidence_text,
    ):
        capabilities.add("polyline_curve")
    else:
        capabilities.add("smooth_curve")

    if matches(
        r"(?:\b(?:sketch|draw|plot)\b.{0,100}\b(?:graph|curve)\b|\b(?:graph|curve)\b.{0,100}\b(?:sketch|draw|plot)\b|\bon (?:the )?axes\b)",
        evidence_text,
    ):
        capabilities.add("student_drawn_curve")
        evidence.append("The student is asked to add or construct a curve.")

    if matches(
        r"\b(graphs?\s*[12]|graph one|graph two|two (?:graphs|curves)|both (?:graphs|curves)|multiple curves|curves? [a-d] and [a-d])\b",
        evidence_text,
    ):
        capabilities.add("multiple_series")

    if matches(
        r"\b(data points?|scatter|line of best fit|best-fit|experimental results? (?:are )?plotted)\b",
        evidence_text,
    ):
        capabilities.add("measured_points")
    if matches(r"\b(error bars?|uncertaint(?:y|ies))\b", evidence_text):
        capabilities.add("uncertainty_bars")
    if matches(r"\b(histogram|bar chart|bar graph)\b", evidence_text):
        capabilities.add("histogram_bars")
    if matches(r"\b(shade|shaded|hatched region)\b", evidence_text):
        capabilities.add("shaded_region")
    if matches(r"\b(tangent|gradient of (?:the |this )?graph|slope of (?:the |this )?graph)\b", evidence_text):
        capabilities.add("tangent_construction")
    if matches(r"\b(intercept|threshold|crosses? the (?:x|horizontal|time) axis)\b", evidence_text):
        capabilities.add("intercept_construction")
    if matches(
        r"\b(area under|area enclosed|work done.{0,80}graph|force.{0,30}distance graph|acceleration.{0,30}distance graph)\b",
        evidence_text,
    ):
        capabilities.add("area_interpretation")
    if matches(
        r"\b(radioactive decay|exponential|half-life|terminal (?:speed|velocity)|approach(?:es|ing)? (?:a )?(?:constant|steady)|charging|discharging)\b",
        evidence_text,
    ):
        capabilities.add("decay_or_asymptote")

    ordered = [item for item in CAPABILITIES if item in capabilities]
    return ordered, plot_asset_ids, evidence


def coverage_status(capabilities: list[str], is_pilot: bool) -> str:
    statuses = {CAPABILITIES[item]["renderer_status"] for item in capabilities}
    if "evidence_gap" in statuses:
        return "evidence_review"
    if "missing" in statuses:
        return "renderer_gap"
    if "implemented_untested" in statuses:
        return "fixture_gap"
    if is_pilot:
        return "pilot_fixture"
    return "covered_by_pilot_capabilities"


def source_label(question: dict[str, Any]) -> str:
    item = question["classification"]
    session = "May" if item["session"] == "may" else "November"
    zone = f" TZ{item['zone']}" if item["zone"] else ""
    return (
        f"{session} {item['year']}{zone} {item['level']} Paper "
        f"{item['paper']} Q{question['question_number']}"
    )


def build_records(
    run: Path, pilot_manifest: Path
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    sources = {item["source_id"]: item for item in read_jsonl(run / "sources.jsonl")}
    questions = {
        item["question_id"]: item for item in read_jsonl(run / "questions.jsonl")
    }
    assets = {
        item["asset_id"]: item for item in read_jsonl(run / "visual-assets.jsonl")
    }
    plans = [
        item
        for item in read_jsonl(run / "visual-plans.jsonl")
        if item["primary_family"] == "cartesian_plot"
    ]
    pilot = json.loads(pilot_manifest.read_text(encoding="utf-8"))
    pilot_fixtures = {
        item["sourceQuestionId"]: item for item in pilot.get("fixtures", [])
    }
    pilot_question_ids = {
        item["sourceQuestionId"] for item in pilot.get("fixtures", [])
    }

    records: list[dict[str, Any]] = []
    for plan in plans:
        question = questions[plan["question_id"]]
        source = sources[question["source_id"]]
        markscheme = sources.get(question.get("markscheme_source_id"))
        capabilities, plot_asset_ids, evidence = classify_capabilities(
            question, plan, assets
        )
        fingerprint = canonical_fingerprint(question["text"]["normalized"])
        is_pilot = question["question_id"] in pilot_question_ids
        manual_plot_assets = []
        pilot_fixture = pilot_fixtures.get(question["question_id"])
        if not plot_asset_ids and pilot_fixture and pilot_fixture.get("sourceCrop"):
            capabilities = [
                item for item in capabilities if item != "missing_crop_evidence"
            ]
            evidence.append(
                "The manually linked pilot crop supplies the missing automatic plot evidence."
            )
            manual_plot_assets.append(
                {
                    "asset_id": pilot_fixture["sourceAssetId"],
                    "page": pilot_fixture["sourcePage"],
                    "path": pilot_fixture["sourceCrop"],
                    "local_text": pilot_fixture["sourceNote"],
                    "evidence_source": "manual pilot fixture",
                }
            )
        missing = [
            item
            for item in capabilities
            if CAPABILITIES[item]["renderer_status"] == "missing"
        ]
        untested = [
            item
            for item in capabilities
            if CAPABILITIES[item]["renderer_status"] == "implemented_untested"
        ]
        records.append(
            {
                "question_id": question["question_id"],
                "source_question": source_label(question),
                "question_number": question["question_number"],
                "question_type": question["question_type"],
                "paper": question["classification"]["paper"],
                "year": question["classification"]["year"],
                "session": question["classification"]["session"],
                "zone": question["classification"]["zone"],
                "level": question["classification"]["level"],
                "question_excerpt": compact_text(question["text"]["normalized"]),
                "fingerprint": fingerprint,
                "source_pdf": str(Path("dataset") / source["relative_path"]),
                "source_pages": [
                    question["provenance"]["page_start"],
                    question["provenance"]["page_end"],
                ],
                "markscheme_pdf": (
                    str(Path("dataset") / markscheme["relative_path"])
                    if markscheme
                    else None
                ),
                "plan": {
                    "confidence": plan["confidence"],
                    "review_status": plan["review_status"],
                    "review_reasons": plan["review_reasons"],
                    "composition": plan["composition"],
                    "source_pages": plan["source_pages"],
                },
                "plot_assets": [
                    *[
                        {
                            "asset_id": asset_id,
                            "page": assets[asset_id]["page"],
                            "path": str(
                                run.relative_to(REPOSITORY) / assets[asset_id]["path"]
                            ),
                            "local_text": compact_text(
                                assets[asset_id]["local_text"], 500
                            ),
                            "evidence_source": "automatic Cartesian crop",
                        }
                        for asset_id in plot_asset_ids
                    ],
                    *manual_plot_assets,
                ],
                "capabilities": capabilities,
                "classification_evidence": evidence,
                "missing_renderer_capabilities": missing,
                "untested_renderer_capabilities": untested,
                "coverage_status": coverage_status(capabilities, is_pilot),
                "is_pilot_fixture": is_pilot,
                "selected_for_expansion": False,
                "selection_reasons": [],
                "training_eligibility": "blocked",
            }
        )

    duplicate_counts = Counter(record["fingerprint"] for record in records)
    for record in records:
        record["duplicate_group_size"] = duplicate_counts[record["fingerprint"]]
    records.sort(
        key=lambda item: (
            item["paper"] != "1A",
            item["year"],
            item["session"],
            item["zone"] or "",
            item["question_number"],
            item["question_id"],
        )
    )
    return records, pilot


def candidate_score(record: dict[str, Any]) -> tuple[int, int, int, int, str]:
    return (
        len(record["missing_renderer_capabilities"]),
        len(record["untested_renderer_capabilities"]),
        int(record["plan"]["review_status"] == "auto_catalogued"),
        len(record["plot_assets"]),
        record["question_id"],
    )


def select_representatives(
    records: list[dict[str, Any]], target: int = TARGET_EXPANSION_SIZE
) -> list[str]:
    """Select a stable, deduplicated expansion set with both papers represented."""

    candidates = [
        record
        for record in records
        if not record["is_pilot_fixture"]
        and record["plot_assets"]
        and record["markscheme_pdf"]
    ]
    candidates.sort(key=candidate_score, reverse=True)
    selected: list[dict[str, Any]] = []
    fingerprints: set[str] = set()
    paper_limits = {"1A": (target + 1) // 2, "2": target // 2}

    def add(record: dict[str, Any], reason: str) -> bool:
        if record["fingerprint"] in fingerprints:
            return False
        if sum(item["paper"] == record["paper"] for item in selected) >= paper_limits[
            record["paper"]
        ]:
            return False
        record["selected_for_expansion"] = True
        record["selection_reasons"].append(reason)
        selected.append(record)
        fingerprints.add(record["fingerprint"])
        return True

    priority_capabilities = [
        item
        for item, detail in CAPABILITIES.items()
        if detail["renderer_status"] in {"missing", "implemented_untested"}
        and item != "missing_crop_evidence"
    ]
    for capability in priority_capabilities:
        matching = [
            record for record in candidates if capability in record["capabilities"]
        ]
        if not matching:
            continue
        for paper in ("1A", "2"):
            reason = f"Exercises {CAPABILITIES[capability]['label'].lower()}."
            existing = next(
                (
                    record
                    for record in selected
                    if record["paper"] == paper
                    and capability in record["capabilities"]
                ),
                None,
            )
            if existing:
                if reason not in existing["selection_reasons"]:
                    existing["selection_reasons"].append(reason)
                continue
            paper_matches = [record for record in matching if record["paper"] == paper]
            if paper_matches:
                add(paper_matches[0], reason)
            if len(selected) >= target:
                break
        if len(selected) >= target:
            break

    while len(selected) < target:
        paper_counts = Counter(record["paper"] for record in selected)
        preferred_paper = "1A" if paper_counts["1A"] <= paper_counts["2"] else "2"
        signature_counts = Counter(
            tuple(
                sorted(
                    record["missing_renderer_capabilities"]
                    + record["untested_renderer_capabilities"]
                )
            )
            for record in selected
        )
        pool = [
            record
            for record in candidates
            if record["fingerprint"] not in fingerprints
            and record["paper"] == preferred_paper
            and paper_counts[record["paper"]] < paper_limits[record["paper"]]
            and signature_counts[
                tuple(
                    sorted(
                        record["missing_renderer_capabilities"]
                        + record["untested_renderer_capabilities"]
                    )
                )
            ]
            < 2
        ]
        if not pool:
            pool = [
                record
                for record in candidates
                if record["fingerprint"] not in fingerprints
                and paper_counts[record["paper"]] < paper_limits[record["paper"]]
                and signature_counts[
                    tuple(
                        sorted(
                            record["missing_renderer_capabilities"]
                            + record["untested_renderer_capabilities"]
                        )
                    )
                ]
                < 2
            ]
        if not pool:
            remaining = [
                record
                for record in candidates
                if record["fingerprint"] not in fingerprints
                and paper_counts[record["paper"]] < paper_limits[record["paper"]]
            ]
            if remaining:
                minimum_signature_count = min(
                    signature_counts[
                        tuple(
                            sorted(
                                record["missing_renderer_capabilities"]
                                + record["untested_renderer_capabilities"]
                            )
                        )
                    ]
                    for record in remaining
                )
                pool = [
                    record
                    for record in remaining
                    if signature_counts[
                        tuple(
                            sorted(
                                record["missing_renderer_capabilities"]
                                + record["untested_renderer_capabilities"]
                            )
                        )
                    ]
                    == minimum_signature_count
                ]
        if not pool:
            break
        add(pool[0], "Adds a distinct source-backed plot pattern.")

    return [record["question_id"] for record in selected]


def build_capability_summary(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for capability, detail in CAPABILITIES.items():
        matching = [record for record in records if capability in record["capabilities"]]
        result.append(
            {
                "id": capability,
                **detail,
                "status_label": STATUS_LABELS[detail["renderer_status"]],
                "record_count": len(matching),
                "unique_question_count": len(
                    {record["fingerprint"] for record in matching}
                ),
                "pilot_fixture_count": sum(
                    record["is_pilot_fixture"] for record in matching
                ),
                "selected_expansion_count": sum(
                    record["selected_for_expansion"] for record in matching
                ),
            }
        )
    return result


def validate_audit(audit: dict[str, Any], expected_count: int) -> None:
    records = audit["records"]
    if len(records) != expected_count:
        raise ValueError(
            f"Expected {expected_count} Cartesian records, found {len(records)}"
        )
    ids = [record["question_id"] for record in records]
    if len(set(ids)) != len(ids):
        raise ValueError("Cartesian audit contains duplicate question IDs")
    if any(record["training_eligibility"] != "blocked" for record in records):
        raise ValueError("Every audit record must remain blocked from training")
    selected = [record for record in records if record["selected_for_expansion"]]
    if len(selected) != TARGET_EXPANSION_SIZE:
        raise ValueError(
            f"Expected {TARGET_EXPANSION_SIZE} expansion records, found {len(selected)}"
        )
    if len({record["fingerprint"] for record in selected}) != len(selected):
        raise ValueError("Expansion set contains duplicated question stems")
    if {record["paper"] for record in selected} != {"1A", "2"}:
        raise ValueError("Expansion set must include Paper 1A and Paper 2")


def relative_url(output: Path, repository_path: str, page: int | None = None) -> str:
    relative = Path(os.path.relpath(REPOSITORY / repository_path, output))
    url = quote(relative.as_posix(), safe="/")
    return f"{url}#page={page}" if page else url


def capability_badges(record: dict[str, Any]) -> str:
    return "".join(
        f'<span class="cap {CAPABILITIES[item]["renderer_status"]}">'
        f"{html.escape(CAPABILITIES[item]['label'])}</span>"
        for item in record["capabilities"]
    )


def record_html(record: dict[str, Any], output: Path) -> str:
    search = " ".join(
        [
            record["source_question"],
            record["question_excerpt"],
            " ".join(record["capabilities"]),
        ]
    ).lower()
    classes = ["record", record["coverage_status"]]
    if record["selected_for_expansion"]:
        classes.append("selected")
    if record["is_pilot_fixture"]:
        classes.append("pilot")
    figures = "".join(
        '<figure><img loading="lazy" '
        f'src="{relative_url(output, item["path"])}" '
        f'alt="Plot crop for {html.escape(record["source_question"])}">'
        f'<figcaption>Plot crop · PDF page {item["page"]}</figcaption></figure>'
        for item in record["plot_assets"]
    )
    if not figures:
        figures = (
            '<p class="warning">No isolated plot crop is available. Use the source-page '
            "link before trusting this classification.</p>"
        )
    source_page = record["source_pages"][0]
    source_link = relative_url(output, record["source_pdf"], source_page)
    markscheme_link = (
        relative_url(output, record["markscheme_pdf"])
        if record["markscheme_pdf"]
        else None
    )
    reasons = "".join(
        f"<li>{html.escape(reason)}</li>" for reason in record["selection_reasons"]
    )
    review_reasons = "".join(
        f"<li>{html.escape(reason)}</li>"
        for reason in record["plan"]["review_reasons"]
    )
    selected_label = (
        '<span class="badge selected-badge">expansion set</span>'
        if record["selected_for_expansion"]
        else ""
    )
    pilot_label = (
        '<span class="badge pilot-badge">current pilot</span>'
        if record["is_pilot_fixture"]
        else ""
    )
    expansion_label = (
        '<span class="badge expansion-badge">source fixture</span>'
        if record.get("is_expansion_fixture")
        else ""
    )
    audit_correction = (
        '<p class="correction"><strong>Source-fixture correction:</strong> '
        f'{html.escape(record["audit_correction"])}</p>'
        if record.get("audit_correction")
        else ""
    )
    duplicate_label = (
        f'<span class="badge">{record["duplicate_group_size"]} repeated records</span>'
        if record["duplicate_group_size"] > 1
        else ""
    )
    return f'''<article class="{' '.join(classes)}" data-search="{html.escape(search, quote=True)}">
<header><div><h3>{html.escape(record['source_question'])}</h3><code>{html.escape(record['question_id'])}</code></div><div>{selected_label}{pilot_label}{expansion_label}{duplicate_label}<span class="badge">{html.escape(record['coverage_status'].replace('_', ' '))}</span></div></header>
<div class="caps">{capability_badges(record)}</div>
{audit_correction}
<div class="evidence">{figures}</div>
<details><summary>Question context and audit evidence</summary><pre>{html.escape(record['question_excerpt'])}</pre>
<p><a href="{source_link}">Open source PDF at page {source_page}</a>{f' · <a href="{markscheme_link}">Open linked mark scheme</a>' if markscheme_link else ' · no linked mark scheme'}</p>
{f'<h4>Why selected</h4><ul>{reasons}</ul>' if reasons else ''}
{f'<h4>Existing review gates</h4><ul>{review_reasons}</ul>' if review_reasons else ''}
<h4>Automatic classification evidence</h4><ul>{''.join(f'<li>{html.escape(item)}</li>' for item in record['classification_evidence']) or '<li>No extra rule evidence; inspect the crop.</li>'}</ul>
</details></article>'''


def render_html(audit: dict[str, Any], output: Path) -> str:
    summary = audit["summary"]
    capability_rows = "".join(
        f'''<tr><td>{html.escape(item['label'])}</td><td><span class="cap {item['renderer_status']}">{html.escape(item['status_label'])}</span></td><td>{item['record_count']}</td><td>{item['unique_question_count']}</td><td>{item['pilot_fixture_count']}</td><td>{item['selected_expansion_count']}</td></tr>'''
        for item in audit["capabilities"]
    )
    cards = "\n".join(record_html(record, output) for record in audit["records"])
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cartesian corpus coverage audit</title><style>
body{{font:15px/1.45 system-ui,sans-serif;max-width:1500px;margin:auto;padding:24px;color:#1d252b;background:#f4f6f7}}h1,h2,h3{{line-height:1.2}}.blocked{{border-left:6px solid #a33e18;background:#fff3e8;padding:14px 18px}}.stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:20px 0}}.stat{{background:#fff;border:1px solid #ccd4d8;border-radius:10px;padding:14px}}.stat strong{{display:block;font-size:28px}}table{{width:100%;border-collapse:collapse;background:#fff}}th,td{{padding:8px 10px;border:1px solid #d9dfe2;text-align:left}}th{{background:#edf1f3}}.controls{{position:sticky;top:0;background:#f4f6f7eF;padding:12px 0;z-index:2;display:flex;gap:8px;flex-wrap:wrap}}button,input{{font:inherit;padding:8px 12px}}button.active{{background:#24313a;color:#fff}}.record{{background:#fff;border:1px solid #cdd5d9;border-radius:12px;margin:16px 0;padding:18px}}.record header{{display:flex;justify-content:space-between;gap:12px;align-items:start}}.record h3{{margin:0 0 5px}}.badge,.cap{{display:inline-block;border-radius:999px;padding:3px 8px;margin:2px;font-size:12px;background:#e9edef}}.selected-badge,.expansion-badge{{background:#d7eddd}}.pilot-badge{{background:#dce9fb}}.cap.tested{{background:#d9efdf}}.cap.implemented_untested{{background:#fff0bf}}.cap.missing{{background:#ffd8d2}}.cap.evidence_gap{{background:#eedcf5}}.evidence{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin:12px 0}}figure{{margin:0}}figure img{{width:100%;max-height:420px;object-fit:contain;object-position:left center;border:1px solid #d9dfe2;background:#fff}}figcaption{{font-size:12px;color:#59656c}}pre{{white-space:pre-wrap;background:#f6f7f8;padding:12px;max-height:420px;overflow:auto}}details summary{{cursor:pointer;font-weight:650}}.warning,.correction{{padding:12px;background:#fff1e8;border-left:4px solid #b54818}}.hidden{{display:none}}code{{overflow-wrap:anywhere}}@media(max-width:700px){{.record header{{display:block}}}}
</style></head><body><h1>Cartesian corpus coverage audit</h1>
<p class="blocked"><strong>Training use blocked.</strong> This is an engineering coverage audit of automatic visual labels. It is not a reviewed dataset and does not promote any question package to training-ready status.</p>
<p>All {summary['record_count']} questions primarily labelled as Cartesian plots are present below. The default view shows the materialized {summary['selected_expansion_count']}-question source-fixture set. Automatic capability tags remain hypotheses wherever a fixture correction says otherwise.</p>
<div class="stats"><div class="stat"><strong>{summary['record_count']}</strong>candidate records</div><div class="stat"><strong>{summary['unique_question_count']}</strong>unique stems</div><div class="stat"><strong>{summary['duplicate_record_count']}</strong>repeated records</div><div class="stat"><strong>{summary['pilot_fixture_count']}</strong>physics-checked fixtures</div><div class="stat"><strong>{summary['expansion_fixture_count']}</strong>source expansion fixtures</div><div class="stat"><strong>{summary['records_missing_crop']}</strong>without automatic crop</div><div class="stat"><strong>{summary['renderer_gap_count']}</strong>records needing capabilities</div></div>
<h2>Capability matrix</h2><table><thead><tr><th>Capability</th><th>Current state</th><th>Records</th><th>Unique</th><th>Pilot</th><th>Expansion</th></tr></thead><tbody>{capability_rows}</tbody></table>
<h2>Source-linked questions</h2><div class="controls"><button data-filter="selected" class="active">Expansion set ({summary['selected_expansion_count']})</button><button data-filter="gap">Renderer gaps</button><button data-filter="evidence">Evidence review</button><button data-filter="pilot">Current pilot</button><button data-filter="all">All {summary['record_count']}</button><input id="search" type="search" placeholder="Search question or capability"></div><div id="records">{cards}</div>
<script>const records=[...document.querySelectorAll('.record')],buttons=[...document.querySelectorAll('button[data-filter]')],search=document.querySelector('#search');let filter='selected';function apply(){{const q=search.value.toLowerCase();records.forEach(r=>{{const match=filter==='all'||(filter==='selected'&&r.classList.contains('selected'))||(filter==='gap'&&r.classList.contains('renderer_gap'))||(filter==='evidence'&&r.classList.contains('evidence_review'))||(filter==='pilot'&&r.classList.contains('pilot'));r.classList.toggle('hidden',!match||!r.dataset.search.includes(q));}})}}buttons.forEach(b=>b.onclick=()=>{{filter=b.dataset.filter;buttons.forEach(x=>x.classList.toggle('active',x===b));apply();}});search.oninput=apply;apply();</script></body></html>'''


def build_audit(
    run: Path, pilot_manifest: Path, expansion_manifest: Path | None = None
) -> dict[str, Any]:
    records, pilot = build_records(run, pilot_manifest)
    expansion = None
    if expansion_manifest and expansion_manifest.exists():
        expansion = json.loads(expansion_manifest.read_text(encoding="utf-8"))
        expansion_fixtures = {
            item["sourceQuestionId"]: item for item in expansion.get("fixtures", [])
        }
        for record in records:
            fixture = expansion_fixtures.get(record["question_id"])
            record["is_expansion_fixture"] = fixture is not None
            record["audit_correction"] = (
                fixture.get("auditCorrection") if fixture else None
            )
            if fixture:
                record["selected_for_expansion"] = True
                record["selection_reasons"].append(
                    "Materialized as a source-linked Cartesian expansion fixture."
                )
                record["coverage_status"] = "expansion_fixture"
        missing_fixture_ids = set(expansion_fixtures) - {
            record["question_id"] for record in records
        }
        if missing_fixture_ids:
            raise ValueError(
                "Expansion manifest references non-Cartesian questions: "
                + ", ".join(sorted(missing_fixture_ids))
            )
    else:
        for record in records:
            record["is_expansion_fixture"] = False
            record["audit_correction"] = None
        select_representatives(records)
    fingerprints = {record["fingerprint"] for record in records}
    summary_file = json.loads((run / "summary.json").read_text(encoding="utf-8"))
    expected = next(
        item["primary_questions"]
        for item in summary_file["visual_families"]
        if item["family"] == "cartesian_plot"
    )
    audit = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "engineering-only-not-training-ready",
        "training_eligibility": "blocked",
        "training_blockers": [
            "automatic capability classifications require review",
            "questions are not complete verified packages",
            "source-use rights are not cleared",
        ],
        "source_run": str(run.relative_to(REPOSITORY)),
        "pilot_manifest": str(pilot_manifest.relative_to(REPOSITORY)),
        "expansion_manifest": (
            str(expansion_manifest.relative_to(REPOSITORY))
            if expansion_manifest and expansion_manifest.exists()
            else None
        ),
        "summary": {
            "record_count": len(records),
            "unique_question_count": len(fingerprints),
            "duplicate_record_count": len(records) - len(fingerprints),
            "pilot_fixture_count": sum(record["is_pilot_fixture"] for record in records),
            "expansion_fixture_count": sum(
                record["is_expansion_fixture"] for record in records
            ),
            "records_missing_crop": sum(not record["plot_assets"] for record in records),
            "records_needing_review": sum(
                record["plan"]["review_status"] == "needs_review"
                for record in records
            ),
            "renderer_gap_count": sum(
                record["coverage_status"] == "renderer_gap" for record in records
            ),
            "fixture_gap_count": sum(
                record["coverage_status"] == "fixture_gap" for record in records
            ),
            "selected_expansion_count": sum(
                record["selected_for_expansion"] for record in records
            ),
            "selected_by_paper": dict(
                Counter(
                    record["paper"]
                    for record in records
                    if record["selected_for_expansion"]
                )
            ),
            "pilot_schema_version": pilot.get("schemaVersion"),
            "expansion_schema_version": (
                expansion.get("schemaVersion") if expansion else None
            ),
        },
        "capabilities": build_capability_summary(records),
        "selected_expansion_ids": [
            record["question_id"]
            for record in records
            if record["selected_for_expansion"]
        ],
        "records": records,
    }
    validate_audit(audit, expected)
    return audit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, default=DEFAULT_RUN)
    parser.add_argument("--pilot-manifest", type=Path, default=DEFAULT_PILOT)
    parser.add_argument(
        "--expansion-manifest", type=Path, default=DEFAULT_EXPANSION
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    run = args.run.resolve()
    pilot_manifest = args.pilot_manifest.resolve()
    expansion_manifest = args.expansion_manifest.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    audit = build_audit(run, pilot_manifest, expansion_manifest)
    json_path = output / "cartesian-coverage.json"
    html_path = output / "cartesian-coverage.html"
    json_path.write_text(
        json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    html_path.write_text(render_html(audit, output), encoding="utf-8")
    summary = audit["summary"]
    print(
        "Generated Cartesian coverage audit: "
        f"{summary['record_count']} records, "
        f"{summary['unique_question_count']} unique stems, "
        f"{summary['selected_expansion_count']} expansion fixtures"
    )


if __name__ == "__main__":
    main()
