import copy
import importlib.util
import json
from pathlib import Path
import random
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("sample_pilot", Path(__file__).with_name("sample_pilot.py"))
sample_pilot = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = sample_pilot
SPEC.loader.exec_module(sample_pilot)


def candidate(key, paper="1A", level="HL", text=None, checked=False, family=None):
    source = {"source_id": "source-" + key, "year": 2026, "session": "may", "zone": "3", "paper": paper, "level": level, "relative_path": key + ".pdf", "sha256": key, "duplicate_of": None}
    question = {
        "question_id": key, "source_id": source["source_id"], "question_number": 1,
        "classification": {"paper": paper, "level": level, "year": 2026, "session": "may", "zone": "3", "language": "en"},
        "text": {"normalized": text or "Distinct question " + key},
        "provenance": {"page_start": 1, "page_end": 1}, "markscheme_source_id": "scheme",
        "extraction": {"review_reasons": []}, "visual_asset_ids": [],
    }
    package = {"packageId": "package-" + key, "studentVisuals": [{"family": family or "mechanics_scene"}], "theme": "A"} if checked else None
    plan = {"primary_family": family, "review_reasons": []} if family else None
    return sample_pilot.Candidate(question, source, source["source_id"], plan, package, ("A",), ("conceptual",), (), ())


class GroupingTests(unittest.TestCase):
    def test_question_numbers_and_multiline_footer_do_not_separate_shared_sources(self):
        text = "An object falls vertically in a uniform gravitational field. Determine the change in its velocity after release."
        a = candidate("one", text="4.\n" + text + "\nPlease do not write on this page.\nAnswers written on this page\nwill not be marked.")
        b = candidate("two", level="SL", text="2.\n" + text)
        membership, groups, evidence = sample_pilot.build_groups([a, b])
        self.assertEqual(membership["one"], membership["two"])
        self.assertEqual(len(groups), 1)
        self.assertIn("exact-text", {edge["reason"] for edge in evidence})

    def test_numeric_variants_and_extra_hl_subparts_share_the_scenario_group(self):
        stem = "A block starts at rest at the top of a rough inclined plane. The block moves down the plane and reaches the bottom with a measured speed."
        a = candidate("sl", paper="2", level="SL", text=stem + "\n(a) Calculate its kinetic energy when its mass is 2.0 kg.")
        b = candidate("hl", paper="2", text=stem + "\n(a) Calculate its kinetic energy when its mass is 4.0 kg.\n(b) Derive the friction coefficient.")
        membership, _, _ = sample_pilot.build_groups([a, b])
        self.assertEqual(membership["sl"], membership["hl"])

    def test_distinct_short_graph_prompts_do_not_merge(self):
        a = candidate("spring", text="The graph shows the variation of energy with extension.")
        b = candidate("heat", text="The graph shows the variation of pressure with temperature.")
        membership, _, _ = sample_pilot.build_groups([a, b])
        self.assertNotEqual(membership["spring"], membership["heat"])

    def test_rainforest_spacing_does_not_separate_the_same_question(self):
        text = "The greenhouse effect is affected by changes in rain forests. Which change increases the amount of radiation absorbed by the atmosphere?"
        a = candidate("forests", text=text)
        b = candidate("forest", level="SL", text=text.replace("rain forests", "rainforests"))
        membership, _, _ = sample_pilot.build_groups([a, b])
        self.assertEqual(membership["forests"], membership["forest"])

    def test_radioactive_table_context_with_different_tasks_stays_together(self):
        stem = "The table shows how the count rate from a sample of a radioactive nuclide varies with time t. The nuclide has a half-life of 50 s."
        a = candidate("background", level="SL", text=stem + " What is the background count rate?")
        b = candidate("later", text=stem + " The average background count rate is constant. What count rate will the detector measure later?")
        membership, _, _ = sample_pilot.build_groups([a, b])
        self.assertEqual(membership["background"], membership["later"])

    def test_group_membership_is_transitive_and_independent_of_input_order(self):
        a = candidate("a", text="A distinctive physical setup has enough words to preserve its unique source context and calculation conditions.")
        b = candidate("b", text=a.question["text"]["normalized"])
        c = candidate("c", text="A completely different scenario with separate experimental assumptions.")
        first = sample_pilot.build_groups([a, b, c])
        second = sample_pilot.build_groups([c, b, a])
        self.assertEqual(first, second)

    def test_internal_sl_question_reused_as_later_hl_parts_is_grouped(self):
        shared = "The main sequence star Lambda Cephei produces energy through fusion. A hydrogen nucleus combines with another nucleus in a nuclear reaction. The measured atomic masses are supplied in a table. Calculate the energy released by the reaction and explain how the star evolves after the hydrogen supply is exhausted."
        a = candidate("star-sl", paper="2", level="SL", text=shared + "\n(a) Determine the energy output.")
        b = candidate("star-hl", paper="2", text="A satellite leaves a distant planet. Its mass and radius are given.\n(a) Calculate the gravitational escape speed and explain the effect of changing the launch height.\n(c) " + shared)
        membership, _, edges = sample_pilot.build_groups([a, b])
        self.assertEqual(membership["star-sl"], membership["star-hl"])

    def test_duplicate_source_chain_and_cycles(self):
        sources = {"a": {"duplicate_of": "b"}, "b": {"duplicate_of": "c"}, "c": {"duplicate_of": None}}
        self.assertEqual(sample_pilot.canonical_source("a", sources), "c")
        sources["c"]["duplicate_of"] = "a"
        with self.assertRaisesRegex(ValueError, "Cyclic"):
            sample_pilot.canonical_source("a", sources)


