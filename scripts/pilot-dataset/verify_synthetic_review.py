import argparse
import hashlib
import json
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(artifact: Path) -> dict:
    manifest = json.loads((artifact / "manifest.json").read_text())
    batch_id = manifest["batchId"]
    reviews = artifact / "reviews"
    graphs = json.loads((reviews / "graphs-mechanics.json").read_text())
    fields = json.loads((reviews / "circuits-fields.json").read_text())
    student = json.loads((reviews / "student-view.json").read_text())
    if graphs["final_batch_fingerprint"] != batch_id or fields["finalBatchRecheck"]["batchId"] != batch_id or student["batchId"] != batch_id:
        raise ValueError("Reviews belong to another batch")
    manifest_hash = digest(artifact / "manifest.json")
    if graphs["final_manifest_sha256"] != manifest_hash or fields["finalBatchRecheck"]["manifestSha256"] != manifest_hash:
        raise ValueError("Reviewed manifest differs from current manifest")
    if graphs["remaining_material_issues"] or fields["finalBatchRecheck"]["materialFindings"] or student["materialOpenFindings"]:
        raise ValueError("A reviewer reports an unresolved material finding")
    for relative_path, expected in student["artifactSha256"].items():
        if digest(artifact / relative_path) != expected:
            raise ValueError(f"Student view changed after review: {relative_path}")
    domain_records = {
        record["id"]: (record["final_package_sha256"], record["final_figure_sha256"])
        for record in graphs["records"]
    }
    for record in fields["finalBatchRecheck"]["packages"]:
        if record["id"] in domain_records:
            raise ValueError("Duplicate domain review coverage")
        domain_records[record["id"]] = (record["packageSha256"], record["figureSha256"])
    student_records = {record["id"]: record for record in student["packages"]}
    ids = {item["id"] for item in manifest["packages"]}
    if len(ids) != 20 or ids != set(domain_records) or ids != set(student_records):
        raise ValueError("All twenty packages need physics and student-view review")
    results = []
    for item in manifest["packages"]:
        package_hash = digest(artifact / item["package"])
        figure_hash = digest(artifact / item["figure"])
        record = student_records[item["id"]]
        if domain_records[item["id"]] != (package_hash, figure_hash) or record["packageSha256"] != package_hash or record["figureSha256"] != figure_hash:
            raise ValueError(f"Question changed after review: {item['id']}")
        if record["studentSolvability"] != "pass" or record["diagramConsistency"] != "pass":
            raise ValueError(f"Student view needs a repair: {item['id']}")
        for width, expected in record["finalScreenshotSha256"].items():
            if digest(reviews / "screenshots" / f"{width}-{item['id']}.png") != expected:
                raise ValueError(f"Reviewed screenshot differs: {item['id']} at {width}")
        package = json.loads((artifact / item["package"]).read_text())
        if package["reviewStatus"] != "awaiting-human-review" or package["trainingEligibility"] != "blocked-pending-review-and-source-use-clearance":
            raise ValueError("Agent review must not fabricate human acceptance")
        results.append({"id": item["id"], "packageSha256": package_hash, "figureSha256": figure_hash, "independentPhysicsReview": "passed", "studentViewReview": "passed"})
    return {
        "schemaVersion": "synthetic-agent-review-verification/0.1.0",
        "batchId": batch_id,
        "reviewerModel": "gpt-6.1-sol",
        "independentReviewers": 3,
        "independentlyCheckedQuestions": len(results),
        "visuallyInspectedDesktopAndMobileScreenshots": len(results) * 2,
        "unresolvedMaterialFindings": [],
        "humanAcceptanceRecorded": False,
        "reviewEvidence": {name: digest(reviews / name) for name in ["graphs-mechanics.json", "circuits-fields.json", "student-view.json"]},
        "packages": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Check that independent reviews cover the current synthetic pilot artifacts.")
    parser.add_argument("artifact", nargs="?", type=Path, default=Path("dataset/_derived/new-question-pilot-v0.1"))
    args = parser.parse_args()
    result = verify(args.artifact)
    (args.artifact / "verification-agent-review.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"batchId": result["batchId"], "independentlyCheckedQuestions": result["independentlyCheckedQuestions"], "reviewedScreenshots": result["visuallyInspectedDesktopAndMobileScreenshots"], "unresolvedMaterialFindings": result["unresolvedMaterialFindings"]}))


if __name__ == "__main__":
    main()
