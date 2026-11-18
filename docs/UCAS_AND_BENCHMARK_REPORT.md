# SixthPhysics Neuro-Symbolic `Qwen/Qwen3.5-9B` Distillation & Multi-Syllabus Benchmark Report

- **Generated & Independently Audited (UTC):** `2026-11-18` (Modal H100 completion `2026-11-18T21:28:25Z`, independent local TypeScript re-scoring & contamination audit verified `22/22` exact match)
- **Compute Hardware:** `NVIDIA H100 80GB HBM3` (`79.17 GiB` VRAM, Modal Cloud; `0` active Modal apps/containers post-run; local workstation in `uni-battery`/iGPU mode, adapter safetensors verified on CPU)
- **Base Model:** `Qwen/Qwen3.5-9B` (`bfloat16`, vision tower frozen, `enable_thinking=False`, LoRA `r=32, alpha=64`, `58,195,968` trainable params = `0.6147%`)
- **Verified Static Bank Size:** **`7,643` solver- & gate-verified items** (`4,838` Paper 1 MCQs + `2,805` Paper 2 structured; syllabus coverage: **IB Physics 2025: `6,448`**, **UK A-Level Physics: `6,604`**, **NCUK IFY Physics: `6,193`**; `6,412` `train` + `645` `val` + `586` locked `test`, `zeroContaminationVerified: true`)
- **Selected Champion Checkpoint (strictly on `val.jsonl`):** `round1_sft_core` (`dataset/qwen35-9b-runs/champion-adapter/`)
- **Live Public Releases:** [Live Practice App (`sixthphysics.github.io`)](https://sixthphysics.github.io) · [Source Code (`sixthphysics/sixthphysics`)](https://github.com/sixthphysics/sixthphysics) · [HF Model (`d4ydy/sixthphysics-qwen3.5-9b-lora`)](https://huggingface.co/d4ydy/sixthphysics-qwen3.5-9b-lora) · [HF Dataset (`d4ydy/sixthphysics-bench-and-bank`)](https://huggingface.co/datasets/d4ydy/sixthphysics-bench-and-bank)

## Executive Headline Summary

| Benchmark & Protocol | Untuned `Qwen/Qwen3.5-9B` E2E | Champion `round1_sft_core` E2E (95% CI) | Champion Syllabus Alignment (95% CI) | Gain vs Untuned |
| --- | ---: | --- | --- | ---: |
| **Locked `test.jsonl` — 0-Retry (`N = 586`)** | `0.00%` (`0/586`) | **`64.51%`** `[60.55%, 68.27%]` (`378/586`) | **`78.50%`** `[74.99%, 81.63%]` (`460/586`) | **`+64.51 pp`** |
| **Locked `test.jsonl` — 1-Retry (`N = 586`)** | `0.34%` (`2/586`) | **`75.60%`** `[71.96%, 78.90%]` (`443/586`) | **`87.03%`** `[84.07%, 89.51%]` (`510/586`) | **`+75.26 pp`** |
| **Locked `test.jsonl` — Teacher-Forced Step 2 (`N = 586`)** | `0.68%` (`4/586`) | **`90.61%`** `[87.98%, 92.72%]` (`531/586`) | **`99.32%`** `[98.26%, 99.73%]` (`582/586`) | **`+89.93 pp`** |
| **`Novel-1500` Overall — 0-Retry (`N = 1,500`)** | — | **`67.53%`** `[65.12%, 69.86%]` (`1,013/1,500`) | **`84.13%`** `[82.20%, 85.89%]` (`1,262/1,500`) | — |
| **`Novel-1500` Overall — 1-Retry (`N = 1,500`)** | — | **`78.40%`** `[76.25%, 80.41%]` (`1,176/1,500`) | **`91.07%`** `[89.52%, 92.41%]` (`1,366/1,500`) | — |

- **Locked Held-Out `test.jsonl` (`N = 586`, `28` unseen family groups, zero contamination):** Assistant-masked LoRA fine-tuning lifts **End-to-End Solver-Verified Pass Rate** from **`0.00%` -> `64.51%`** (0-retry) and **`0.34%` -> `75.60%`** (1-retry), while raising **Syllabus Alignment Rate** from **`2.73%` -> `78.50%`** (0-retry) and **`4.95%` -> `87.03%`** (1-retry). Because the evaluator conservatively marks `syllabusAligned = false` whenever Step 1 fails validation, **`100.00%`** of Step-1-solved locked test items (`460/460` 0-retry; `510/510` 1-retry) satisfied every syllabus, gravity-convention, and exclusion check with **`0` violations**.
- **Out-of-Sample `Novel-1500` Multi-Syllabus Sweep (`N = 1,500`: `500` IB 2025, `500` UK A-Level, `500` NCUK IFY):** Achieves **`67.53%`** (0-retry) and **`78.40%`** (1-retry, `1,176/1,500` verified bank candidates) **End-to-End Solver-Verified Pass Rate**, and **`84.13%`** (0-retry) / **`91.07%`** (1-retry; `1,366/1,368` = `99.85%` of solved scenarios) **Syllabus Alignment Rate** across all 23 syllabus topics, 78 subtopics, and 11 physics domains:
  - **IB Physics 2025 (`500`):** `69.00%` (0-retry) / **`80.60%`** (1-retry E2E) · **`93.00%`** Syllabus Alignment (1-retry)
  - **UK A-Level Physics (`500`):** `69.80%` (0-retry) / **`81.00%`** (1-retry E2E) · **`90.00%`** Syllabus Alignment (1-retry)
  - **NCUK IFY Physics (`500`):** `63.80%` (0-retry) / **`73.60%`** (1-retry E2E) · **`90.20%`** Syllabus Alignment (1-retry)

## 1. Scientific Motivation & Neuro-Symbolic Architecture

Standard open-weight language models frequently hallucinate intermediate algebra, violate syllabus-specific physical constants (mixing `g = 9.8 m s^-2` on IB Physics with `g = 9.81 m s^-2` on UK A-Level and NCUK IFY, or leaking retired IB 2016 options into IB 2025 assessments), or produce MCQ distractors whose numerical values contradict the worked solution.

**SixthPhysics** decouples problem framing and pedagogical authoring from exact physical computation via a two-turn deterministic harness:

1. **Turn 1 (`propose_scenario`):** Given target syllabus metadata, physics domain, concept, paper format, difficulty, and seed, the model proposes a structured `scenarioSpec`, student-hidden target unknowns (`hiddenQuantities`), and a pre-solve `questionPlan`.
2. **Deterministic Solver & Student-Safe SVG Guard (`scripts/benchmark/solve-step1-batch.ts`):** Executes exact TypeScript domain solvers across all **11 domains** (`103` `scenarioSpec.kind` discriminators), renders deterministic SVG diagrams, enforces zero `hiddenQuantities` leakage in student figures, and returns `verifiedQuantities` + `formattedQuantities3sf`.
3. **Turn 2 (`author_package`):** Conditioned on the solver receipt, the model authors a complete Paper 1 MCQ or Paper 2 structured multipart question verified by `scripts/benchmark/evaluate-model-rollouts.ts` for 3-significant-figure numerical agreement, distractor uniqueness/rationales, exact mark-scheme balance, and 3-syllabus specification compliance.

## 2. Dataset Split Integrity & Zero-Contamination Verification

- **Family-Grouped Split (`frozen-eval-manifest.json`, SHA-256 `0a0d1bc071c8250107864a4dc7db44575c4d8e5f1c56978ade15b64f124c4c67`):** Every `familyGroupKey` (`conceptId::templateArchetype` and all parametric seed variants) is locked to a single split (`lockHeldOut: true`, `zeroContaminationVerified: true`, `175` total groups: `116` train / `31` val / `28` test).
- **Round 1 Core Train Split (`train-v1-2413.jsonl`, SHA-256 `4743e68e...`):** `2,413` traces (`116` family groups) — used to train the promoted `round1_sft_core` champion (`3` epochs, `453` steps, `lr=2e-4`, loss `0.6618 -> 0.0509`).
- **Expanded Train Split (`train.jsonl`, SHA-256 `5381b650...`):** `6,412` traces (`116` `train`-only family groups from the `7,643`-item bank) — sampled (`1,600`-trace error-targeted mix, `90.0%` fresh unseen traces, `960` seen over `60` steps) for the Round 2 warm-start ablation.
- **Held-Out Validation Split (`val.jsonl`):** `645` traces (`31` family groups, SHA-256 `a094cab46b48ea1c08300ed172fc13d8660a0a1cc5fe1021e273552d1ac6c846`).
- **Locked Held-Out Test Split (`test.jsonl`):** `586` traces (`28` family groups, SHA-256 `fd6888e53f0c98ccd0b5f792e1f6bf223f6067ef400b270dd2cb9463310b1252`).
- **Out-of-Sample `Novel-1500` Benchmark (`novel-1500-prompts.jsonl`, SHA-256 `1c413988...`):** `1,500` fresh stratified prompts (`500 IB 2025`, `500 UK A-Level`, `500 NCUK IFY`, disjoint seeds `90000001..90001500`).
- **Independent Contamination Audit Result:** **`0` overlap** on `itemId`, `traceId`, and `familyGroupKey` across every pair (`train_v1 vs val`, `train_v1 vs test`, `train_v2 vs val`, `train_v2 vs test`, `val vs test`, `novel vs train_v2/val/test`).

## 3. Multi-Round Ablation on Held-Out `val.jsonl` (`N = 645`)

All models receive the identical code-derived compact domain tool schema in the system prompt (`zeroDatasetReadsVerified: true`) so Round 0 untuned `Qwen/Qwen3.5-9B` competes under identical tool-schema visibility.

### 3.1 Zero-Retry Closed-Loop (`val.jsonl`)

| Training Round | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |
| --- | --- | --- | --- | --- | ---: |
| Round 0: Untuned `Qwen/Qwen3.5-9B` (N=645) | 27.75% [24.44%, 31.33%] (179/645) | 1.40% [0.74%, 2.63%] (9/645) | 11.16% [8.96%, 13.83%] (72/645) | 0.00% [0.00%, 0.59%] (0/645) | 5.03% |
| Round 1: SFT Core (`r=32`, 2,413 traces) (N=645) | 94.57% [92.55%, 96.07%] (610/645) | 69.92% [66.27%, 73.34%] (451/645) | 94.26% [92.19%, 95.81%] (608/645) | 69.92% [66.27%, 73.34%] (451/645) | 73.93% |
| Round 2: Warm-Start Polish (`60` steps, `lr=3.5e-5`) (N=645) | 94.42% [92.37%, 95.94%] (609/645) | 74.11% [70.59%, 77.34%] (478/645) | 94.42% [92.37%, 95.94%] (609/645) | 74.11% [70.59%, 77.34%] (478/645) | 78.49% |

### 3.2 One-Retry Closed-Loop & Teacher-Forced Step 2 (`val.jsonl`)

| Round & Evaluation Mode | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |
| --- | --- | --- | --- | --- | ---: |
| Round 0 — 1-Retry Closed-Loop (N=645) | 35.19% [31.61%, 38.96%] (227/645) | 7.60% [5.79%, 9.90%] (49/645) | 10.70% [8.54%, 13.32%] (69/645) | 1.71% [0.95%, 3.03%] (11/645) | 21.59% |
| **Round 1 (`round1_sft_core`) — 1-Retry Closed-Loop (N=645)** | **95.81%** [93.98%, 97.11%] (618/645) | **80.16%** [76.90%, 83.05%] (517/645) | **95.50%** [93.62%, 96.85%] (616/645) | **80.16%** [76.90%, 83.05%] (517/645) | **83.66%** |
| Round 2 (`round2_warm_polish`) — 1-Retry Closed-Loop (N=645) | 95.66% [93.80%, 96.98%] (617/645) | 79.69% [76.41%, 82.61%] (514/645) | 95.50% [93.62%, 96.85%] (616/645) | 79.69% [76.41%, 82.61%] (514/645) | 83.31% |
| Round 0 — Teacher-Forced Step 2 (N=645) | 100.00% [99.41%, 100.00%] (645/645) | 12.87% [10.50%, 15.67%] (83/645) | 50.08% [46.23%, 53.92%] (323/645) | 0.78% [0.33%, 1.80%] (5/645) | 12.87% |
| Round 1 (`round1_sft_core`) — Teacher-Forced Step 2 (N=645) | 100.00% [99.41%, 100.00%] (645/645) | 88.22% [85.50%, 90.48%] (569/645) | 99.38% [98.42%, 99.76%] (641/645) | 87.60% [84.83%, 89.92%] (565/645) | 88.22% |
| Round 2 (`round2_warm_polish`) — Teacher-Forced Step 2 (N=645) | 100.00% [99.41%, 100.00%] (645/645) | 89.61% [87.02%, 91.74%] (578/645) | 99.53% [98.64%, 99.84%] (642/645) | 89.46% [86.85%, 91.60%] (577/645) | 89.61% |

### 3.3 Round 1 vs Round 2 Format Trade-Off & Selection Discipline

| Format & Retry Mode (`val.jsonl`) | Round 1 (`round1_sft_core`) E2E (95% CI) | Round 2 (`round2_warm_polish`) E2E (95% CI) | Delta |
| --- | --- | --- | ---: |
| Paper 1 MCQ (`N = 427`) — 0-Retry | 79.16% [75.05%, 82.74%] (338/427) | 80.80% [76.79%, 84.25%] (345/427) | `+1.64 pp` |
| Paper 1 MCQ (`N = 427`) — 1-Retry | **90.63%** [87.49%, 93.05%] (387/427) | 88.29% [84.89%, 91.00%] (377/427) | `-2.34 pp` |
| Paper 2 Structured (`N = 218`) — 0-Retry | 51.83% [45.23%, 58.38%] (113/218) | **61.01%** [54.40%, 67.24%] (133/218) | **`+9.18 pp`** |
| Paper 2 Structured (`N = 218`) — 1-Retry | 59.63% [53.01%, 65.92%] (130/218) | **62.84%** [56.26%, 68.98%] (137/218) | `+3.21 pp` |

- **Held-Out Validation Selection Decision:** Upsampling Paper 2 structured items (`61%` of the Round 2 curriculum) delivered a strong `+9.18 pp` single-shot gain on structured multipart authoring and `+4.19 pp` overall 0-retry E2E (`69.92%` -> `74.11%`), but slightly reduced 1-retry MCQ recovery (`-2.34 pp`), leaving overall 1-retry E2E at `79.69%` vs Round 1's `80.16%`. Under the pre-registered strict `(val_one_retry_e2e, val_zero_retry_e2e)` criterion, `round1_sft_core` retained `champion-adapter/` without peeking at `test.jsonl`. A planned Round 3 online RFT/DPO stage was deferred to stay safely within Damien's Modal compute budget.

## 4. Locked Held-Out `test.jsonl` Evaluation (`N = 586`, Champion = `round1_sft_core`)

| Model & Mode | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |
| --- | --- | --- | --- | --- | ---: |
| Untuned `Qwen/Qwen3.5-9B` (0-Retry) (N=586) | 13.82% [11.26%, 16.85%] (81/586) | 3.92% [2.63%, 5.82%] (23/586) | 2.73% [1.69%, 4.39%] (16/586) | 0.00% [0.00%, 0.65%] (0/586) | 28.40% |
| **Champion `round1_sft_core` (0-Retry) (N=586)** | **78.50%** [74.99%, 81.63%] (460/586) | **64.51%** [60.55%, 68.27%] (378/586) | **78.50%** [74.99%, 81.63%] (460/586) | **64.51%** [60.55%, 68.27%] (378/586) | **82.17%** |
| Untuned `Qwen/Qwen3.5-9B` (1-Retry) (N=586) | 17.92% [15.03%, 21.23%] (105/586) | 4.95% [3.47%, 7.02%] (29/586) | 4.95% [3.47%, 7.02%] (29/586) | 0.34% [0.09%, 1.24%] (2/586) | 27.62% |
| **Champion `round1_sft_core` (1-Retry) (N=586)** | **87.03%** [84.07%, 89.51%] (510/586) | **75.60%** [71.96%, 78.90%] (443/586) | **87.03%** [84.07%, 89.51%] (510/586) | **75.60%** [71.96%, 78.90%] (443/586) | **86.86%** |
| Untuned `Qwen/Qwen3.5-9B` (Teacher-Forced Step 2) (N=586) | 100.00% [99.35%, 100.00%] (586/586) | 12.12% [9.72%, 15.01%] (71/586) | 59.21% [55.19%, 63.12%] (347/586) | 0.68% [0.27%, 1.74%] (4/586) | 12.12% |
| **Champion `round1_sft_core` (Teacher-Forced Step 2) (N=586)** | **100.00%** [99.35%, 100.00%] (586/586) | **90.79%** [88.17%, 92.87%] (532/586) | **99.32%** [98.26%, 99.73%] (582/586) | **90.61%** [87.98%, 92.72%] (531/586) | **90.79%** |

### 4.1 Locked `test.jsonl` Top-Level 3-Syllabus Summary (Champion 0-Retry & 1-Retry)

> Multi-syllabus items carry tags for every compatible syllabus (`IB: 515`, `UK A-Level: 494`, `NCUK IFY: 503` tagged occurrences across `586` unique items).

| Syllabus (Mode) | N | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |
| --- | ---: | --- | --- | --- | --- | ---: |
| **IB Physics 2025** (0-Retry) | 515 | 76.89% [73.06%, 80.33%] (396/515) | 62.14% [57.87%, 66.22%] (320/515) | 76.89% [73.06%, 80.33%] (396/515) | 62.14% [57.87%, 66.22%] (320/515) | 80.81% |
| **UK A-Level Physics** (0-Retry) | 494 | 78.14% [74.28%, 81.56%] (386/494) | 63.16% [58.82%, 67.29%] (312/494) | 78.14% [74.28%, 81.56%] (386/494) | 63.16% [58.82%, 67.29%] (312/494) | 80.83% |
| **NCUK IFY Physics** (0-Retry) | 503 | 76.34% [72.44%, 79.85%] (384/503) | 62.03% [57.71%, 66.16%] (312/503) | 76.34% [72.44%, 79.85%] (384/503) | 62.03% [57.71%, 66.16%] (312/503) | 81.25% |
| **IB Physics 2025** (1-Retry) | 515 | 86.60% [83.39%, 89.27%] (446/515) | 74.56% [70.63%, 78.13%] (384/515) | 86.60% [83.39%, 89.27%] (446/515) | 74.56% [70.63%, 78.13%] (384/515) | 86.10% |
| **UK A-Level Physics** (1-Retry) | 494 | 85.02% [81.60%, 87.90%] (420/494) | 72.27% [68.16%, 76.03%] (357/494) | 85.02% [81.60%, 87.90%] (420/494) | 72.27% [68.16%, 76.03%] (357/494) | 85.00% |
| **NCUK IFY Physics** (1-Retry) | 503 | 84.89% [81.50%, 87.76%] (427/503) | 72.56% [68.51%, 76.28%] (365/503) | 84.89% [81.50%, 87.76%] (427/503) | 72.56% [68.51%, 76.28%] (365/503) | 85.48% |

### 4.2 Locked `test.jsonl` Stratified by Syllabus & Level (Champion 0-Retry & 1-Retry)

| Syllabus :: Level | N | 0-Retry E2E (95% CI) | 1-Retry Step 1 Pass (95% CI) | 1-Retry Syllabus Aligned (95% CI) | 1-Retry E2E (95% CI) |
| --- | ---: | --- | --- | --- | --- |
| `alevel:Y12` | 194 | 53.09% [46.08%, 59.99%] (103/194) | 77.32% [70.93%, 82.65%] (150/194) | 77.32% [70.93%, 82.65%] (150/194) | 65.46% [58.53%, 71.80%] (127/194) |
| `alevel:Y13` | 300 | 69.67% [64.24%, 74.59%] (209/300) | 90.00% [86.08%, 92.91%] (270/300) | 90.00% [86.08%, 92.91%] (270/300) | 76.67% [71.56%, 81.10%] (230/300) |
| `ib:HL` | 322 | 56.52% [51.06%, 61.83%] (182/322) | 89.75% [85.96%, 92.61%] (289/322) | 89.75% [85.96%, 92.61%] (289/322) | 74.53% [69.51%, 78.98%] (240/322) |
| `ib:SL` | 193 | 71.50% [64.76%, 77.40%] (138/193) | 81.35% [75.26%, 86.21%] (157/193) | 81.35% [75.26%, 86.21%] (157/193) | 74.61% [68.03%, 80.23%] (144/193) |
| `ncuk:IFY` | 192 | 69.79% [62.96%, 75.85%] (134/192) | 84.90% [79.15%, 89.27%] (163/192) | 84.90% [79.15%, 89.27%] (163/192) | 76.04% [69.53%, 81.53%] (146/192) |
| `ncuk:IFY-S1` | 86 | 73.26% [63.06%, 81.47%] (63/86) | 91.86% [84.14%, 96.00%] (79/86) | 91.86% [84.14%, 96.00%] (79/86) | 79.07% [69.32%, 86.33%] (68/86) |
| `ncuk:IFY-S2` | 225 | 51.11% [44.62%, 57.57%] (115/225) | 82.22% [76.70%, 86.66%] (185/225) | 82.22% [76.70%, 86.66%] (185/225) | 67.11% [60.73%, 72.92%] (151/225) |

### 4.3 Locked `test.jsonl` Stratified by Physics Domain & Format (Champion 0-Retry & 1-Retry)

| Physics Domain / Format | N | 0-Retry Step 1 Pass (95% CI) | 0-Retry E2E (95% CI) | 1-Retry Step 1 Pass (95% CI) | 1-Retry E2E (95% CI) |
| --- | ---: | --- | --- | --- | --- |
| `circuits` | 65 | 100.00% [94.42%, 100.00%] (65/65) | 100.00% [94.42%, 100.00%] (65/65) | 100.00% [94.42%, 100.00%] (65/65) | 100.00% [94.42%, 100.00%] (65/65) |
| `em-induction` | 20 | 100.00% [83.89%, 100.00%] (20/20) | 100.00% [83.89%, 100.00%] (20/20) | 100.00% [83.89%, 100.00%] (20/20) | 100.00% [83.89%, 100.00%] (20/20) |
| `fields` | 84 | 100.00% [95.63%, 100.00%] (84/84) | 78.57% [68.65%, 85.99%] (66/84) | 100.00% [95.63%, 100.00%] (84/84) | 80.95% [71.28%, 87.92%] (68/84) |
| `graphs` | 40 | 100.00% [91.24%, 100.00%] (40/40) | 17.50% [8.75%, 31.95%] (7/40) | 100.00% [91.24%, 100.00%] (40/40) | 35.00% [22.13%, 50.49%] (14/40) |
| `grav-astro` | 63 | 66.67% [54.37%, 77.05%] (42/63) | 53.97% [41.79%, 65.69%] (34/63) | 100.00% [94.25%, 100.00%] (63/63) | 93.65% [84.78%, 97.50%] (59/63) |
| `mechanics` | 42 | 100.00% [91.62%, 100.00%] (42/42) | 88.10% [75.00%, 94.81%] (37/42) | 100.00% [91.62%, 100.00%] (42/42) | 90.48% [77.93%, 96.23%] (38/42) |
| `optics-shm` | 42 | 100.00% [91.62%, 100.00%] (42/42) | 83.33% [69.40%, 91.68%] (35/42) | 100.00% [91.62%, 100.00%] (42/42) | 83.33% [69.40%, 91.68%] (35/42) |
| `pure-calculation` | 42 | 100.00% [91.62%, 100.00%] (42/42) | 92.86% [80.99%, 97.54%] (39/42) | 100.00% [91.62%, 100.00%] (42/42) | 95.24% [84.21%, 98.68%] (40/42) |
| `quantum-nuclear` | 84 | 21.43% [14.01%, 31.35%] (18/84) | 15.48% [9.27%, 24.70%] (13/84) | 52.38% [41.83%, 62.72%] (44/84) | 42.86% [32.82%, 53.52%] (36/84) |
| `thermal` | 63 | 49.21% [37.27%, 61.24%] (31/63) | 46.03% [34.31%, 58.21%] (29/63) | 53.97% [41.79%, 65.69%] (34/63) | 53.97% [41.79%, 65.69%] (34/63) |
| `waves` | 41 | 82.93% [68.74%, 91.47%] (34/41) | 80.49% [65.99%, 89.77%] (33/41) | 82.93% [68.74%, 91.47%] (34/41) | 82.93% [68.74%, 91.47%] (34/41) |
| **Paper 1 MCQ (`mcq`)** | 375 | 79.47% [75.09%, 83.25%] (298/375) | 68.27% [63.39%, 72.77%] (256/375) | 88.27% [84.61%, 91.14%] (331/375) | **79.47%** [75.09%, 83.25%] (298/375) |
| **Paper 2 Structured (`structured`)** | 211 | 76.78% [70.63%, 81.97%] (162/211) | 57.82% [51.08%, 64.29%] (122/211) | 84.83% [79.37%, 89.05%] (179/211) | **68.72%** [62.18%, 74.59%] (145/211) |

## 5. Out-of-Sample `Novel-1500` Multi-Syllabus Benchmark (`N = 1,500`)

| Protocol | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |
| --- | --- | --- | --- | --- | ---: |
| Champion `round1_sft_core` — `Novel-1500` (0-Retry) (N=1500) | 84.13% [82.20%, 85.89%] (1262/1500) | 67.53% [65.12%, 69.86%] (1013/1500) | 84.13% [82.20%, 85.89%] (1262/1500) | 67.53% [65.12%, 69.86%] (1013/1500) | 80.27% |
| **Champion `round1_sft_core` — `Novel-1500` (1-Retry) (N=1500)** | **91.20%** [89.66%, 92.53%] (1368/1500) | **78.40%** [76.25%, 80.41%] (1176/1500) | **91.07%** [89.52%, 92.41%] (1366/1500) | **78.40%** [76.25%, 80.41%] (1176/1500) | **85.96%** |

### 5.1 `Novel-1500` Top-Level 3-Syllabus Summary (0-Retry & 1-Retry)

| Syllabus (Mode) | N | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) | Conditional Step 2 |
| --- | ---: | --- | --- | --- | --- | ---: |
| **IB Physics 2025** (0-Retry) | 500 | 83.60% [80.10%, 86.59%] (418/500) | 69.00% [64.81%, 72.90%] (345/500) | 83.60% [80.10%, 86.59%] (418/500) | 69.00% [64.81%, 72.90%] (345/500) | 82.54% |
| **UK A-Level Physics** (0-Retry) | 500 | 84.60% [81.17%, 87.50%] (423/500) | 69.80% [65.64%, 73.66%] (349/500) | 84.60% [81.17%, 87.50%] (423/500) | 69.80% [65.64%, 73.66%] (349/500) | 82.51% |
| **NCUK IFY Physics** (0-Retry) | 500 | 84.20% [80.74%, 87.13%] (421/500) | 63.80% [59.50%, 67.89%] (319/500) | 84.20% [80.74%, 87.13%] (421/500) | 63.80% [59.50%, 67.89%] (319/500) | 75.77% |
| **IB Physics 2025** (1-Retry) | 500 | 93.00% [90.42%, 94.92%] (465/500) | 80.60% [76.91%, 83.83%] (403/500) | 93.00% [90.42%, 94.92%] (465/500) | **80.60%** [76.91%, 83.83%] (403/500) | 86.67% |
| **UK A-Level Physics** (1-Retry) | 500 | 90.00% [87.06%, 92.33%] (450/500) | 81.00% [77.33%, 84.20%] (405/500) | 90.00% [87.06%, 92.33%] (450/500) | **81.00%** [77.33%, 84.20%] (405/500) | 90.00% |
| **NCUK IFY Physics** (1-Retry) | 500 | 90.60% [87.72%, 92.86%] (453/500) | 73.60% [69.57%, 77.27%] (368/500) | 90.20% [87.28%, 92.51%] (451/500) | **73.60%** [69.57%, 77.27%] (368/500) | 81.24% |

