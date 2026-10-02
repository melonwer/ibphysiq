#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
import hashlib
import itertools
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unicodedata
from datetime import datetime, timezone

VERSION = "pilot-sample/0.1.0"
SPLIT_VERSION = "source-group-splits/0.1.0"
STRATA = (("1A", "SL"), ("1A", "HL"), ("2", "SL"), ("2", "HL"))
SPLITS = ("train", "validation", "test")
SUPPORTED = {"cartesian_plot", "circuit_network", "field_map", "mechanics_scene"}
THEMES = {
    "A": "Space, time and motion",
    "B": "The particulate nature of matter",
    "C": "Wave behaviour",
    "D": "Fields",
    "E": "Nuclear and quantum physics",
}
THEME_PATTERNS = {
    "A": r"\b(?:velocity|acceleration|momentum|collision|projectile|kinetic|friction|pendulum|displacement|torque|falling|work done|elastic rope|truck)\b",
    "B": r"\b(?:temperature|thermal|heat|gas|pressure|density|molecule|ideal gas|entropy|resistor|resistance|circuit|thermistor|lamp|ldr|greenhouse|albedo)\b",
    "C": r"\b(?:wave|wavelength|frequency|oscillation|harmonic|diffraction|interference|refraction|resonance|doppler|polariz\w*|polarisation|standing wave)\b",
    "D": r"\b(?:electric field|magnetic field|gravitational field|potential|charge|coulomb|induction|induced|orbit|planet|satellite|flux|faraday)\b",
    "E": r"\b(?:nuclear|nucleus|nuclei|radioactive|decay|half.life|photon|electron|proton|neutron|quantum|photoelectric|fission|fusion|binding energy|energy level|de broglie)\b",
}


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean_text(text: str, number_neutral: bool = False) -> str:
    lines = []
    for line in unicodedata.normalize("NFKC", text).splitlines():
        stripped = line.strip()
        if re.fullmatch(r"\d+\.?|[–−-]\s*\d+\s*[–−-]|\d{4}\s*[–−-]\s*\d{4}", stripped):
            continue
        if re.search(r"turn over|question.*continued|continues on the following page", stripped, re.I):
            continue
        lines.append(stripped)
    result = " ".join(lines).lower()
    result = re.sub(r"please do not write on this page\.?|answers written on this page will not be marked\.?", " ", result)
    if number_neutral:
        result = re.sub(r"(?<![a-z])[-+]?\d+(?:\.\d+)?", " value ", result)
    return " ".join(re.findall(r"[\w]+", result))


def context_text(question: dict) -> str:
    text = question["text"]["normalized"]
    if question["classification"]["paper"] == "1A":
        text = re.split(r"\n\s*A\s*[.)]\s*(?:\n|$)", text, maxsplit=1)[0]
    else:
        text = re.split(r"\(a\)|\n\s*a\s*\)", text, maxsplit=1)[0]
    return clean_text(text, number_neutral=True)


@dataclass(frozen=True)
class Candidate:
    question: dict
    source: dict
    canonical_source: str
    plan: dict | None
    checked: dict | None
    themes: tuple[str, ...]
    skills: tuple[str, ...]
    issues: tuple[str, ...]
    excluded: tuple[str, ...]

    @property
    def id(self) -> str:
        return self.question["question_id"]

    @property
    def stratum(self) -> tuple[str, str]:
        classification = self.question["classification"]
        return classification["paper"], classification["level"]

    @property
    def family(self) -> str:
        if self.checked:
            return self.checked["studentVisuals"][0]["family"]
        return self.plan["primary_family"] if self.plan else "no_visual"


def inferred_labels(text: str, checked: dict | None) -> tuple[tuple[str, ...], tuple[str, ...]]:
    themes = {theme for theme, pattern in THEME_PATTERNS.items() if re.search(pattern, text, re.I)}
    if checked:
        themes.add(checked["theme"])
    skills = set()
    for label, pattern in {
        "quantitative": r"\b(?:calculate|determine|find the|magnitude|value|ratio|how much)\b|\d\.\d",
        "conceptual": r"\b(?:explain|describe|state|deduce|why|which|identify|suggest)\b",
        "graphical": r"\b(?:graph|plot|sketch|gradient|area under|axes)\b",
    }.items():
        if re.search(pattern, text, re.I):
            skills.add(label)
    return tuple(sorted(themes)) or ("unclassified",), tuple(sorted(skills)) or ("unclassified",)


