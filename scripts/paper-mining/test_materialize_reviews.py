import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("materialize_reviews.py")
SPEC = importlib.util.spec_from_file_location("materialize_reviews", MODULE_PATH)
assert SPEC and SPEC.loader
materialize_reviews = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(materialize_reviews)


class ReviewMaterializationTests(unittest.TestCase):
    def setUp(self):
        self.families = {
            "geometry_scene": {
                "template_id": "scene.geometry.v1",
                "required_primitives": ["object"],
            },
            "mechanics_scene": {
                "template_id": "scene.mechanics.v1",
                "required_primitives": ["object", "path"],
            },
        }
        self.plan = {
            "question_id": "q_one",
            "primary_family": "geometry_scene",
            "template_id": "scene.geometry.v1",
            "figures": [
                {
                    "figure_id": "fig_one",
                    "primary_family": "geometry_scene",
                    "template_id": "scene.geometry.v1",
                    "required_primitives": ["object"],
                }
            ],
            "required_primitives": ["object"],
            "review_status": "needs_review",
        }

    def test_applies_corrected_family_to_copy(self):
        corrected = materialize_reviews.apply_decision(
            self.plan,
            {
                "status": "corrected",
                "family": "mechanics_scene",
                "figure_families": {"fig_one": "mechanics_scene"},
                "reviewed_at": "2026-09-18T00:00:00Z",
            },
            self.families,
        )

        self.assertEqual(corrected["primary_family"], "mechanics_scene")
        self.assertEqual(corrected["figures"][0]["template_id"], "scene.mechanics.v1")
        self.assertEqual(corrected["required_primitives"], ["object", "path"])
        self.assertEqual(self.plan["primary_family"], "geometry_scene")

    def test_rejects_changed_family_as_accept_current(self):
        with self.assertRaisesRegex(ValueError, "Use corrected"):
            materialize_reviews.apply_decision(
                self.plan,
                {
                    "status": "accepted",
                    "family": "mechanics_scene",
                    "reviewed_at": "2026-09-18T00:00:00Z",
                },
                self.families,
            )

    def test_materializes_only_final_human_visual_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            (run / "visual-catalogue.json").write_text(
                json.dumps(
                    {
                        "families": [
                            {"family": name, **definition}
                            for name, definition in self.families.items()
                        ]
                    }
                ),
                encoding="utf-8",
            )
            (run / "review-queue.jsonl").write_text(
                json.dumps({"id": "q_one", "kind": "question", "reasons": []}) + "\n"
                + json.dumps({"id": "q_two", "kind": "question", "reasons": []}) + "\n",
                encoding="utf-8",
            )
            (run / "visual-plans.jsonl").write_text(
                json.dumps(self.plan) + "\n", encoding="utf-8"
            )
            (run / "review-decisions.json").write_text(
                json.dumps(
                    {
                        "decisions": {
                            "q_one": {
                                "status": "corrected",
                                "family": "mechanics_scene",
                                "figure_families": {"fig_one": "mechanics_scene"},
                                "reviewed_at": "2026-09-18T00:00:00Z",
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            report = materialize_reviews.materialize(run)

            labels = materialize_reviews.read_jsonl(run / "reviewed/visual-plans.jsonl")
            self.assertEqual(report["source_queue_items"], 2)
            self.assertEqual(report["unresolved"], 1)
            self.assertEqual(report["human_reviewed_visual_plans"], 1)
            self.assertEqual(report["training_ready_question_packages"], 0)
            self.assertEqual(labels[0]["primary_family"], "mechanics_scene")


if __name__ == "__main__":
    unittest.main()
