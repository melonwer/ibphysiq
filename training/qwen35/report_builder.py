"""Publication-grade Model Card & UCAS/Benchmark Report generator from measured JSON artifacts."""

from __future__ import annotations

from typing import Any


def _fmt_rate(val: Any) -> str:
    if isinstance(val, (int, float)):
        return f"{100.0 * float(val):.2f}%"
    return "—"


def _fmt_wilson(ci: dict[str, Any] | None) -> str:
    if not isinstance(ci, dict) or "rate" not in ci:
        return "—"
    rate = 100.0 * float(ci.get("rate", 0.0))
    lo = 100.0 * float(ci.get("lower95", 0.0))
    hi = 100.0 * float(ci.get("upper95", 0.0))
    succ = int(ci.get("successes", 0))
    tot = int(ci.get("total", 0))
    return f"{rate:.2f}% [{lo:.2f}%, {hi:.2f}%] ({succ}/{tot})"


def _fmt_delta_pp(new_val: Any, base_val: Any) -> str:
    if isinstance(new_val, (int, float)) and isinstance(base_val, (int, float)):
        diff = 100.0 * (float(new_val) - float(base_val))
        sign = "+" if diff >= 0 else ""
        return f"{sign}{diff:.2f} pp"
    return "—"


def _headline_row(label: str, report: dict[str, Any] | None) -> str:
    if not isinstance(report, dict):
        return f"| {label} | — | — | — | — | — |"
    ov = report.get("overall", {})
    n = ov.get("count", report.get("totalPrompts", 0))
    return (
        f"| {label} (N={n}) "
        f"| {_fmt_wilson(ov.get('step1SolverPass'))} "
        f"| {_fmt_wilson(ov.get('step2AuthorGatePass'))} "
        f"| {_fmt_wilson(ov.get('syllabusAlignment'))} "
        f"| {_fmt_wilson(ov.get('endToEndVerified'))} "
        f"| {_fmt_rate(report.get('headline', {}).get('conditionalStep2AuthorPassRate'))} |"
    )


def _stratified_table(strata_map: dict[str, Any] | None, col_header: str) -> list[str]:
    lines = [
        f"| {col_header} | N | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) |",
        "| --- | ---: | --- | --- | --- | --- |",
    ]
    if not isinstance(strata_map, dict) or not strata_map:
        lines.append("| (none) | 0 | — | — | — | — |")
        return lines
    for key in sorted(strata_map.keys()):
        b = strata_map[key]
        lines.append(
            f"| `{key}` | {b.get('count', 0)} "
            f"| {_fmt_wilson(b.get('step1SolverPass'))} "
            f"| {_fmt_wilson(b.get('step2AuthorGatePass'))} "
            f"| {_fmt_wilson(b.get('syllabusAlignment'))} "
            f"| {_fmt_wilson(b.get('endToEndVerified'))} |"
        )
    return lines