def canonical_source(source_id: str, sources: dict[str, dict]) -> str:
    visited = set()
    while sources[source_id].get("duplicate_of"):
        if source_id in visited:
            raise ValueError("Cyclic source duplicate linkage")
        visited.add(source_id)
        source_id = sources[source_id]["duplicate_of"]
        if source_id not in sources:
            raise ValueError("Unknown canonical source")
    return source_id


def candidates_from_records(questions: list[dict], sources: dict[str, dict], plans: dict[str, dict], inventory: dict) -> list[Candidate]:
    checked = {item["questionId"]: item for item in inventory["packages"]}
    if len(checked) != len(inventory["packages"]):
        raise ValueError("Duplicate checked package source")
    candidates = []
    for question in sorted(questions, key=lambda q: q["question_id"]):
        source = sources[question["source_id"]]
        item = checked.get(question["question_id"])
        plan = plans.get(question["question_id"])
        text = question["text"]["normalized"]
        themes, skills = inferred_labels(text, item)
        issues = list(question["extraction"]["review_reasons"])
        if plan:
            issues.extend(plan["review_reasons"])
        excluded = []
        if question["classification"]["language"] != "en":
            excluded.append("outside English pilot")
        if (question["classification"]["paper"], question["classification"]["level"]) not in STRATA:
            excluded.append("outside Paper 1A/Paper 2 SL/HL pilot")
        if not question["markscheme_source_id"]:
            excluded.append("missing linked mark scheme")
        if not text.strip():
            excluded.append("empty extracted question")
        candidates.append(Candidate(question, source, canonical_source(source["source_id"], sources), plan, item, themes, skills, tuple(sorted(set(issues))), tuple(excluded)))
    missing = set(checked) - {c.id for c in candidates}
    if missing:
        raise ValueError(f"Checked package sources missing from corpus: {sorted(missing)}")
    return candidates