### 5.2 `Novel-1500` Stratified by Syllabus & Level (1-Retry Closed-Loop)

| Syllabus :: Level | N | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) |
| --- | ---: | --- | --- | --- | --- |
| `alevel:Y12` | 104 | 88.46% [80.91%, 93.27%] (92/104) | 79.81% [71.10%, 86.40%] (83/104) | 88.46% [80.91%, 93.27%] (92/104) | 79.81% [71.10%, 86.40%] (83/104) |
| `alevel:Y13` | 396 | 90.40% [87.10%, 92.93%] (358/396) | 81.31% [77.18%, 84.84%] (322/396) | 90.40% [87.10%, 92.93%] (358/396) | 81.31% [77.18%, 84.84%] (322/396) |
| `ib:HL` | 353 | 91.50% [88.13%, 93.98%] (323/353) | 77.90% [73.29%, 81.92%] (275/353) | 91.50% [88.13%, 93.98%] (323/353) | 77.90% [73.29%, 81.92%] (275/353) |
| `ib:SL` | 147 | 96.60% [92.29%, 98.54%] (142/147) | 87.07% [80.69%, 91.57%] (128/147) | 96.60% [92.29%, 98.54%] (142/147) | 87.07% [80.69%, 91.57%] (128/147) |
| `ncuk:IFY` | 351 | 90.03% [86.45%, 92.74%] (316/351) | 70.37% [65.39%, 74.91%] (247/351) | 89.46% [85.81%, 92.26%] (314/351) | 70.37% [65.39%, 74.91%] (247/351) |
| `ncuk:IFY-S1` | 76 | 97.37% [90.90%, 99.28%] (74/76) | 85.53% [75.91%, 91.72%] (65/76) | 97.37% [90.90%, 99.28%] (74/76) | 85.53% [75.91%, 91.72%] (65/76) |
| `ncuk:IFY-S2` | 73 | 86.30% [76.59%, 92.39%] (63/73) | 76.71% [65.83%, 84.92%] (56/73) | 86.30% [76.59%, 92.39%] (63/73) | 76.71% [65.83%, 84.92%] (56/73) |

