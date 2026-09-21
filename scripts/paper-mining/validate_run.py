#!/usr/bin/env python3
"""Validate referential integrity and completeness of a paper-mining run."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def unique(records: list[dict[str, Any]], key: str, errors: list[str]) -> set[str]:
    values = [record[key] for record in records]
    require(len(values) == len(set(values)), f"duplicate {key}", errors)
    return set(values)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "run",
        nargs="?",
        type=Path,
        default=Path("dataset/_derived/paper-mining-v0.1"),
    )
    args = parser.parse_args()
    run = args.run.resolve()
    sources = read_jsonl(run / "sources.jsonl")
    questions = read_jsonl(run / "questions.jsonl")
    plans = read_jsonl(run / "visual-plans.jsonl")
    assets = read_jsonl(run / "visual-assets.jsonl")
    review_queue = read_jsonl(run / "review-queue.jsonl")
    summary = json.loads((run / "summary.json").read_text(encoding="utf-8"))
    catalogue = json.loads((run / "visual-catalogue.json").read_text(encoding="utf-8"))
    errors: list[str] = []

    source_ids = unique(sources, "source_id", errors)
    question_ids = unique(questions, "question_id", errors)
    plan_ids = unique(plans, "visual_plan_id", errors)
    asset_ids = unique(assets, "asset_id", errors)
    family_ids = {family["family"] for family in catalogue["families"]}

    require(len(sources) == summary["sources"]["total"], "source count disagrees with summary", errors)
    require(len(questions) == summary["extraction"]["questions"], "question count disagrees with summary", errors)
    require(len(plans) == summary["extraction"]["visual_plans"], "visual-plan count disagrees with summary", errors)
    require(len(assets) == summary["extraction"]["visual_assets"], "asset count disagrees with summary", errors)
    require(
        len(review_queue) == summary["review"]["queue_items"],
        "review queue count disagrees with summary",
        errors,
    )
    require(
        sum(item["kind"] == "question" for item in review_queue)
        == summary["review"]["question_items"],
        "question review count disagrees with summary",
        errors,
    )
    require(
        sum(item["kind"] == "source" for item in review_queue)
        == summary["review"]["source_items"],
        "source review count disagrees with summary",
        errors,
    )

    questions_by_source: dict[str, list[int]] = defaultdict(list)
    for question in questions:
        require(question["source_id"] in source_ids, f"unknown question source: {question['question_id']}", errors)
        questions_by_source[question["source_id"]].append(question["question_number"])
        if question["visual_plan_id"]:
            require(question["visual_plan_id"] in plan_ids, f"missing question visual plan: {question['question_id']}", errors)
    for source_id, numbers in questions_by_source.items():
        require(sorted(numbers) == list(range(1, max(numbers) + 1)), f"non-sequential questions: {source_id}", errors)

    for source in sources:
        result = source.get("extraction_result")
        if source["paper"] == "1A" and result:
            require(result["complete_sequence"], f"incomplete Paper 1A sequence: {source['source_id']}", errors)

    plans_by_question = {plan["question_id"]: plan for plan in plans}
    for plan in plans:
        require(plan["question_id"] in question_ids, f"unknown visual-plan question: {plan['visual_plan_id']}", errors)
        require(plan["primary_family"] in family_ids, f"unknown plan family: {plan['visual_plan_id']}", errors)
        for asset_id in plan["source_assets"]:
            require(asset_id in asset_ids, f"unknown plan asset: {asset_id}", errors)
        for figure in plan["figures"]:
            require(figure["primary_family"] in family_ids, f"unknown figure family: {figure['figure_id']}", errors)
            for asset_id in figure["source_asset_ids"]:
                require(asset_id in asset_ids, f"unknown figure asset: {asset_id}", errors)

    for asset in assets:
        require(asset["source_id"] in source_ids, f"unknown asset source: {asset['asset_id']}", errors)
        require((run / asset["path"]).is_file(), f"missing asset file: {asset['path']}", errors)
        require(asset["classification"]["primary_family"] in family_ids, f"unknown asset family: {asset['asset_id']}", errors)

    for question in questions:
        if question["visual_plan_id"]:
            require(question["question_id"] in plans_by_question, f"missing plan record: {question['question_id']}", errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"Validation failed with {len(errors)} error(s)")
        return 1

    print(
        json.dumps(
            {
                "sources": len(sources),
                "questions": len(questions),
                "visual_plans": len(plans),
                "figure_records": sum(len(plan["figures"]) for plan in plans),
                "visual_assets": len(assets),
                "review_queue": len(review_queue),
                "families": len(family_ids),
                "status": "valid",
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