def build_groups(candidates: list[Candidate]) -> tuple[dict[str, str], dict[str, list[str]], list[dict]]:
    candidates = sorted(candidates, key=lambda c: c.id)
    parents = {c.id: c.id for c in candidates}

    def root(key: str) -> str:
        while parents[key] != key:
            parents[key] = parents[parents[key]]
            key = parents[key]
        return key

    edges = []

    def connect(a: str, b: str, reason: str, score: float = 1.0) -> None:
        edges.append({"a": min(a, b), "b": max(a, b), "reason": reason, "score": round(score, 6)})
        ra, rb = root(a), root(b)
        parents[max(ra, rb)] = min(ra, rb)

    indexed = defaultdict(list)
    contexts = {}
    for candidate in candidates:
        text = clean_text(candidate.question["text"]["normalized"])
        neutral = clean_text(candidate.question["text"]["normalized"], number_neutral=True)
        context = context_text(candidate.question)
        contexts[candidate.id] = context
        keys = [("canonical-source-question", candidate.canonical_source, candidate.question["question_number"])]
        if len(text.split()) >= 8:
            keys.append(("exact-text", text))
            keys.append(("spacing-neutral-text", text.replace(" ", "")))
        if len(neutral.split()) >= 12:
            keys.append(("number-neutral-text", neutral))
        if len(context.split()) >= 12:
            keys.append(("shared-scenario-context", context))
        for key in keys:
            if indexed[key]:
                connect(indexed[key][0], candidate.id, key[0])
            indexed[key].append(candidate.id)

    shingles = {}
    for key, text in contexts.items():
        tokens = text.split()
        shingles[key] = {tuple(tokens[i:i + 3]) for i in range(len(tokens) - 2)} if len(tokens) >= 18 else set()
    fulltexts = {c.id: clean_text(c.question["text"]["normalized"], number_neutral=True) for c in candidates}
    wordsets = {key: set(text.split()) for key, text in fulltexts.items()}
    for a, b in itertools.combinations(sorted(contexts), 2):
        if root(a) == root(b):
            continue
        fa, fb = fulltexts[a], fulltexts[b]
        if min(len(fa), len(fb)) >= 120 and min(len(wordsets[a]), len(wordsets[b])) >= 12:
            size_ratio = min(len(fa), len(fb)) / max(len(fa), len(fb))
            word_overlap = len(wordsets[a] & wordsets[b]) / min(len(wordsets[a]), len(wordsets[b]))
            if size_ratio >= 0.85 and word_overlap >= 0.85:
                ratio = SequenceMatcher(None, fa, fb, autojunk=False).ratio()
                if ratio >= 0.96:
                    connect(a, b, "near-duplicate-full-question", ratio)
                    continue
        if not shingles[a] or not shingles[b]:
            continue
        overlap = len(shingles[a] & shingles[b])
        similarity = overlap / min(len(shingles[a]), len(shingles[b]))
        length_ratio = min(len(contexts[a]), len(contexts[b])) / max(len(contexts[a]), len(contexts[b]))
        if similarity >= 0.82 and length_ratio >= 0.55:
            connect(a, b, "near-duplicate-context", similarity)
        elif length_ratio >= 0.8 and similarity >= 0.6:
            ratio = SequenceMatcher(None, contexts[a], contexts[b], autojunk=False).ratio()
            if ratio >= 0.92:
                connect(a, b, "near-duplicate-wording", ratio)
    by_session = defaultdict(list)
    for candidate in candidates:
        classification = candidate.question["classification"]
        key = tuple(classification[k] for k in ("year", "session", "zone", "paper"))
        by_session[key].append(candidate)
    for peers in by_session.values():
        for a, b in itertools.combinations(peers, 2):
            if a.stratum[1] == b.stratum[1] or root(a.id) == root(b.id):
                continue
            ta = clean_text(a.question["text"]["normalized"], number_neutral=True).split()
            tb = clean_text(b.question["text"]["normalized"], number_neutral=True).split()
            shared = list(itertools.takewhile(lambda pair: pair[0] == pair[1], zip(ta, tb)))
            if len(shared) >= 25:
                connect(a.id, b.id, "shared-sl-hl-question-prefix", len(shared) / min(len(ta), len(tb)))
                continue
            full_a = clean_text(a.question["text"]["normalized"]).split()
            full_b = clean_text(b.question["text"]["normalized"]).split()
            if min(len(full_a), len(full_b)) >= 45:
                blocks = SequenceMatcher(None, full_a, full_b, autojunk=False).get_matching_blocks()
                matched = sum(block.size for block in blocks)
                fraction = matched / min(len(full_a), len(full_b))
                if matched >= 40 and max(block.size for block in blocks) >= 20 and fraction >= 0.65:
                    connect(a.id, b.id, "shared-sl-hl-subparts", fraction)
    by_root = defaultdict(list)
    for candidate in candidates:
        by_root[root(candidate.id)].append(candidate.id)
    groups = {"group-" + digest(sorted(members))[:20]: sorted(members) for members in by_root.values()}
    membership = {question: group for group, members in groups.items() for question in members}
    return membership, dict(sorted(groups.items())), sorted(edges, key=lambda e: (e["a"], e["b"], e["reason"]))