def build_model_card_markdown(summary: dict[str, Any]) -> str:
    rounds = summary.get("rounds", {})
    r0 = rounds.get("round0", {})
    r1 = rounds.get("round1", {})
    r2 = rounds.get("round2")
    r3 = rounds.get("round3")
    champ_round = summary.get("champion_selection", {}).get("selected_round", "unknown")
    r0_test_0 = r0.get("test_zero_retry", {})
    r0_test_1 = r0.get("test_one_retry", {})
    ch_test_0 = summary.get("final_champion", {}).get("test_zero_retry", {})
    ch_test_1 = summary.get("final_champion", {}).get("test_one_retry", {})
    novel_0 = summary.get("final_champion", {}).get("novel_1500_zero_retry", {})
    novel_1 = summary.get("final_champion", {}).get("novel_1500_one_retry", {})

    r0_e2e_0 = r0_test_0.get("headline", {}).get("endToEndVerifiedRate")
    ch_e2e_0 = ch_test_0.get("headline", {}).get("endToEndVerifiedRate")
    r0_e2e_1 = r0_test_1.get("headline", {}).get("endToEndVerifiedRate")
    ch_e2e_1 = ch_test_1.get("headline", {}).get("endToEndVerifiedRate")

    val_rows = [
        _headline_row("Round 0: Untuned Qwen/Qwen3.5-9B (0-Retry)", r0.get("val_zero_retry")),
        _headline_row("Round 0: Untuned Qwen/Qwen3.5-9B (1-Retry)", r0.get("val_one_retry")),
        _headline_row("Round 1: SFT Core — 0-Retry (r=32, 2,413 traces)", r1.get("val_zero_retry")),
        _headline_row("Round 1: SFT Core — 1-Retry (r=32, 2,413 traces)", r1.get("val_one_retry")),
    ]
    r2_name = "round2_warm_polish"
    r2_lr = 3.5e-5
    r2_steps = 90
    if isinstance(r2, dict):
        r2_name = str(r2.get("round", r2_name))
        r2_tm = r2.get("train_metrics") or {}
        if isinstance(r2_tm, dict):
            r2_lr = float(r2_tm.get("lr", r2_lr))
            r2_steps = int(r2_tm.get("steps_completed", r2_steps))
        if r2.get("val_zero_retry"):
            val_rows.append(
                _headline_row(f"Round 2: Warm-Start Polish ({r2_name}) — 0-Retry", r2.get("val_zero_retry"))
            )
        if r2.get("val_one_retry"):
            val_rows.append(
                _headline_row(f"Round 2: Warm-Start Polish ({r2_name}) — 1-Retry", r2.get("val_one_retry"))
            )
    if isinstance(r3, dict) and r3.get("val_zero_retry"):
        val_rows.append(
            _headline_row("Round 3: Solver RFT + DPO (beta=0.1)", r3.get("val_zero_retry"))
        )

    lines = [
        "---",
        "base_model: Qwen/Qwen3.5-9B",
        "library_name: peft",
        "license: apache-2.0",
        "language:",
        "  - en",
        "pipeline_tag: text-generation",
        "tags:",
        "  - physics",
        "  - education",
        "  - neuro-symbolic",
        "  - tool-use",
        "  - lora",
        "  - qwen3_5",
        "  - ib-physics",
        "  - a-level-physics",
        "  - ncuk-ify",
        "---",
        "",
        "# SixthPhysics-Qwen3.5-9B-LoRA (Neuro-Symbolic Pre-University Physics Author)",
        "",
        "## Overview",
        "",
        "**SixthPhysics-Qwen3.5-9B-LoRA** adapts `Qwen/Qwen3.5-9B` (`Qwen3_5ForConditionalGeneration`, vision tower frozen, `enable_thinking=False`) to author solver-verified examination questions inside the **SixthPhysics two-turn deterministic physics & SVG harness** (distilled from the **7,643-item** verified SixthPhysics static bank) across three pre-university physics specifications:",
        "",
        "1. **IB Physics (First Assessment 2025)** — SL & HL, Themes A–E (`g = 9.8 m s^-2`, strict exclusion of retired IB 2016 options/topics).",
        "2. **UK A-Level Physics (DfE / AQA 7408 core)** — AS (Year 12) & Full A-Level (Year 13) (`g = 9.81 m s^-2`).",
        "3. **NCUK International Foundation Year (IFY) Physics (`IFYPH005`)** — Semesters 1 & 2 (`g = 9.81 m s^-2`).",
        "",
        "## Neuro-Symbolic Architecture",
        "",
        "```mermaid",
        "flowchart LR",
        '    P["Syllabus + Domain + Concept Prompt"] --> S1["Qwen3.5-9B Turn 1 (propose_scenario)"]',
        '    S1 --> H["Deterministic TS Physics Solver + Student SVG Guard"]',
        '    H --> R["Verified Receipt (verifiedQuantities + formattedQuantities3sf)"]',
        '    R --> S2["Qwen3.5-9B Turn 2 (author_package)"]',
        '    S2 --> G["3-Sig-Fig Gate + 3-Syllabus Alignment Verifier"]',
        '    G --> Q["Verified MCQ / Multipart Question + SVG + Mark Scheme"]',
        "```",
        "",
        "## Headline Locked Held-Out & Out-of-Sample Results",
        "",
        f"Champion checkpoint (`{champ_round}`) was selected **strictly on held-out `val.jsonl` (`645` items)** prior to evaluating on locked `test.jsonl` (`586` items, SHA-256 `fd6888e53f0c98ccd0b5f792e1f6bf223f6067ef400b270dd2cb9463310b1252`, zero `familyGroupKey` overlap) and `Novel-1500` (`1,500` fresh out-of-sample prompts across IB 2025, UK A-Level, and NCUK IFY):",
        "",
        "| Split & Protocol | Step 1 Solver Pass (95% Wilson CI) | Step 2 Gate Pass (95% Wilson CI) | Syllabus Aligned (95% Wilson CI) | End-to-End Verified (95% Wilson CI) | Conditional Step 2 |",
        "| --- | --- | --- | --- | --- | ---: |",
        _headline_row("Untuned Qwen/Qwen3.5-9B — Locked Test 0-Retry", r0_test_0),
        _headline_row("Untuned Qwen/Qwen3.5-9B — Locked Test 1-Retry", r0_test_1),
        _headline_row(f"Champion ({champ_round}) — Locked Test 0-Retry", ch_test_0),
        _headline_row(f"Champion ({champ_round}) — Locked Test 1-Retry", ch_test_1),
        _headline_row(f"Champion ({champ_round}) — Novel-1500 0-Retry", novel_0),
        _headline_row(f"Champion ({champ_round}) — Novel-1500 1-Retry", novel_1),
        "",
        f"- **Locked `test.jsonl` End-to-End Solver-Verified jump (0-retry):** `{_fmt_rate(r0_e2e_0)}` -> `{_fmt_rate(ch_e2e_0)}` (`{_fmt_delta_pp(ch_e2e_0, r0_e2e_0)}`).",
        f"- **Locked `test.jsonl` End-to-End Solver-Verified jump (1-retry):** `{_fmt_rate(r0_e2e_1)}` -> `{_fmt_rate(ch_e2e_1)}` (`{_fmt_delta_pp(ch_e2e_1, r0_e2e_1)}`).",
        "",
        "## Multi-Round Progression on Held-Out `val.jsonl` (`N = 645`)",
        "",
        "| Round & Protocol (`val.jsonl`) | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |",
        "| --- | --- | --- | --- | --- | ---: |",
        *val_rows,
        "",
        "## Stratified Syllabus & Level Performance (`Novel-1500`, 1-Retry Closed-Loop)",
        "",
        *_stratified_table(novel_1.get("bySyllabusLevel"), "Syllabus :: Level"),
        "",
        "## Stratified Locked `test.jsonl` by Syllabus & Level (Champion, 1-Retry Closed-Loop)",
        "",
        *_stratified_table(ch_test_1.get("bySyllabusLevel"), "Syllabus :: Level"),
        "",
        "## Training Curriculum (Modal H100 `bfloat16`)",
        "",
        "- **Strict Assistant-Only Loss Masking:** `labels = -100` on all `system` (including code-derived domain tool schemas), `user`, and `tool` receipt tokens; sparse `lm_head` cross-entropy is computed exclusively over Step 1 and Step 2 assistant JSON spans up to `<|im_end|>`.",
        "- **Round 1 (`round1_sft_core`):** `bf16` LoRA (`r=32, alpha=64`), 3 epochs (`453` optimizer steps, final loss `0.0509`) on the initial `2,413`-trace `train` split.",
        f"- **Round 2 (`{r2_name}`):** Warm-started `bf16` LoRA (`lr={r2_lr:g}`, cosine schedule, `{r2_steps}` optimizer steps) directly from `round1_sft_core/adapter` on an error-targeted curriculum mix of `train_r2_expanded.jsonl` (`6,412` traces, upsampling Paper 2 structured items and weaker domains identified strictly on Round 1 `val.jsonl`, zero `val`/`test` leakage).",
        "",
        "## Usage (PEFT + Transformers)",
        "",
        "```python",
        "import torch",
        "from peft import PeftModel",
        "from transformers import AutoModelForImageTextToText, AutoTokenizer",
        "",
        'base_id = "Qwen/Qwen3.5-9B"',
        'adapter_dir = "dataset/qwen35-9b-runs/champion-adapter"',
        "",
        "tokenizer = AutoTokenizer.from_pretrained(base_id)",
        "base_model = AutoModelForImageTextToText.from_pretrained(",
        '    base_id, dtype=torch.bfloat16, device_map="auto"',
        ")",
        "model = PeftModel.from_pretrained(base_model, adapter_dir)",
        "model.eval()",
        "",
        "prompt = tokenizer.apply_chat_template(",
        "    messages, tokenize=False, add_generation_prompt=True, enable_thinking=False",
        ")",
        "```",
        "",
        "## Evaluation Boundaries & Limitations",
        "",
        "- Deterministic solver verification, 3-significant-figure numerical agreement, student SVG hidden-quantity non-leakage checks, and automated syllabus/gravity rule checks establish **mathematical, structural, and specification consistency**.",
        "- Automated gate verification does **not** substitute for human teacher sign-off on classroom pedagogy or third-party examination board endorsement.",
        "",
    ]
    return "\n".join(lines)