### 5.3 `Novel-1500` Stratified by Physics Domain & Paper Format (1-Retry Closed-Loop)

| Physics Domain / Format | N | Step 1 Solver Pass (95% CI) | Step 2 Gate Pass (95% CI) | Syllabus Aligned (95% CI) | End-to-End Verified (95% CI) |
| --- | ---: | --- | --- | --- | --- |
| `circuits` | 114 | 100.00% [96.74%, 100.00%] (114/114) | 85.09% [77.41%, 90.48%] (97/114) | 100.00% [96.74%, 100.00%] (114/114) | 85.09% [77.41%, 90.48%] (97/114) |
| `em-induction` | 114 | 100.00% [96.74%, 100.00%] (114/114) | 84.21% [76.42%, 89.77%] (96/114) | 100.00% [96.74%, 100.00%] (114/114) | 84.21% [76.42%, 89.77%] (96/114) |
| `fields` | 64 | 100.00% [94.34%, 100.00%] (64/64) | 90.62% [81.02%, 95.63%] (58/64) | 100.00% [94.34%, 100.00%] (64/64) | 90.62% [81.02%, 95.63%] (58/64) |
| `graphs` | 77 | 100.00% [95.25%, 100.00%] (77/77) | 74.03% [63.26%, 82.51%] (57/77) | 100.00% [95.25%, 100.00%] (77/77) | 74.03% [63.26%, 82.51%] (57/77) |
| `grav-astro` | 136 | 94.12% [88.82%, 96.99%] (128/136) | 90.44% [84.33%, 94.33%] (123/136) | 94.12% [88.82%, 96.99%] (128/136) | 90.44% [84.33%, 94.33%] (123/136) |
| `mechanics` | 236 | 100.00% [98.40%, 100.00%] (236/236) | 83.90% [78.67%, 88.04%] (198/236) | 99.15% [96.96%, 99.77%] (234/236) | 83.90% [78.67%, 88.04%] (198/236) |
| `optics-shm` | 127 | 100.00% [97.06%, 100.00%] (127/127) | 81.10% [73.42%, 86.96%] (103/127) | 100.00% [97.06%, 100.00%] (127/127) | 81.10% [73.42%, 86.96%] (103/127) |
| `pure-calculation` | 48 | 100.00% [92.59%, 100.00%] (48/48) | 100.00% [92.59%, 100.00%] (48/48) | 100.00% [92.59%, 100.00%] (48/48) | 100.00% [92.59%, 100.00%] (48/48) |
| `quantum-nuclear` | 287 | 71.78% [66.31%, 76.67%] (206/287) | 59.93% [54.17%, 65.43%] (172/287) | 71.78% [66.31%, 76.67%] (206/287) | 59.93% [54.17%, 65.43%] (172/287) |
| `thermal` | 139 | 74.10% [66.24%, 80.67%] (103/139) | 67.63% [59.46%, 74.84%] (94/139) | 74.10% [66.24%, 80.67%] (103/139) | 67.63% [59.46%, 74.84%] (94/139) |
| `waves` | 158 | 95.57% [91.14%, 97.84%] (151/158) | 82.28% [75.58%, 87.44%] (130/158) | 95.57% [91.14%, 97.84%] (151/158) | 82.28% [75.58%, 87.44%] (130/158) |
| **Paper 1 MCQ (`mcq`)** | 975 | 92.31% [90.46%, 93.82%] (900/975) | 83.90% [81.46%, 86.07%] (818/975) | 92.31% [90.46%, 93.82%] (900/975) | **83.90%** [81.46%, 86.07%] (818/975) |
| **Paper 2 Structured (`structured`)** | 525 | 89.14% [86.19%, 91.53%] (468/525) | 68.19% [64.09%, 72.03%] (358/525) | 88.76% [85.77%, 91.19%] (466/525) | **68.19%** [64.09%, 72.03%] (358/525) |

