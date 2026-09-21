import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("mine_papers.py")
SPEC = importlib.util.spec_from_file_location("mine_papers", MODULE_PATH)
assert SPEC and SPEC.loader
mine_papers = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mine_papers)


class SourceClassificationTests(unittest.TestCase):
    def test_parses_official_underscore_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = (
                root
                / "2026 Examination Session"
                / "May 2026 Examination Session"
                / "Physics_paper_1A_TZ2_HL.pdf"
            )
            path.parent.mkdir(parents=True)
            path.write_bytes(b"fixture")

            source = mine_papers.classify_source(path, root)

            self.assertEqual(source["paper"], "1A")
            self.assertEqual(source["level"], "HL")
            self.assertEqual(source["zone"], "2")
            self.assertEqual(source["session"], "may")

    def test_links_donated_zone_alias_to_official_copy(self):
        official = {
            "source_id": "official",
            "sha256": "one",
            "year": 2025,
            "session": "may",
            "paper": "2",
            "level": "HL",
            "zone": "2",
            "language": "en",
            "role": "question_paper",
            "source_kind": "official_pdf",
            "duplicate_of": None,
            "duplicate_method": None,
        }
        donated = {
            **official,
            "source_id": "donated",
            "sha256": "two",
            "source_kind": "donated_scan",
        }

        mine_papers.link_duplicates([official, donated])

        self.assertEqual(donated["duplicate_of"], "official")
        self.assertEqual(donated["duplicate_method"], "session-paper-level-zone metadata")


class ExtractionRuleTests(unittest.TestCase):
    def test_accepts_only_sequential_left_margin_question_markers(self):
        pages = [
            {
                "width": 600,
                "lines": [
                    {"text": "1. First", "bbox": [40, 100, 200, 120]},
                    {"text": "2.0 m", "bbox": [99, 150, 160, 170]},
                    {"text": "2. Second", "bbox": [40, 300, 200, 320]},
                ],
            }
        ]

        markers = mine_papers.find_question_markers(pages)

        self.assertEqual([marker["number"] for marker in markers], [1, 2])

    def test_accepts_ocr_marker_variants_and_keeps_same_baseline_stem(self):
        pages = [
            {
                "width": 600,
                "lines": [
                    {"text": "1.", "bbox": [40, 100, 55, 120]},
                    {"text": "First question", "bbox": [65, 100, 240, 120]},
                    {"text": "Second question", "bbox": [65, 299, 240, 320]},
                    {"text": "2", "bbox": [40, 300, 55, 320]},
                    {"text": "3.Third question", "bbox": [40, 500, 240, 520]},
                ],
            }
        ]

        markers = mine_papers.find_question_markers(pages)

        self.assertEqual([marker["number"] for marker in markers], [1, 2, 3])
        self.assertEqual(markers[1]["line_index"], 2)

    def test_classifies_graph_before_generic_geometry(self):
        classifications, evidence = mine_papers.classify_visual(
            "The graph shows the variation of velocity with time as shown.", True
        )

        self.assertEqual(classifications[0]["family"], "cartesian_plot")
        self.assertIn("graph", evidence)

    def test_splits_mechanics_and_electromagnetic_scenes_from_geometry_fallback(self):
        mechanics, _ = mine_papers.classify_visual(
            "The diagram shows a block sliding down an inclined plane.", True
        )
        electromagnetic, _ = mine_papers.classify_visual(
            "A proton follows the path shown between charged parallel plates.", True
        )
        generic, _ = mine_papers.classify_visual("The arrangement is shown.", True)

        self.assertEqual(mechanics[0]["family"], "mechanics_scene")
        self.assertEqual(electromagnetic[0]["family"], "electromagnetic_scene")
        self.assertEqual(generic[0]["family"], "geometry_scene")
        self.assertLess(generic[0]["confidence"], 0.6)

    def test_does_not_treat_every_ice_block_as_a_thermal_scene(self):
        optics, _ = mine_papers.classify_visual(
            "A ray of light enters a block of ice as shown.", True
        )
        thermal, _ = mine_papers.classify_visual(
            "A block of ice melts when water is placed on it, as shown.", True
        )

        self.assertEqual(optics[0]["family"], "ray_wave")
        self.assertEqual(thermal[0]["family"], "thermal_energy_scene")

    def test_recognizes_energy_levels_and_parenthesized_pv_diagram(self):
        levels, _ = mine_papers.classify_visual(
            "The diagram shows three energy levels of an atom.", True
        )
        plot, _ = mine_papers.classify_visual(
            "Which pressure–volume (P–V) diagram represents the cycle?", True
        )

        self.assertEqual(levels[0]["family"], "energy_level")
        self.assertEqual(plot[0]["family"], "cartesian_plot")

    def test_extracts_only_complete_mcq_option_sets(self):
        complete = mine_papers.extract_options(
            ["A. one", "B. two", "C. three", "D. four"]
        )
        incomplete = mine_papers.extract_options(["A. one", "B. two"])

        self.assertEqual([option["label"] for option in complete], ["A", "B", "C", "D"])
        self.assertEqual(incomplete, [])

    def test_preserves_graphical_mcq_labels_as_visual_options(self):
        options = mine_papers.extract_options(
            ["Which point is correct?", "C.", "B.", "A.", "D.", "x / m"]
        )

        self.assertEqual([option["label"] for option in options], ["A", "B", "C", "D"])
        self.assertTrue(all(option["presentation"] == "visual_label" for option in options))

    def test_applies_specific_question_context_to_low_text_crop(self):
        figures = [
            {
                "primary_family": "geometry_scene",
                "template_id": "scene.geometry.v1",
                "confidence": 0.45,
                "evidence": ["vector or raster asset detected"],
                "required_primitives": ["shape"],
            }
        ]
        primary = {
            "family": "circuit_network",
            "confidence": 0.76,
            "evidence": ["circuit"],
        }

        mine_papers.apply_question_context_to_figures(figures, primary, "1A")

        self.assertEqual(figures[0]["primary_family"], "circuit_network")
        self.assertGreaterEqual(figures[0]["confidence"], 0.6)
        self.assertEqual(
            figures[0]["classification_provenance"]["original"]["primary_family"],
            "geometry_scene",
        )

    def test_does_not_flatten_multi_figure_paper_two_question(self):
        figures = [
            {"primary_family": "geometry_scene", "confidence": 0.45},
            {"primary_family": "geometry_scene", "confidence": 0.45},
        ]
        primary = {
            "family": "cartesian_plot",
            "confidence": 0.76,
            "evidence": ["graph"],
        }

        mine_papers.apply_question_context_to_figures(figures, primary, "2")

        self.assertEqual([figure["confidence"] for figure in figures], [0.45, 0.45])

    def test_carries_forward_only_still_relevant_review_decisions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            backup = root / "backup"
            temporary = root / "temporary"
            backup.mkdir()
            temporary.mkdir()
            (backup / "review-decisions.json").write_text(
                '{"schema_version":"review-decisions/0.1.0","updated_at":null,'
                '"decisions":{"q_keep":{"status":"accepted"},'
                '"q_retired":{"status":"accepted"}}}',
                encoding="utf-8",
            )

            count = mine_papers.carry_forward_review_decisions(
                backup, temporary, {"q_keep"}
            )

            self.assertEqual(count, 1)
            self.assertEqual(
                set(
                    json.loads((temporary / "review-decisions.json").read_text())[
                        "decisions"
                    ]
                ),
                {"q_keep"},
            )


if __name__ == "__main__":
    unittest.main()