class SamplingTests(unittest.TestCase):
    def setUp(self):
        self.candidates = [candidate(f"q-{paper}-{level}-{index}", paper, level, checked=(paper, level, index) in {("1A", "HL", 0), ("2", "SL", 0)}) for paper, level in sample_pilot.STRATA for index in range(35)]
        self.membership = {c.id: "group-" + c.id for c in self.candidates}
        self.groups = {self.membership[c.id]: [c.id] for c in self.candidates}

    def test_balanced_sample_keeps_anchors_and_is_reproducible(self):
        selected, quotas = sample_pilot.sample_candidates(self.candidates, self.membership, 100, "fixed-seed")
        self.assertEqual(len(selected), 100)
        self.assertEqual({row["actual"] for row in quotas.values()}, {25})
        self.assertTrue({c.id for c in self.candidates if c.checked}.issubset({c.id for c in selected}))
        shuffled = self.candidates[:]
        random.Random(123).shuffle(shuffled)
        second, _ = sample_pilot.sample_candidates(shuffled, self.membership, 100, "fixed-seed")
        self.assertEqual([c.id for c in selected], [c.id for c in second])

    def test_short_stratum_is_reported_and_redistributed(self):
        small = [c for c in self.candidates if c.stratum != ("2", "SL") or c.id.endswith("-0")]
        selected, quotas = sample_pilot.sample_candidates(small, self.membership, 40, "fixed-seed")
        self.assertEqual(len(selected), 40)
        self.assertEqual(quotas["2-SL"], {"target": 10, "actual": 1})

    def test_insufficient_independent_sources_fail(self):
        with self.assertRaisesRegex(ValueError, "independent"):
            sample_pilot.sample_candidates(self.candidates[:5], self.membership, 20, "seed")

    def test_split_balance_and_development_sibling_protection(self):
        selected, _ = sample_pilot.sample_candidates(self.candidates, self.membership, 100, "fixed-seed")
        developed = {c.id for c in self.candidates if c.checked}
        sibling = candidate("alias", level="SL")
        parent = next(c.id for c in self.candidates if c.checked)
        self.membership[sibling.id] = self.membership[parent]
        self.groups[self.membership[parent]].append(sibling.id)
        assignment, _ = sample_pilot.assign_splits(self.candidates + [sibling], selected, self.membership, self.groups, developed, "fixed-seed")
        actual = {split: sum(assignment[self.membership[c.id]] == split for c in selected) for split in sample_pilot.SPLITS}
        self.assertEqual(actual, {"train": 70, "validation": 15, "test": 15})
        self.assertEqual(assignment[self.membership[sibling.id]], "train")
        shuffled = selected[:]
        random.Random(123).shuffle(shuffled)
        second, _ = sample_pilot.assign_splits(self.candidates + [sibling], shuffled, self.membership, self.groups, developed, "fixed-seed")
        self.assertEqual(assignment, second)

    def test_synthetic_descendants_inherit_only_one_known_split(self):
        manifest = {"questions": [{"questionId": "source", "split": "train"}, {"questionId": "sibling", "split": "train"}, {"questionId": "holdout", "split": "test"}]}
        self.assertEqual(sample_pilot.descendant_split(["source", "sibling"], manifest), "train")
        with self.assertRaisesRegex(ValueError, "cross"):
            sample_pilot.descendant_split(["source", "holdout"], manifest)
        with self.assertRaisesRegex(ValueError, "Every"):
            sample_pilot.descendant_split(["missing"], manifest)
        excluded = {"questions": [{"questionId": "missing-scheme", "split": "train", "samplingExclusions": ["missing linked mark scheme"]}]}
        with self.assertRaisesRegex(ValueError, "excluded"):
            sample_pilot.descendant_split(["missing-scheme"], excluded)

    def test_publish_preserves_previous_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            output, staging = parent / "pilot", parent / "staging"
            output.mkdir()
            staging.mkdir()
            (output / "index.html").write_text("previous")
            (staging / "index.html").write_text("new")
            backup = sample_pilot.publish(staging, output)
            self.assertEqual((output / "index.html").read_text(), "new")
            self.assertEqual((backup / "index.html").read_text(), "previous")

    def test_duplicate_input_ids_fail_at_file_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "questions.jsonl"
            path.write_text('{"question_id":"same"}\n{"question_id":"same"}\n')
            with self.assertRaisesRegex(ValueError, "duplicate"):
                sample_pilot.read_index(path, "question_id")


if __name__ == "__main__":
    unittest.main()