## 6. Stem & Parametric Diversity Metrics

| Evaluation Split & Mode | Non-Empty Stems | Unique Stem Fingerprint Ratio | Near-Duplicate Pair Rate | Mean Pairwise 3-Gram Jaccard Distance | Unique Parameter Signature Ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| Locked `test.jsonl` (Champion 0-Retry) | 460 | `61.30%` (`282/460`) | `0.464%` | `0.9794` | `18.91%` (`87/460`) |
| Locked `test.jsonl` (Champion 1-Retry) | 510 | `66.08%` (`337/510`) | `0.366%` | `0.9823` | `20.59%` (`105/510`) |
| `Novel-1500` (Champion 1-Retry) | 1,368 | **`83.99%`** (`1,149/1,368`) | **`0.035%`** | **`0.9941`** | **`40.79%`** (`558/1,368`) |

## 7. Residual Failure Analysis & Scope Boundaries

| Failure Category & Code | Locked Test 0-Retry | Locked Test 1-Retry | `Novel-1500` 1-Retry | Primary Root Cause |
| --- | ---: | ---: | ---: | --- |
| **Step 1:** `scenario-validation` | 112 | 74 | 131 | `quantum-nuclear` energy-level transition ID naming (`l5`, `n=6`, `continuum`) & `thermal` phase/heat-capacity schema bounds |
| **Step 1:** `svg-leak` / `svg-sanity` | 11 / 3 | 2 / 0 | 1 / 0 | Thermal Wien-curve comparison temperature label numerically close to hidden wavelength |
| **Step 2 Gate:** `ground-truth-mismatch` | 131 | 99 | 215 | Wrong solver key or rounding mismatch in `graphs`, `fields`, and multi-part `structured` items |
| **Step 2 Gate:** `mcq-distractor-matches-answer` / `duplicate-options` / `non-unique-correct` | 28 / 11 / 0 | 26 / 6 / 2 | 58 / 18 / 14 | Distractor arithmetic collides with rounded correct option or repeats an option value |
| **Step 2 Gate:** `mark-sum-mismatch` / `coverage-mismatch` | 14 / 4 | 13 / 1 | 43 / 9 | Paper 2 rubric `M1/A1` marks sum != declared `totalMarks` |
| **Step 2 Gate:** `stem-answer-leak` | 7 | 8 | 14 | Target unknown value inadvertently stated in stem (mostly `optics-shm`) |
| **Syllabus Gate:** `paper-marks-out-of-bounds` | 0 | 0 | 2 | Two `ncuk:IFY` mechanics structured rollouts (`novel-ncuk-0236`, `novel-ncuk-0500`) emitted `format: "mcq"` with `totalMarks = 6` |

