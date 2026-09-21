import importlib.util
import json
import tempfile
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen


MODULE_PATH = Path(__file__).with_name("review_server.py")
SPEC = importlib.util.spec_from_file_location("review_server", MODULE_PATH)
assert SPEC and SPEC.loader
review_server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review_server)


def write_jsonl(path, records):
    path.write_text(
        "".join(json.dumps(record) + "\n" for record in records), encoding="utf-8"
    )


class ReviewItemTests(unittest.TestCase):
    def test_builds_contextual_visual_review_item(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            write_jsonl(
                run / "sources.jsonl",
                [
                    {
                        "source_id": "src_one",
                        "relative_path": "paper.pdf",
                        "year": 2026,
                        "session": "may",
                        "paper": "1A",
                        "level": "HL",
                        "zone": "1",
                    }
                ],
            )
            write_jsonl(
                run / "questions.jsonl",
                [
                    {
                        "question_id": "q_one",
                        "question_number": 4,
                        "text": {"normalized": "The circuit is shown.", "options": []},
                        "provenance": {"page_start": 2, "page_end": 2},
                    }
                ],
            )
            write_jsonl(
                run / "visual-plans.jsonl",
                [
                    {
                        "question_id": "q_one",
                        "primary_family": "circuit_network",
                        "confidence": 0.58,
                        "composition": "single",
                        "figures": [
                            {
                                "figure_id": "fig_one",
                                "primary_family": "geometry_scene",
                                "confidence": 0.45,
                                "composition_role": "single",
                                "source_asset_ids": ["vis_one"],
                            }
                        ],
                        "source_assets": ["vis_one"],
                    }
                ],
            )
            write_jsonl(
                run / "visual-assets.jsonl",
                [
                    {
                        "asset_id": "vis_one",
                        "page": 2,
                        "path": "assets/one.png",
                        "classification": {
                            "primary_family": "geometry_scene",
                            "confidence": 0.45,
                        },
                    }
                ],
            )
            write_jsonl(
                run / "review-queue.jsonl",
                [
                    {
                        "kind": "question",
                        "id": "q_one",
                        "source_id": "src_one",
                        "reasons": ["visual family classification is low-confidence"],
                    }
                ],
            )

            items = review_server.build_review_items(run)

            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["bucket"], "visual_semantics")
            self.assertEqual(items[0]["question"]["normalized_text"], "The circuit is shown.")
            self.assertEqual(items[0]["assets"][0]["asset_id"], "vis_one")
            self.assertEqual(
                items[0]["visual_plan"]["figures"][0]["assets"][0]["asset_id"],
                "vis_one",
            )
            self.assertIn("uncertain", items[0]["issues"][0]["title"].lower())

            application = review_server.ReviewApplication(run, run)
            server = ThreadingHTTPServer(
                ("127.0.0.1", 0), review_server.make_handler(application)
            )
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                base = f"http://127.0.0.1:{server.server_port}"
                with urlopen(base + "/api/meta") as response:
                    self.assertEqual(json.load(response)["total"], 1)
                request = Request(
                    base + "/api/decision",
                    data=json.dumps(
                        {
                            "item_id": "q_one",
                            "status": "accepted",
                            "family": "circuit_network",
                            "figure_families": {"fig_one": "geometry_scene"},
                        }
                    ).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urlopen(request) as response:
                    self.assertEqual(response.status, 201)
                with urlopen(base + "/api/meta") as response:
                    self.assertEqual(json.load(response)["remaining"], 0)

                changed = Request(
                    base + "/api/decision",
                    data=json.dumps(
                        {
                            "item_id": "q_one",
                            "status": "accepted",
                            "family": "mechanics_scene",
                            "figure_families": {"fig_one": "geometry_scene"},
                        }
                    ).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with self.assertRaises(HTTPError) as error:
                    urlopen(changed)
                self.assertEqual(error.exception.code, 400)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

    def test_pilot_sample_skips_duplicate_question_stems(self):
        items = [
            {
                "id": f"q_{index}",
                "kind": "question",
                "bucket": "visual_semantics",
                "visual_plan": {"primary_family": "geometry_scene"},
                "source": {"paper": "1A"},
                "question": {"normalized_text": text},
            }
            for index, text in enumerate(
                ["The same diagram is shown.", "The same diagram is shown.", "A different diagram is shown."]
            )
        ]

        selected = review_server.pilot_sample_ids(items, limit=3)

        self.assertEqual(selected, {"q_0", "q_2"})


class DecisionStoreTests(unittest.TestCase):
    def test_replaces_one_items_decision_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            store = review_server.DecisionStore(Path(directory) / "decisions.json")

            store.put("q_one", {"status": "accepted", "notes": "checked"})
            store.put(
                "q_one",
                {
                    "status": "corrected",
                    "family": "circuit_network",
                    "figure_families": {"fig_one": "circuit_network"},
                    "notes": "circuit confirmed",
                },
            )

            data = store.read()
            self.assertEqual(len(data["decisions"]), 1)
            self.assertEqual(data["decisions"]["q_one"]["status"], "corrected")
            self.assertEqual(data["decisions"]["q_one"]["family"], "circuit_network")
            self.assertEqual(
                data["decisions"]["q_one"]["figure_families"]["fig_one"],
                "circuit_network",
            )


if __name__ == "__main__":
    unittest.main()