def sample_candidates(candidates: list[Candidate], membership: dict[str, str], size: int, seed: str, development_ids: set[str] | None = None, gap_budget: int | None = None) -> tuple[list[Candidate], dict]:
    eligible = [c for c in candidates if not c.excluded]
    selected = sorted((c for c in eligible if c.checked), key=lambda c: c.id)
    if any(c.checked and c.excluded for c in candidates):
        raise ValueError("A checked package source is ineligible")
    if len(selected) > size:
        raise ValueError(f"Pilot size must include the {len(selected)} checked package anchors")
    quotas = {stratum: size // 4 + (index < size % 4) for index, stratum in enumerate(STRATA)}
    selected_groups = {membership[c.id] for c in selected}
    selected_ids = {c.id for c in selected}
    protected = {membership[q] for q in development_ids or set()}
    gap_budget = size // 5 if gap_budget is None else gap_budget
    fresh_groups = {family: {membership[c.id] for c in eligible if c.family == family and membership[c.id] not in protected} for family in SUPPORTED}
    for family in sorted(SUPPORTED, key=lambda f: (len(fresh_groups[f]), f)):
        for _ in range(2):
            if len(selected) >= size:
                break
            options = [c for c in eligible if c.family == family and membership[c.id] not in selected_groups | protected]
            if not options:
                break
            stratum_counts = Counter(c.stratum for c in selected)
            chosen = min(options, key=lambda c: (stratum_counts[c.stratum] >= quotas[c.stratum], stratum_counts[c.stratum], digest([seed, "fresh-family", c.id])))
            selected.append(chosen)
            selected_ids.add(chosen.id)
            selected_groups.add(membership[chosen.id])

    def counts(attribute) -> Counter:
        return Counter(attribute(c) for c in selected)

    while len(selected) < size:
        available = [c for c in eligible if c.id not in selected_ids and membership[c.id] not in selected_groups]
        if sum(c.family not in SUPPORTED | {"no_visual"} for c in selected) >= gap_budget:
            available = [c for c in available if c.family in SUPPORTED | {"no_visual"}]
        if not available:
            raise ValueError(f"Only {len(selected)} eligible independent sources available for size {size}")
        stratum_counts = counts(lambda c: c.stratum)
        capacities = {s: len({membership[c.id] for c in available if c.stratum == s}) for s in STRATA}
        deficits = {s: max(0, quotas[s] - stratum_counts[s]) for s in STRATA}
        need = [s for s in STRATA if deficits[s] and capacities[s]]
        if need:
            stratum = min(need, key=lambda s: (capacities[s] / deficits[s], -deficits[s], s))
            available = [c for c in available if c.stratum == stratum]
        else:
            stratum = min((s for s in STRATA if capacities[s]), key=lambda s: (stratum_counts[s], s))
            available = [c for c in available if c.stratum == stratum]
        families = counts(lambda c: c.family)
        papers = counts(lambda c: c.source["source_id"])
        sessions = counts(lambda c: (c.source["year"], c.source["session"]))
        themes = Counter(t for c in selected for t in c.themes)
        skills = Counter(s for c in selected for s in c.skills)

        def score(c: Candidate) -> tuple[float, str]:
            value = 5 / (1 + families[c.family]) + 3 / (1 + papers[c.source["source_id"]])
            value += 2 / (1 + sessions[(c.source["year"], c.source["session"])])
            value += sum(3 / (1 + themes[t]) for t in c.themes if t != "unclassified")
            value += sum(1 / (1 + skills[s]) for s in c.skills)
            if c.family == "no_visual" and families[c.family] < size // 5:
                value += 3
            value -= 0.25 * bool(c.issues)
            return value, digest([seed, c.id])

        chosen = max(available, key=score)
        selected.append(chosen)
        selected_ids.add(chosen.id)
        selected_groups.add(membership[chosen.id])
    selected.sort(key=lambda c: (c.stratum, c.source["year"], c.source["session"], c.source.get("zone") or "", c.question["question_number"], c.id))
    actual = Counter(c.stratum for c in selected)
    return selected, {f"{paper}-{level}": {"target": quotas[(paper, level)], "actual": actual[(paper, level)]} for paper, level in STRATA}


def assign_splits(candidates: list[Candidate], selected: list[Candidate], membership: dict[str, str], groups: dict[str, list[str]], development_ids: set[str], seed: str) -> tuple[dict[str, str], dict]:
    unknown = development_ids - set(membership)
    if unknown:
        raise ValueError(f"Development source IDs missing from corpus: {sorted(unknown)}")
    protected = {membership[q] for q in development_ids}
    selected_by_group = defaultdict(list)
    for c in selected:
        selected_by_group[membership[c.id]].append(c)
    assignment = {group: "train" for group in protected}
    selected_counts = Counter(c.stratum for c in selected)
    target = {s: {} for s in STRATA if selected_counts[s]}
    for split in ("test", "validation"):
        for stratum in target:
            target[stratum][split] = int(selected_counts[stratum] * 0.15)
        remaining = round(len(selected) * 0.15) - sum(value[split] for value in target.values())
        order = sorted(target, key=lambda s: (-(selected_counts[s] * 0.15 % 1), digest([seed, split, s])))
        for stratum in order[:remaining]:
            target[stratum][split] += 1
    actual = {s: Counter() for s in STRATA}
    pending = set(selected_by_group) - protected
    for split in ("test", "validation"):
        family_order = sorted(SUPPORTED, key=lambda family: (sum(any(c.family == family for c in selected_by_group[g]) for g in pending), family))
        for family in family_order:
            choices = [g for g in pending if any(c.family == family for c in selected_by_group[g])]
            if not choices:
                continue
            group = min(choices, key=lambda g: (sum(max(0, actual[c.stratum][split] + 1 - target[c.stratum][split]) for c in selected_by_group[g]), digest([seed, split, "family", g])))
            assignment[group] = split
            pending.remove(group)
            for c in selected_by_group[group]:
                actual[c.stratum][split] += 1
        for stratum in sorted(target, key=lambda s: (sum(any(c.stratum == s for c in selected_by_group[g]) for g in pending), s)):
            while actual[stratum][split] < target[stratum][split]:
                choices = [g for g in pending if any(c.stratum == stratum for c in selected_by_group[g])]
                if not choices:
                    break
                group = min(choices, key=lambda g: (sum(max(0, actual[c.stratum][split] + 1 - target[c.stratum][split]) for c in selected_by_group[g]), digest([seed, split, g])))
                assignment[group] = split
                pending.remove(group)
                for c in selected_by_group[group]:
                    actual[c.stratum][split] += 1
    for group in pending:
        assignment[group] = "train"
    for group in groups:
        if group not in assignment:
            number = int(digest([seed, "corpus-split", group])[:12], 16) / 16**12
            assignment[group] = "train" if number < 0.7 else "validation" if number < 0.85 else "test"
    if any(assignment[membership[q]] != "train" for q in development_ids):
        raise ValueError("A development source leaked into evaluation")
    return assignment, {
        "requestedRatios": {"train": 0.7, "validation": 0.15, "test": 0.15},
        "heldOutPerStratumTargets": {f"{p}-{l}": value for (p, l), value in target.items()},
        "protectedDevelopmentSources": len(development_ids),
        "protectedDevelopmentGroups": len(protected),
        "policy": "Previously developed source groups are train-only. Validation/test use whole source groups. Actual counts take precedence over approximate ratios.",
    }


def descendant_split(parent_question_ids: list[str], split_manifest: dict) -> str:
    rows = {item["questionId"]: item for item in split_manifest["questions"]}
    assignments = {key: item["split"] for key, item in rows.items()}
    if not parent_question_ids or any(q not in assignments for q in parent_question_ids):
        raise ValueError("Every synthetic parent must exist in the frozen source manifest")
    if any(rows[q].get("samplingExclusions") for q in parent_question_ids):
        raise ValueError("Synthetic parents include an excluded source question")
    splits = {assignments[q] for q in parent_question_ids}
    if len(splits) != 1:
        raise ValueError("Synthetic parents cross frozen dataset splits")
    return splits.pop()


def coverage(candidates: list[Candidate], selected: list[Candidate], membership: dict[str, str], assignment: dict[str, str], quotas: dict, split_policy: dict, edges: list[dict]) -> dict:
    def table(key) -> list[dict]:
        corpus = Counter(key(c) for c in candidates)
        pilot = Counter(key(c) for c in selected)
        split_counts = {s: Counter(key(c) for c in selected if assignment[membership[c.id]] == s) for s in SPLITS}
        return [{"label": label, "corpus": corpus[label], "pilot": pilot[label], **{s: split_counts[s][label] for s in SPLITS}} for label in sorted(corpus)]
    theme_rows = [{"label": f"{t}: {name}", "corpus": sum(t in c.themes for c in candidates), "pilot": sum(t in c.themes for c in selected)} for t, name in THEMES.items()]
    families = table(lambda c: c.family)
    return {
        "schemaVersion": "pilot-coverage/0.1.0",
        "corpusQuestions": len(candidates),
        "eligibleSourceQuestions": sum(not c.excluded for c in candidates),
        "pilotQuestions": len(selected),
        "pilotIndependentSourceGroups": len({membership[c.id] for c in selected}),
        "corpusSourceGroups": len(set(membership.values())),
        "checkedCompletePackages": sum(bool(c.checked) for c in selected),
        "sourceOnlyQuestions": sum(not c.checked for c in selected),
        "trainingReadyPackages": 0,
        "selectedSourcesNeedingExtractionReview": sum(bool(c.issues) for c in selected),
        "noVisualQuestions": sum(c.family == "no_visual" for c in selected),
        "rendererGapQuestions": sum(c.family not in SUPPORTED | {"no_visual"} for c in selected),
        "pilotSplits": dict(sorted(Counter(assignment[membership[c.id]] for c in selected).items())),
        "corpusSplits": dict(sorted(Counter(assignment[membership[c.id]] for c in candidates).items())),
        "stratumQuotas": quotas,
        "byPaperLevel": table(lambda c: "-".join(c.stratum)),
        "byRepresentation": families,
        "bySession": table(lambda c: f"{c.source['year']} {c.source['session']}"),
        "byExtractionMethod": table(lambda c: c.question["extraction"]["method"]),
        "provisionalThemes": theme_rows,
        "provisionalSkills": [{"label": skill, "pilot": sum(skill in c.skills for c in selected)} for skill in ("quantitative", "conceptual", "graphical", "unclassified")],
        "metadataStatus": "Theme and skill tags are keyword-based review aids. No reviewed syllabus, topic, difficulty or skill metadata exists in the mining records. Multi-label counts overlap.",
        "splitPolicy": split_policy,
        "leakageAudit": {"crossSplitSourceGroups": 0, "developmentSourcesOutsideTrain": 0, "groupingEvidenceEdges": len(edges), "nearDuplicateEdges": sum(e["reason"].startswith("near-duplicate") for e in edges), "scope": "Canonical source/question, exact text, number-neutral text, shared context, reused SL/HL subparts and conservative lexical near-duplicate grouping. Semantic paraphrases still require review."},
        "remainingWork": [
            "Review full question text, options/subparts, sources and scheme targets for the pilot.",
            "Complete source-only questions as checked packages, including Cartesian examples.",
            "Confirm provisional themes, topic, skill and difficulty metadata.",
            "Review candidate duplicate groups before using held-out scores for claims.",
            "Record educational acceptance, source-use clearance and training metadata independently.",
            "Connect live generation and retain frozen source-group lineage for synthetic descendants.",
        ],
    }


def read_index(path: Path, key: str) -> dict[str, dict]:
    records = {}
    for number, line in enumerate(path.read_text().splitlines(), 1):
        if not line.strip():
            continue
        item = json.loads(line)
        if not isinstance(item, dict) or not isinstance(item.get(key), str) or item[key] in records:
            raise ValueError(f"Invalid or duplicate {key}: {path.name}:{number}")
        records[item[key]] = item
    return records


def load_inputs(source_root: Path, repository: Path) -> tuple[list[Candidate], dict, dict, dict]:
    mining = source_root / "dataset/_derived/paper-mining-v0.1"
    sources = read_index(mining / "sources.jsonl", "source_id")
    questions = read_index(mining / "questions.jsonl", "question_id")
    plans = read_index(mining / "visual-plans.jsonl", "question_id")
    assets = read_index(mining / "visual-assets.jsonl", "asset_id")
    hashes = {file: file_hash(mining / file) for file in ("sources.jsonl", "questions.jsonl", "visual-plans.jsonl", "visual-assets.jsonl")}
    for source in sources.values():
        path = (source_root / "dataset" / source["relative_path"]).resolve()
        path.relative_to((source_root / "dataset").resolve())
        if file_hash(path) != source["sha256"]:
            raise ValueError(f"Source PDF checksum changed: {source['source_id']}")
    for q in questions.values():
        source = sources[q["source_id"]]
        if source["role"] != "question_paper" or q["provenance"]["sha256"] != source["sha256"]:
            raise ValueError(f"Invalid question source: {q['question_id']}")
        if q["provenance"]["relative_path"] != source["relative_path"]:
            raise ValueError(f"Question path differs from source: {q['question_id']}")
        if not isinstance(q["text"]["normalized"], str):
            raise ValueError("Question text must be a string")
        scheme = q["markscheme_source_id"]
        if scheme and sources[scheme]["role"] != "markscheme":
            raise ValueError(f"Invalid mark-scheme source: {scheme}")
        first, last = q["provenance"]["page_start"], q["provenance"]["page_end"]
        if not (isinstance(first, int) and isinstance(last, int) and 1 <= first <= last <= source["profile"]["page_count"]):
            raise ValueError("Question PDF page bounds are invalid")
        for asset_id in q["visual_asset_ids"]:
            asset = assets[asset_id]
            if asset["source_id"] != q["source_id"] or asset["question_number"] != q["question_number"]:
                raise ValueError("Question/crop linkage mismatch")
    result = subprocess.run(["node", str(repository / "scripts/pilot-dataset/export-packages.cjs")], check=True, capture_output=True, text=True)
    inventory = json.loads(result.stdout)
    if inventory["schemaVersion"] != "pilot-package-inventory/0.1.0":
        raise ValueError("Unsupported checked package inventory")
    hashes["checkedPackageInventory"] = digest(inventory)
    return candidates_from_records(list(questions.values()), sources, plans, inventory), inventory, hashes, assets


def make_manifests(candidates: list[Candidate], inventory: dict, input_hashes: dict, size: int, seed: str) -> tuple[dict, dict, dict, list[dict]]:
    candidates = sorted(candidates, key=lambda c: c.id)
    membership, groups, edges = build_groups(candidates)
    development_ids = set(inventory["developmentQuestionIds"])
    selected, quotas = sample_candidates(candidates, membership, size, seed, development_ids)
    assignment, split_policy = assign_splits(candidates, selected, membership, groups, development_ids, seed)
    sampling_policy = {"stratumTargets": quotas, "rendererGapBudget": size // 5, "requiredCheckedPackageIds": sorted(p["packageId"] for p in inventory["packages"]), "freshEvaluationSourcesPerWorkingFamily": 2}
    fingerprint = digest({"version": VERSION, "inputHashes": input_hashes, "seed": seed, "size": size, "samplingPolicy": sampling_policy, "sourceGroups": groups, "groupSplits": assignment, "selectedQuestions": [c.id for c in selected]})
    selected_ids = {c.id for c in selected}
    rows = []
    for c in selected:
        source = c.source
        rows.append({
            "questionId": c.id, "groupId": membership[c.id], "split": assignment[membership[c.id]],
            "sourceId": source["source_id"], "canonicalSourceId": c.canonical_source,
            "questionLabel": f"{str(source['session']).title()} {source['year']} TZ{source.get('zone') or '?'} {c.stratum[1]} Paper {c.stratum[0]} Q{c.question['question_number']}",
            "paper": c.stratum[0], "level": c.stratum[1], "year": source["year"], "session": source["session"], "zone": source.get("zone"),
            "sourcePdf": "dataset/" + source["relative_path"], "sourceSha256": source["sha256"],
            "sourcePages": list(range(c.question["provenance"]["page_start"], c.question["provenance"]["page_end"] + 1)),
            "markschemeSourceId": c.question["markscheme_source_id"],
            "representation": c.family, "minedPrimaryFamily": c.plan["primary_family"] if c.plan else "no_visual",
            "representationOrigin": "checked-package-renderer" if c.checked else "unreviewed-mining-classification",
            "provisionalThemes": list(c.themes), "provisionalSkills": list(c.skills), "metadataStatus": "needs-human-classification",
            "checkedPackageId": c.checked["packageId"] if c.checked else None,
            "packageStatus": "physics-checked-awaiting-review" if c.checked else "source-only-awaiting-package-construction",
            "extractionReviewReasons": list(c.issues), "selectionReason": "existing-checked-package" if c.checked else "stratified-diversity-sample",
            "trainingEligibility": "blocked", "trainingBlockers": ["full package and educational review", "source-use clearance", "reviewed training metadata"],
        })
    sample = {"schemaVersion": VERSION, "pilotId": "pilot-" + fingerprint[:16], "inputFingerprint": fingerprint, "inputHashes": input_hashes, "seed": seed, "requestedSize": size, "samplingPolicy": sampling_policy, "questions": rows}
    split_manifest = {
        "schemaVersion": SPLIT_VERSION, "pilotId": sample["pilotId"], "inputFingerprint": fingerprint, "seed": seed, "policy": split_policy,
        "groups": [{"groupId": group, "split": assignment[group], "questionIds": members, "developmentExposed": any(q in development_ids for q in members)} for group, members in groups.items()],
        "questions": [{"questionId": c.id, "groupId": membership[c.id], "split": assignment[membership[c.id]], "selectedForPilot": c.id in selected_ids, "samplingExclusions": list(c.excluded)} for c in candidates],
        "syntheticLineageRule": "Every descendant inherits its parents' frozen split. Cross-split parent combinations and unknown parents are rejected.",
    }
    return sample, split_manifest, coverage(candidates, selected, membership, assignment, quotas, split_policy, edges), edges


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def publish(staging: Path, output: Path) -> Path | None:
    backup = None
    if output.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
        backup = output.with_name(output.name + ".backup-" + stamp)
        output.rename(backup)
    try:
        staging.rename(output)
    except BaseException:
        if backup:
            backup.rename(output)
        raise
    return backup


def main() -> None:
    parser = argparse.ArgumentParser(description="Sample a private source-backed pilot and freeze source-group splits.")
    repository = Path(__file__).resolve().parents[2]
    parser.add_argument("--source-root", type=Path, default=repository)
    parser.add_argument("--output", type=Path, default=repository / "dataset/_derived/pilot-dataset-v0.1")
    parser.add_argument("--size", type=int, default=100)
    parser.add_argument("--seed", default="ibphysiq-pilot-v1")
    parser.add_argument("--no-page-previews", action="store_true")
    args = parser.parse_args()
    if args.size < 1:
        parser.error("--size must be positive")
    output, source_root = args.output.resolve(), args.source_root.resolve()
    candidates, inventory, hashes, assets = load_inputs(source_root, repository)
    sample, splits, report, edges = make_manifests(candidates, inventory, hashes, args.size, args.seed)
    if (output / "split-manifest.json").exists():
        previous = json.loads((output / "split-manifest.json").read_text())
        if previous != splits:
            raise ValueError("Frozen split manifest differs. Use a new output directory for a different corpus, seed, size or policy.")
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=output.name + ".staging-", dir=output.parent))
    try:
        write_json(staging / "pilot-manifest.json", sample)
        write_json(staging / "split-manifest.json", splits)
        write_json(staging / "coverage.json", report)
        (staging / "grouping-evidence.jsonl").write_text("".join(json.dumps(edge, sort_keys=True) + "\n" for edge in edges))
        (staging / "pilot-questions.jsonl").write_text("".join(json.dumps(c.question, ensure_ascii=False) + "\n" for c in candidates if c.id in {q["questionId"] for q in sample["questions"]}))
        from report import build_browser_report
        build_browser_report(staging, source_root, sample, splits, report, candidates, inventory, assets, not args.no_page_previews)
        publish(staging, output)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    print(json.dumps({"pilotId": sample["pilotId"], "questions": report["pilotQuestions"], "independentGroups": report["pilotIndependentSourceGroups"], "splits": report["pilotSplits"], "checkedPackages": report["checkedCompletePackages"], "reviewPage": str(output / "index.html")}))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