- **Scope & Educational Boundaries:** All metrics above are produced by deterministic physics solvers, 3-significant-figure tolerance gates, SVG non-leakage guards, and automated 3-syllabus specification checks. They establish mathematical, structural, and syllabus-rule consistency, not human classroom sign-off or examination board endorsement.

## 8. Independent Audit Receipt & 15-Item Qualitative Spot-Check

- **Independent Re-Scoring & Integrity:** Re-running `npx tsx scripts/benchmark/evaluate-model-rollouts.ts` locally across all `22` rollout JSONL files (`round0_untuned`, `round1_sft_core`, `round2_warm_polish`, `final_champion`) reproduced every headline rate, stratified bucket, diversity statistic, failure count, and 95% Wilson CI with **`0` discrepancies**. Verified `novel_1500_verified_bank_candidates.jsonl` contains the exact `1,176` `endToEndVerified` items, `adapter_model.safetensors` (`232,821,904` B, `256` tensors, `58,195,968` params, `0` visual keys, `0` NaN/Inf) matches `round1_sft_core` byte-for-byte, and `adapter_config.json` references `"Qwen/Qwen3.5-9B"` cleanly for Hugging Face Hub portability.
- **15-Item Manual Qualitative Review (`5` IB 2025, `5` UK A-Level, `5` NCUK IFY across all 11 domains, MCQ + Structured):**
  - **12/15 fully classroom-sound:** Accurate syllabus gravity conventions (`g = 9.8` on IB `novel-ib-0004`, `g = 9.81` on NCUK `novel-ncuk-0036`), clear diagnostic distractors (e.g., forgetting `½` or extra stretch drop in elastic energy, confusing `v_p` vs `v_rms`, inverting Lorentz `γ`), and step-by-step `M1`/`A1` rubrics (`novel-ib-0036`, `novel-ib-0006`, `ga-cosmological-redshift-str-016`, `waves-diffraction-grating-mcq-206`, `novel-alevel-0012`, `novel-alevel-0014`, `novel-alevel-0010`, `ga-cosmological-redshift-str-144`, `novel-ncuk-0107`, `novel-ncuk-0023`, `sp-circuits-02-mcq-023`).
  - **3/15 subtle prose-to-quantity misalignments passing 3-sf numeric gates:** `sp-graphs-0024-mcq` (framed a linear gradient `-1.88` receipt as a `log₁₀ A` vs `t` slope), `novel-ncuk-0036` part (a) (asked for cable force components while quoting solver `accelerationMs2 = 5.22 m s⁻²`), and `sp-thermal-struct-0011` part (b) (asked for melt + liquid heating energy while quoting liquid-heating energy `1.55 × 10⁵ J` alone). These concrete findings directly motivate future semantic rubric verifiers and human teacher review before classroom publication.

