#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import random
import subprocess
import tempfile
import xml.etree.ElementTree as ET

from sample_pilot import SUPPORTED, descendant_split, file_hash, load_inputs, make_manifests


def verify(source_root: Path, output: Path, repository: Path) -> dict:
    sample = json.loads((output / "pilot-manifest.json").read_text())
    splits = json.loads((output / "split-manifest.json").read_text())
    report = json.loads((output / "coverage.json").read_text())
    candidates, inventory, hashes, assets = load_inputs(source_root, repository)
    expected, expected_splits, expected_report, _ = make_manifests(candidates, inventory, hashes, sample["requestedSize"], sample["seed"])
    if (sample, splits, report) != (expected, expected_splits, expected_report):
        raise ValueError("Artifact disagrees with its immutable inputs or deterministic sampler")
    shuffled = candidates[:]
    random.Random(9823).shuffle(shuffled)
    repeated = make_manifests(shuffled, inventory, hashes, sample["requestedSize"], sample["seed"])
    if repeated[:3] != (sample, splits, report):
        raise ValueError("Input ordering changes the sample or splits")
    split_by_question = {q["questionId"]: q["split"] for q in splits["questions"]}
    eligible = {q["questionId"] for q in splits["questions"] if not q["samplingExclusions"]}
    for group in splits["groups"]:
        if {split_by_question[q] for q in group["questionIds"]} != {group["split"]}:
            raise ValueError("A source group crosses dataset splits")
        parents = [q for q in group["questionIds"] if q in eligible]
        if parents and descendant_split(parents, splits) != group["split"]:
            raise ValueError("A descendant fails to inherit its frozen source split")
    protected = inventory["developmentQuestionIds"]
    if any(split_by_question[q] != "train" for q in protected):
        raise ValueError("Developed source material leaked into evaluation")
    checked_ids = {q["questionId"] for q in sample["questions"] if q["checkedPackageId"]}
    if checked_ids != {p["questionId"] for p in inventory["packages"]}:
        raise ValueError("Existing checked package anchors are missing")
    for family in SUPPORTED:
        for split in ("validation", "test"):
            if not any(q["representation"] == family and q["split"] == split for q in sample["questions"]):
                raise ValueError(f"No fresh {family} {split} source")
    source_rows = [json.loads(line) for line in (output / "pilot-questions.jsonl").read_text().splitlines()]
    source_records = {c.id: c.question for c in candidates}
    if {row["question_id"] for row in source_rows} != {q["questionId"] for q in sample["questions"]}:
        raise ValueError("Source question export differs from pilot membership")
    if any(row != source_records[row["question_id"]] for row in source_rows):
        raise ValueError("Original extracted question data was altered")
    for package in inventory["packages"]:
        actual = json.loads((output / "packages" / (package["packageId"] + ".json")).read_text())
        if actual != package["package"]:
            raise ValueError("Checked package copy differs from the canonical package")
        for index, visual in enumerate(package["studentVisuals"], 1):
            svg = output / "packages" / (package["packageId"] + f"-{index}.svg")
            if svg.read_text() != visual["svg"]:
                raise ValueError("Rendered student visual differs from the checked renderer")
            ET.fromstring(svg.read_text())
    preview = json.loads((output / "preview-manifest.json").read_text())
    for path in preview["sourcePageFiles"]:
        if not (output / path).is_file():
            raise ValueError("A source-page preview is missing")
    selected_ids = {q["questionId"] for q in sample["questions"]}
    for candidate in candidates:
        if candidate.id in selected_ids:
            for asset_id in candidate.question["visual_asset_ids"]:
                asset = assets[asset_id]
                original = source_root / "dataset/_derived/paper-mining-v0.1" / asset["path"]
                copy = output / "assets/crops" / (asset_id + original.suffix)
                if file_hash(original) != file_hash(copy):
                    raise ValueError("Copied crop differs from source evidence")
    try:
        descendant_split([next(q for q, s in split_by_question.items() if s == "train"), next(q for q, s in split_by_question.items() if s == "test")], splits)
    except ValueError:
        pass
    else:
        raise ValueError("Cross-split synthetic parents were accepted")
    with tempfile.TemporaryDirectory(prefix="ibphysiq-pilot-restart-") as directory:
        temporary = Path(directory) / "pilot"
        temporary.mkdir()
        (temporary / "split-manifest.json").write_text(json.dumps(splits))
        base = ["python3", str(repository / "scripts/pilot-dataset/sample_pilot.py"), "--source-root", str(source_root), "--output", str(temporary), "--size", str(sample["requestedSize"]), "--seed", sample["seed"], "--no-page-previews"]
        subprocess.run(base, check=True, capture_output=True, text=True)
        first = json.loads((temporary / "split-manifest.json").read_text())
        subprocess.run(base, check=True, capture_output=True, text=True)
        if json.loads((temporary / "split-manifest.json").read_text()) != first:
            raise ValueError("CLI restart changes frozen splits")
        if not list(temporary.parent.glob("pilot.backup-*")):
            raise ValueError("CLI rerun did not preserve its previous artifact")
        changed = base[:]
        changed[changed.index("--seed") + 1] = "different-seed"
        rejected = subprocess.run(changed, capture_output=True, text=True)
        if rejected.returncode == 0 or "Frozen split manifest differs" not in rejected.stderr + rejected.stdout:
            raise ValueError("A changed seed silently replaced frozen splits")
        if json.loads((temporary / "split-manifest.json").read_text()) != first:
            raise ValueError("Rejected rerun changed the artifact")
    return {"passed": True, "pilotQuestions": len(sample["questions"]), "independentGroups": report["pilotIndependentSourceGroups"], "pilotSplits": report["pilotSplits"], "protectedDevelopmentSources": len(protected), "crossSplitSourceGroups": 0, "freshValidationAndTestPerWorkingFamily": True, "sameSeedRestartPreserved": True, "changedSeedRejected": True, "allCheckedPackagesAndSourceCopiesMatch": True, "sourcePdfChecksumsMatch": True, "sourcePagePreviews": len(preview["sourcePageFiles"]), "syntheticCrossSplitParentsRejected": True}


def main():
    parser = argparse.ArgumentParser(description="Verify the real pilot artifact, source lineage and restart behavior.")
    repository = Path(__file__).resolve().parents[2]
    parser.add_argument("--source-root", type=Path, default=repository)
    parser.add_argument("--output", type=Path, default=repository / "dataset/_derived/pilot-dataset-v0.1")
    args = parser.parse_args()
    receipt = verify(args.source_root.resolve(), args.output.resolve(), repository)
    (args.output / "verification.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
