#!/usr/bin/env python3
"""Apply saved human visual-label decisions without changing mined source records."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from copy import deepcopy
from pathlib import Path
from typing import Any


DEFAULT_RUN = Path("dataset/_derived/paper-mining-v0.1")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def apply_decision(
    plan: dict[str, Any], decision: dict[str, Any], families: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Return a reviewed copy of a visual plan, leaving the mined plan intact."""

    status = decision["status"]
    if status not in {"accepted", "corrected"}:
        raise ValueError("Only accepted or corrected decisions can be materialized")
    reviewed = deepcopy(plan)
    chosen_family = decision.get("family") or plan["primary_family"]
    figure_families = decision.get("figure_families", {})
    if chosen_family not in families:
        raise ValueError(f"Unknown visual family: {chosen_family}")
    figure_ids = {figure["figure_id"] for figure in plan["figures"]}
    if set(figure_families) - figure_ids:
        raise ValueError("Decision contains an unknown figure ID")
    if status == "accepted" and (
        chosen_family != plan["primary_family"]
        or any(
            figure_families.get(figure["figure_id"], figure["primary_family"])
            != figure["primary_family"]
            for figure in plan["figures"]
        )
    ):
        raise ValueError("Use corrected status when changing a visual family")

    reviewed["primary_family"] = chosen_family
    reviewed["template_id"] = families[chosen_family]["template_id"]
    for figure in reviewed["figures"]:
        family = figure_families.get(figure["figure_id"], figure["primary_family"])
        if family not in families:
            raise ValueError(f"Unknown figure family: {family}")
        figure["primary_family"] = family
        figure["template_id"] = families[family]["template_id"]
        figure["required_primitives"] = families[family]["required_primitives"]
    reviewed["required_primitives"] = sorted(
        {
            primitive
            for figure in reviewed["figures"]
            for primitive in figure["required_primitives"]
        }
    )
    reviewed["review_status"] = "human_reviewed"
    reviewed["review_decision"] = {
        "status": status,
        "reviewed_at": decision["reviewed_at"],
        "notes": decision.get("notes", ""),
        "original_primary_family": plan["primary_family"],
    }
    return reviewed


def materialize(run: Path) -> dict[str, Any]:
    catalogue = json.loads((run / "visual-catalogue.json").read_text(encoding="utf-8"))
    families = {family["family"]: family for family in catalogue["families"]}
    queue = read_jsonl(run / "review-queue.jsonl")
    queue_by_id = {item["id"]: item for item in queue}
    plans = {plan["question_id"]: plan for plan in read_jsonl(run / "visual-plans.jsonl")}
    decision_path = run / "review-decisions.json"
    decisions = (
        json.loads(decision_path.read_text(encoding="utf-8"))["decisions"]
        if decision_path.exists()
        else {}
    )

    if stale := set(decisions) - set(queue_by_id):
        raise ValueError(f"Review decisions not in current queue: {sorted(stale)[:4]}")

    accepted: list[dict[str, Any]] = []
    statuses = Counter()
    unresolved = 0
    accepted_missing_crop = 0
    for item in queue:
        decision = decisions.get(item["id"])
        if not decision:
            unresolved += 1
            continue
        status = decision["status"]
        statuses[status] += 1
        if status not in {"accepted", "corrected"}:
            continue
        plan = plans.get(item["id"])
        if not plan:
            continue  # Source-level decisions do not create figure labels.
        accepted.append(apply_decision(plan, decision, families))
        if "visual cue found but no vector/raster crop was isolated" in item["reasons"]:
            accepted_missing_crop += 1

    report = {
        "schema_version": "review-materialization/0.1.0",
        "source_queue_items": len(queue),
        "unresolved": unresolved,
        "decision_status_counts": dict(sorted(statuses.items())),
        "human_reviewed_visual_plans": len(accepted),
        "reviewed_labels_still_needing_crop": accepted_missing_crop,
        "training_ready_question_packages": 0,
        "training_readiness_note": (
            "This command applies visual labels only. It does not verify mark-scheme "
            "answers, calculations, copyright status, or training eligibility."
        ),
    }
    output = run / "reviewed"
    output.mkdir(exist_ok=True)
    plans_path = output / "visual-plans.jsonl"
    plans_temp = output / ".visual-plans.jsonl.tmp"
    plans_temp.write_text(
        "".join(json.dumps(plan, ensure_ascii=False) + "\n" for plan in accepted),
        encoding="utf-8",
    )
    plans_temp.replace(plans_path)
    report_path = output / "report.json"
    report_temp = output / ".report.json.tmp"
    report_temp.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    report_temp.replace(report_path)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", nargs="?", type=Path, default=DEFAULT_RUN)
    args = parser.parse_args()
    print(json.dumps(materialize(args.run.resolve()), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