def build_ucas_benchmark_report_markdown(summary: dict[str, Any]) -> str:
    rounds = summary.get("rounds", {})
    r0 = rounds.get("round0", {})
    r1 = rounds.get("round1", {})
    r2 = rounds.get("round2")
    r3 = rounds.get("round3")
    champ_sel = summary.get("champion_selection", {})
    champ_round = champ_sel.get("selected_round", "unknown")
    final_ch = summary.get("final_champion", {})

    r0_test_0 = r0.get("test_zero_retry", {})
    r0_test_1 = r0.get("test_one_retry", {})
    r0_test_tf = r0.get("test_teacher_forced_step2", {})
    ch_test_0 = final_ch.get("test_zero_retry", {})
    ch_test_1 = final_ch.get("test_one_retry", {})
    ch_test_tf = final_ch.get("test_teacher_forced_step2", {})
    novel_0 = final_ch.get("novel_1500_zero_retry", {})
    novel_1 = final_ch.get("novel_1500_one_retry", {})

    r0_t0_e2e = _fmt_rate(r0_test_0.get("headline", {}).get("endToEndVerifiedRate"))
    r0_t1_e2e = _fmt_rate(r0_test_1.get("headline", {}).get("endToEndVerifiedRate"))
    ch_t0_e2e = _fmt_rate(ch_test_0.get("headline", {}).get("endToEndVerifiedRate"))
    ch_t1_e2e = _fmt_rate(ch_test_1.get("headline", {}).get("endToEndVerifiedRate"))
    ch_t0_syl = _fmt_rate(ch_test_0.get("headline", {}).get("syllabusAlignmentRate"))
    ch_t1_syl = _fmt_rate(ch_test_1.get("headline", {}).get("syllabusAlignmentRate"))
    nov_0_e2e = _fmt_rate(novel_0.get("headline", {}).get("endToEndVerifiedRate"))
    nov_1_e2e = _fmt_rate(novel_1.get("headline", {}).get("endToEndVerifiedRate"))
    nov_1_syl = _fmt_rate(novel_1.get("headline", {}).get("syllabusAlignmentRate"))

    div_test = ch_test_0.get("diversity", {})
    div_novel = novel_1.get("diversity", novel_0.get("diversity", {}))

    val_0_rows = [
        _headline_row("Round 0: Untuned Qwen/Qwen3.5-9B", r0.get("val_zero_retry")),
        _headline_row("Round 1: SFT Core (r=32, 2,413 traces)", r1.get("val_zero_retry")),
    ]
    val_1_rows = [
        _headline_row("Round 0 — 1-Retry Closed-Loop", r0.get("val_one_retry")),
        _headline_row("Round 1 — 1-Retry Closed-Loop", r1.get("val_one_retry")),
    ]
    val_tf_rows = [
        _headline_row("Round 0 — Teacher-Forced Step 2", r0.get("val_teacher_forced_step2")),
        _headline_row("Round 1 — Teacher-Forced Step 2", r1.get("val_teacher_forced_step2")),
    ]
    r2_name = str(r2.get("round", "round2_warm_polish")) if isinstance(r2, dict) else "round2_warm_polish"
    if isinstance(r2, dict) and r2.get("val_zero_retry"):
        val_0_rows.append(
            _headline_row(f"Round 2: Warm-Start Polish ({r2_name})", r2.get("val_zero_retry"))
        )
        val_1_rows.append(
            _headline_row(f"Round 2 ({r2_name}) — 1-Retry Closed-Loop", r2.get("val_one_retry"))
        )
        val_tf_rows.append(
            _headline_row(f"Round 2 ({r2_name}) — Teacher-Forced Step 2", r2.get("val_teacher_forced_step2"))
        )
    if isinstance(r3, dict) and r3.get("val_zero_retry"):
        val_0_rows.append(_headline_row("Round 3: Solver RFT + DPO", r3.get("val_zero_retry")))
        val_1_rows.append(_headline_row("Round 3 — 1-Retry Closed-Loop", r3.get("val_one_retry")))
        val_tf_rows.append(
            _headline_row("Round 3 — Teacher-Forced Step 2", r3.get("val_teacher_forced_step2"))
        )

    sel_note = champ_sel.get(
        "selection_rationale",
        f"Champion `{champ_round}` selected strictly on held-out `val.jsonl` (`N = 645`) using `(one_retry_e2e, zero_retry_e2e)` prior to locked `test.jsonl` promotion.",
    )

    test_table_rows = [
        _headline_row("Untuned Qwen/Qwen3.5-9B (0-Retry)", r0_test_0),
    ]
    if champ_round != "round1_sft_core" and isinstance(r1, dict) and r1.get("test_zero_retry"):
        test_table_rows.append(_headline_row("Round 1 round1_sft_core (0-Retry)", r1.get("test_zero_retry")))
    test_table_rows.append(_headline_row(f"Champion {champ_round} (0-Retry)", ch_test_0))
    test_table_rows.append(_headline_row("Untuned Qwen/Qwen3.5-9B (1-Retry)", r0_test_1))
    if champ_round != "round1_sft_core" and isinstance(r1, dict) and r1.get("test_one_retry"):
        test_table_rows.append(_headline_row("Round 1 round1_sft_core (1-Retry)", r1.get("test_one_retry")))
    test_table_rows.append(_headline_row(f"Champion {champ_round} (1-Retry)", ch_test_1))
    test_table_rows.append(_headline_row("Untuned Qwen/Qwen3.5-9B (Teacher-Forced Step 2)", r0_test_tf))
    if champ_round != "round1_sft_core" and isinstance(r1, dict) and r1.get("test_teacher_forced_step2"):
        test_table_rows.append(
            _headline_row("Round 1 round1_sft_core (Teacher-Forced Step 2)", r1.get("test_teacher_forced_step2"))
        )
    test_table_rows.append(_headline_row(f"Champion {champ_round} (Teacher-Forced Step 2)", ch_test_tf))

    novel_table_rows: list[str] = []
    if champ_round != "round1_sft_core" and isinstance(r1, dict) and r1.get("novel_1500_zero_retry"):
        novel_table_rows.append(
            _headline_row("Round 1 round1_sft_core — Novel-1500 (0-Retry)", r1.get("novel_1500_zero_retry"))
        )
        novel_table_rows.append(
            _headline_row("Round 1 round1_sft_core — Novel-1500 (1-Retry)", r1.get("novel_1500_one_retry"))
        )
    novel_table_rows.append(_headline_row(f"Champion {champ_round} — Novel-1500 (0-Retry)", novel_0))
    novel_table_rows.append(_headline_row(f"Champion {champ_round} — Novel-1500 (1-Retry)", novel_1))

    lines = [
        "# SixthPhysics Neuro-Symbolic `Qwen/Qwen3.5-9B` Distillation & Multi-Syllabus Benchmark Report",
        "",
        f"- **Generated (UTC):** `{summary.get('completed_at_utc', 'unknown')}`",
        f"- **Compute Hardware:** `{summary.get('gpu', {}).get('name', 'NVIDIA H100 80GB HBM3')}` (`{summary.get('gpu', {}).get('vram_gb', '79.17')} GiB` VRAM, Modal Cloud)",
        f"- **Base Model:** `{summary.get('base_model_id', 'Qwen/Qwen3.5-9B')}` (`bfloat16`, vision tower frozen, `enable_thinking=False`)",
        f"- **Verified Static Bank Size:** **`7,643` solver- & gate-verified items** (`6,412` `train` + `645` `val` + `586` locked `test`; `4,838` Paper 1 MCQs + `2,805` Paper 2 structured)",
        f"- **Selected Champion Checkpoint (strictly on `val.jsonl`):** `{champ_round}`",
        "",
        "## Executive Headline Summary",
        "",
        f"- **Locked Held-Out `test.jsonl` (`N = 586`, zero family-group contamination):** Fine-tuning `Qwen/Qwen3.5-9B` lifts **End-to-End Solver-Verified Pass Rate** from **`{r0_t0_e2e}` -> `{ch_t0_e2e}`** (0-retry) and **`{r0_t1_e2e}` -> `{ch_t1_e2e}`** (1-retry), with **`{ch_t0_syl}`** (0-retry) / **`{ch_t1_syl}`** (1-retry) **Syllabus Alignment Rate**.",
        f"- **Out-of-Sample `Novel-1500` Multi-Syllabus Sweep (`N = 1,500`: `500 IB 2025`, `500 UK A-Level`, `500 NCUK IFY`):** Achieves **`{nov_0_e2e}`** (0-retry) and **`{nov_1_e2e}`** (1-retry) **End-to-End Solver-Verified Pass Rate**, and **`{nov_1_syl}`** **Syllabus Alignment Rate** across all 23 topics, 78 subtopics, and 11 physics domains.",
        "",
        "## 1. Scientific Motivation & Neuro-Symbolic Architecture",
        "",
        "Standard open-weight language models frequently hallucinate intermediate algebra, violate syllabus-specific physical constants (mixing `g = 9.8 m s^-2` on IB Physics with `g = 9.81 m s^-2` on UK A-Level and NCUK IFY, or leaking retired IB 2016 topics into IB 2025 assessments), or produce MCQ distractors whose numerical values contradict the worked solution.",
        "",
        "**SixthPhysics** decouples problem framing and pedagogical authoring from exact physical computation via a two-turn deterministic harness:",
        "",
        "1. **Turn 1 (`propose_scenario`):** Given target syllabus metadata, physics domain, concept, paper format, difficulty, and seed, the model proposes a structured `scenarioSpec`, student-hidden target unknowns (`hiddenQuantities`), and a pre-solve `questionPlan`.",
        "2. **Deterministic Solver & Student-Safe SVG Guard (`solve-step1-batch.ts`):** Executes exact TypeScript domain solvers across all **11 domains** (`103` `scenarioSpec.kind` discriminators), renders deterministic SVG diagrams, enforces zero `hiddenQuantities` leakage in student figures, and returns `verifiedQuantities` + `formattedQuantities3sf`.",
        "3. **Turn 2 (`author_package`):** Conditioned on the solver receipt, the model authors a complete Paper 1 MCQ or Paper 2 structured multipart question verified by `evaluate-model-rollouts.ts` for 3-significant-figure numerical agreement, distractor uniqueness/rationales, exact mark-scheme balance, and 3-syllabus specification compliance.",
        "",
        "## 2. Dataset Split Integrity & Zero-Contamination Verification",
        "",
        "- **Family-Grouped `70/15/15` Split (`frozen-eval-manifest.json`):** Every `familyGroupKey` (`conceptId::templateArchetype` and all parametric seed variants) is locked to a single split (`lockHeldOut: true`, `zeroContaminationVerified: true`).",
        f"- **Round 1 Core Train Split (`train_r1_core.jsonl`):** `{summary.get('dataset_counts', {}).get('train_r1_core', 2413)}` traces (`116` family groups).",
        f"- **Expanded Train Split (`train_r2_expanded.jsonl`):** `{summary.get('dataset_counts', {}).get('train_r2_expanded', 6412)}` traces (`116` `train` family groups from the `7,643`-item bank; `0` held-out leakage verified programmatically).",
        f"- **Held-Out Validation Split (`val.jsonl`):** `{summary.get('dataset_counts', {}).get('val', 645)}` traces (`31` family groups, SHA-256 `{summary.get('dataset_sha256', {}).get('val', '')}`).",
        f"- **Locked Held-Out Test Split (`test.jsonl`):** `{summary.get('dataset_counts', {}).get('test', 586)}` traces (`28` family groups, SHA-256 `{summary.get('dataset_sha256', {}).get('test', '')}`).",
        f"- **Out-of-Sample `Novel-1500` Benchmark (`novel-1500-prompts.jsonl`):** `{summary.get('dataset_counts', {}).get('novel_1500', 1500)}` fresh stratified prompts (`500 IB 2025`, `500 UK A-Level`, `500 NCUK IFY`, disjoint seeds `90000001..90001500`).",
        "",
        "## 3. Multi-Round Ablation on Held-Out `val.jsonl` (`N = 645`)",
        "",
        "All models receive the identical code-derived compact domain tool schema in the system prompt (`zeroDatasetReadsVerified: true`) so Round 0 untuned `Qwen/Qwen3.5-9B` competes under identical tool-schema visibility.",
        "",
        "### 3.1 Zero-Retry Closed-Loop (`val.jsonl`)",
        "",
        "| Training Round | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |",
        "| --- | --- | --- | --- | --- | ---: |",
        *val_0_rows,
        "",
        "### 3.2 One-Retry Closed-Loop & Teacher-Forced Step 2 (`val.jsonl`)",
        "",
        "| Round & Evaluation Mode | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |",
        "| --- | --- | --- | --- | --- | ---: |",
        *val_1_rows,
        *val_tf_rows,
        "",
        f"- **Held-Out Validation Selection Decision:** {sel_note}",
        "",
        f"## 4. Locked Held-Out `test.jsonl` Evaluation (`N = 586`, Champion = `{champ_round}`)",
        "",
        "| Model & Mode | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |",
        "| --- | --- | --- | --- | --- | ---: |",
        *test_table_rows,
        "",
        "### 4.1 Locked `test.jsonl` Stratified by Syllabus & Level (Champion 0-Retry)",
        "",
        *_stratified_table(ch_test_0.get("bySyllabusLevel"), "Syllabus :: Level"),
        "",
        "### 4.2 Locked `test.jsonl` Stratified by Syllabus & Level (Champion 1-Retry)",
        "",
        *_stratified_table(ch_test_1.get("bySyllabusLevel"), "Syllabus :: Level"),
        "",
        "### 4.3 Locked `test.jsonl` Stratified by Physics Domain (Champion 0-Retry)",
        "",
        *_stratified_table(ch_test_0.get("byDomain"), "Physics Domain"),
        "",
        "### 4.4 Locked `test.jsonl` Stratified by Paper Format (Champion 0-Retry)",
        "",
        *_stratified_table(ch_test_0.get("byFormat"), "Paper Format"),
        "",
        f"## 5. Out-of-Sample `Novel-1500` Multi-Syllabus Benchmark (`N = 1,500`)",
        "",
        "| Protocol | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |",
        "| --- | --- | --- | --- | --- | ---: |",
        *novel_table_rows,
        "",
        "### 5.1 `Novel-1500` Stratified by Syllabus & Level (1-Retry Closed-Loop)",
        "",
        *_stratified_table(novel_1.get("bySyllabusLevel"), "Syllabus :: Level"),
        "",
        "### 5.2 `Novel-1500` Stratified by Physics Domain (1-Retry Closed-Loop)",
        "",
        *_stratified_table(novel_1.get("byDomain"), "Physics Domain"),
        "",
        "### 5.3 `Novel-1500` Stratified by Paper Format (1-Retry Closed-Loop)",
        "",
        *_stratified_table(novel_1.get("byFormat"), "Paper Format"),
        "",
        "## 6. Stem & Parametric Diversity Metrics",
        "",
        f"- **Locked `test.jsonl` (Champion 0-Retry):** Unique stem fingerprint ratio = `{_fmt_rate(div_test.get('uniqueFingerprintRatio'))}`, mean pairwise 3-gram Jaccard distance = `{div_test.get('meanPairwise3GramJaccardDistance', '—')}`, unique parameter signature ratio = `{_fmt_rate(div_test.get('uniqueParameterSignatureRatio'))}`.",
        f"- **`Novel-1500` (Champion 1-Retry):** Unique stem fingerprint ratio = `{_fmt_rate(div_novel.get('uniqueFingerprintRatio'))}`, mean pairwise 3-gram Jaccard distance = `{div_novel.get('meanPairwise3GramJaccardDistance', '—')}`, unique parameter signature ratio = `{_fmt_rate(div_novel.get('uniqueParameterSignatureRatio'))}`.",
        "",
        "## 7. Residual Failure Analysis & Scope Boundaries",
        "",
        f"- **Locked `test.jsonl` Step 1 failure stages (0-retry):** `{ch_test_0.get('failureBreakdown', {}).get('step1ByStage', {})}`",
        f"- **Locked `test.jsonl` Step 2 gate issues (0-retry):** `{ch_test_0.get('failureBreakdown', {}).get('gateIssuesByCode', {})}`",
        f"- **Locked `test.jsonl` Syllabus alignment issues (0-retry):** `{ch_test_0.get('failureBreakdown', {}).get('syllabusIssuesByCode', {})}`",
        f"- **`Novel-1500` residual Step 2 gate issues (1-retry):** `{novel_1.get('failureBreakdown', {}).get('gateIssuesByCode', {})}`",
        "- **Scope & Educational Boundaries:** All metrics above are produced by deterministic physics solvers, 3-significant-figure tolerance gates, SVG non-leakage guards, and automated 3-syllabus specification checks. They establish mathematical, structural, and syllabus-rule consistency, not human classroom sign-off or examination board endorsement.",
        "",
        "## 8. Ready-to-Use Summary Drafts (UCAS CS Personal Statement & Hugging Face)",
        "",
        "1. **UCAS Personal Statement — Concise Neuro-Symbolic Engineering Draft:**",
        f'   > "To eliminate arithmetic hallucination in physics assessment generation, I built SixthPhysics—a deterministic TypeScript solver and SVG diagram harness covering 11 physics domains across IB, UK A-Level, and NCUK IFY (`7,643` verified items)—and distilled its tool-interaction traces via assistant-masked LoRA fine-tuning into `Qwen/Qwen3.5-9B`, raising held-out end-to-end solver-verified accuracy from `{r0_t0_e2e}` (`{r0_t1_e2e}` with 1 retry) to `{ch_t0_e2e}` (`{ch_t1_e2e}` with 1 retry) on a contamination-free family-grouped test split (`N = 586`)."',
        "",
        "2. **UCAS Personal Statement — Out-of-Sample Generalisation & Verification Draft:**",
        f'   > "Rather than trusting free-form LLM answers, I coupled `Qwen/Qwen3.5-9B` to a formal verification gate checking 3-significant-figure solver agreement, non-leaking SVG figures, and syllabus-specific constraints (`g = 9.8` vs `9.81 m s^-2`); across `1,500` fresh out-of-sample IB, A-Level, and NCUK prompts, the distilled model achieved `{nov_1_e2e}` end-to-end verified generation and `{nov_1_syl}` syllabus alignment."',
        "",
        "3. **Hugging Face Repository / Project Summary Draft:**",
        f'   > "SixthPhysics-Qwen3.5-9B-LoRA is a neuro-symbolic physics question generator trained via assistant-masked LoRA curriculum fine-tuning on deterministic harness traces from the `7,643`-item SixthPhysics bank. Evaluated on `586` locked family-disjoint test prompts and `1,500` novel multi-syllabus prompts (IB 2025, UK A-Level, NCUK IFY), it improves closed-loop solver-verified pass rates from `{r0_t0_e2e}`/`{r0_t1_e2e}` untuned to `{ch_t0_e2e}`/`{ch_t1_e2e}` (0/1-retry) on held-out test and `{nov_0_e2e}`/`{nov_1_e2e}` on Novel-1500."',
        "",
    ]
    return "\n".join(lines)
