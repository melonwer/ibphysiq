import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("audit_cartesian.py")
SPEC = importlib.util.spec_from_file_location("audit_cartesian", MODULE_PATH)
assert SPEC and SPEC.loader
audit_cartesian = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit_cartesian)


def question(text: str) -> dict:
    return {"text": {"normalized": text}}


def plan(
    *,
    composition: str = "single",
    figure_count: int = 1,
    asset_ids: list[str] | None = None,
) -> dict:
    ids = asset_ids or []
    figures = [
        {
            "primary_family": "cartesian_plot",
            "source_asset_ids": ids[index : index + 1],
        }
        for index in range(figure_count)
    ]
    return {"composition": composition, "figures": figures}


class CapabilityClassificationTests(unittest.TestCase):
    def test_detects_graph_option_grid_and_waveform(self):
        capabilities, asset_ids, evidence = audit_cartesian.classify_capabilities(
            question(
                "A mass oscillates with simple harmonic motion. Which graph shows its displacement?"
            ),
            plan(
                composition="panel-grid",
                figure_count=4,
                asset_ids=["a", "b", "c", "d"],
            ),
            {
                item: {"local_text": "displacement / cm 0 1 2 time / s"}
                for item in ["a", "b", "c", "d"]
            },
        )

        self.assertIn("option_panel_grid", capabilities)
        self.assertIn("waveform_curve", capabilities)
        self.assertIn("quantitative_ticks", capabilities)
        self.assertEqual(asset_ids, ["a", "b", "c", "d"])
        self.assertTrue(evidence)

    def test_detects_hr_axes_and_missing_crop(self):
        capabilities, asset_ids, _ = audit_cartesian.classify_capabilities(
            question("The Hertzsprung–Russell diagram shows the star."),
            plan(asset_ids=[]),
            {},
        )

        self.assertIn("hr_diagram", capabilities)
        self.assertIn("logarithmic_axis", capabilities)
        self.assertIn("reversed_axis", capabilities)
        self.assertIn("missing_crop_evidence", capabilities)
        self.assertNotIn("linear_axes", capabilities)
        self.assertEqual(asset_ids, [])

    def test_detects_teacher_curve_and_gradient_requirements(self):
        capabilities, _, _ = audit_cartesian.classify_capabilities(
            question(
                "Sketch on the axes a graph of kinetic energy. Use the gradient of the graph."
            ),
            plan(asset_ids=["plot"]),
            {"plot": {"local_text": "Sketch, on the axes, a graph 0 0.8 t / s"}},
        )

        self.assertIn("student_drawn_curve", capabilities)
        self.assertIn("tangent_construction", capabilities)


class SelectionTests(unittest.TestCase):
    def test_selects_unique_stems_from_both_papers(self):
        records = []
        for index in range(30):
            paper = "1A" if index % 2 == 0 else "2"
            records.append(
                {
                    "question_id": f"q{index}",
                    "paper": paper,
                    "fingerprint": f"f{index // 2}" if index < 2 else f"f{index}",
                    "is_pilot_fixture": False,
                    "plot_assets": [{"path": "plot.png"}],
                    "markscheme_pdf": "scheme.pdf",
                    "missing_renderer_capabilities": ["option_panel_grid"],
                    "untested_renderer_capabilities": [],
                    "capabilities": ["option_panel_grid"],
                    "plan": {"review_status": "auto_catalogued"},
                    "selected_for_expansion": False,
                    "selection_reasons": [],
                }
            )

        selected = audit_cartesian.select_representatives(records, target=10)
        chosen = [record for record in records if record["question_id"] in selected]

        self.assertEqual(len(selected), 10)
        self.assertEqual(len({record["fingerprint"] for record in chosen}), 10)
        self.assertEqual({record["paper"] for record in chosen}, {"1A", "2"})


class TextTests(unittest.TestCase):
    def test_fingerprint_ignores_question_number_and_spacing(self):
        first = audit_cartesian.canonical_fingerprint("12. A graph shows velocity.")
        second = audit_cartesian.canonical_fingerprint(
            "4   A graph   shows velocity."
        )

        self.assertEqual(first, second)

    def test_compact_text_removes_answer_line_noise(self):
        value = "Question\n" + "�" * 80 + "\nUseful context"

        self.assertEqual(
            audit_cartesian.compact_text(value), "Question\nUseful context"
        )


if __name__ == "__main__":
    unittest.main()