## 9. Ready-to-Use Summary Drafts (UCAS CS Personal Statement & Hugging Face)

1. **UCAS Personal Statement — Concise Neuro-Symbolic Engineering Draft:**
   > "To eliminate arithmetic hallucination in automated physics assessment, I built SixthPhysics—a deterministic TypeScript physics solver, non-leaking SVG renderer, and three-syllabus static bank (`7,643` verified IB, UK A-Level, and NCUK IFY items)—and distilled `2,413` core tool-interaction traces into `Qwen/Qwen3.5-9B` via assistant-masked LoRA fine-tuning. On a contamination-free family-grouped test split (`N = 586`), end-to-end solver-verified accuracy rose from `0.00%` (`0.34%` with 1 retry) untuned to `64.51%` (`75.60%` with 1 retry), alongside `87.03%` syllabus alignment."

2. **UCAS Personal Statement — Verification, Generalisation & Engineering Rigour Draft:**
   > "Rather than trusting free-form LLM physics answers, I coupled `Qwen/Qwen3.5-9B` to a formal verification gate enforcing 3-significant-figure solver agreement, hidden-quantity SVG guards, and syllabus-specific conventions (`g = 9.8` vs `9.81 m s^-2`). Evaluated on `1,500` fresh out-of-sample IB 2025, UK A-Level, and NCUK IFY prompts, the distilled model achieved `78.40%` end-to-end verified generation (`91.07%` syllabus alignment), while my manual spot-check revealed subtle prose-to-quantity misalignments that motivated separating mathematical verification from human pedagogical sign-off."

3. **Hugging Face Repository / Project Summary Draft:**
   > "SixthPhysics-Qwen3.5-9B-LoRA is a neuro-symbolic pre-university physics question generator trained via assistant-masked `bf16` LoRA (`r=32`) on deterministic two-turn harness traces from the `7,643`-item SixthPhysics project (`2,413` core training traces; Round 2 warm-start ablation evaluated on `val.jsonl`). Across `586` locked family-disjoint test prompts and `1,500` novel IB 2025, UK A-Level, and NCUK IFY prompts, it raises closed-loop solver-verified pass rates from `0.00%`/`0.34%` untuned to `64.51%`/`75.60%` (0/1-retry) on held-out test and `67.53%`/`78.40%` (`91.07%` syllabus alignment) on `Novel-1500`."
