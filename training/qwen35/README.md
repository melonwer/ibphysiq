# SixthPhysics `Qwen/Qwen3.5-9B` Cloud-Detached Modal H100 Pipeline

Self-contained cloud training, closed-loop deterministic TypeScript physics solver evaluation, solver-verified RFT/DPO, and multi-syllabus benchmark pipeline for **`Qwen/Qwen3.5-9B`** (`Qwen3_5ForConditionalGeneration`).

All GPU workloads run **100% remotely on Modal H100 (80 GiB HBM3)** with **0% local GPU usage** and zero dependency on the local laptop remaining awake once launched with `--detach`.

## Module Overview

- `modal_env.py` — Builds the self-contained Modal container image combining Python 3.11 (`torch`, `vllm==0.34.0`, `transformers>=5.16.1`, `peft`, `trl`, `flash-linear-attention`) with **Node.js 22**, `npm ci`, `tsx`, and the repository's TypeScript physics solvers & benchmark suite (`lib/`, `scripts/benchmark/`, `tsconfig.json`, `types/`) mounted at `/workspace/sixthphysics`, backed by persistent volume `sixthphysics-qwen35-vol`.
- `smoke_test_modal.py` — Cloud H100 smoke check confirming `Qwen/Qwen3.5-9B` `bfloat16` loading, frozen vision tower (`0` trainable visual parameters), LoRA target adaptation (`q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj`), `enable_thinking=False` chat templating, strict assistant-only loss masking (`labels = -100` on `system`, `user`, and `tool` tokens), `vLLM` continuous batching (`2,000+` tok/s), and in-container invocation of `solve-step1-batch.ts` + `evaluate-model-rollouts.ts`.
- `modal_autonomous_pipeline.py` — Single-function remote cloud orchestrator (`timeout=2400` budget-guarded H100 run, idempotent per-stage checkpointing to `sixthphysics-qwen35-vol`):
  1. **Round 0 (`round0_untuned`):** Untuned `Qwen/Qwen3.5-9B` baseline on `val.jsonl` (`645`) and locked `test.jsonl` (`586`) across `0-retry`, `1-retry`, and `teacher-forced Step 2`.
  2. **Round 1 (`round1_sft_core`):** `bf16` LoRA (`r=32, alpha=64`, strict assistant-only sparse `lm_head` loss, 3 epochs on initial `2,413`-trace `train_r1_core.jsonl` + code-derived domain tool schema), evaluated on `val.jsonl` (`645`), locked `test.jsonl` (`586`), and `Novel-1500` (`1,500`).
  3. **Round 2 (`round2_warmstart_polish`):** Bounded warm-start `bf16` LoRA polish (`lr=4e-5`, cosine schedule, `140` steps) directly from `round1_sft_core` adapter weights on targeted curriculum traces from the expanded `6,412`-trace `train_r2_expanded.jsonl` (`7,643`-item bank), upsampling weaker domains & Paper 2 structured items identified strictly on Round 1 `val.jsonl`.
  4. **Champion Selection & `Novel-1500` Sweep:** Selects the champion checkpoint strictly on held-out `val.jsonl`, evaluates on locked `test.jsonl` (`586` items, zero contamination) and `1,500` out-of-sample multi-syllabus prompts (`novel-1500-prompts.jsonl`: `500 IB 2025`, `500 UK A-Level`, `500 NCUK IFY`), and writes `champion-adapter/`, `FINAL_SUMMARY.json`, `MODEL_CARD.md`, and `UCAS_AND_BENCHMARK_REPORT.md` directly into `sixthphysics-qwen35-vol`.
- `modal_finish_budget.py` — Budget-guarded 2-stage Modal H100 finisher (`timeout=2400`, reusing the cached `qwen35_image` and persistent volume `sixthphysics-qwen35-vol`):
  - **Stage A:** Locks in `round1_sft_core` `vLLM` benchmarks on locked `test.jsonl` (`586`: `0-retry`, `1-retry`, `teacher-forced Step 2`) and `novel-1500-prompts.jsonl` (`1,500`: `0-retry`, `1-retry`) with immediate `vol.commit()`.
  - **Stage B:** Runs warm-start `round2_warm_polish` (`lr=3.5e-5`, cosine, `max_steps=60`, step-30 & step-60 checkpoints, within-step length bucketing, sparse assistant-only `lm_head` loss) from `round1_sft_core/adapter` on an error-targeted zero-leakage mix of `train_r2_expanded.jsonl`, evaluates strictly on `val.jsonl` (`645`), and promotes the held-out `val.jsonl` winner to `champion-adapter/`.
- `report_builder.py` — Generates publication-ready HuggingFace Model Card (`docs/QWEN35_MODEL_CARD.md`) and UCAS/Benchmark Report (`docs/UCAS_AND_BENCHMARK_REPORT.md`) with Wilson 95% confidence intervals from measured evaluation JSONs.
- `sync_modal_results.py` — Zero-GPU local status checker and artifact downloader.

## Commands

### 1. Check Live Cloud Progress & Download Completed Results

```bash
python3 training/qwen35/sync_modal_results.py
```

Downloads completed round summaries, rollout JSONLs (`rollouts/*.jsonl`), `champion-adapter/`, and `FINAL_SUMMARY.json` into `dataset/qwen35-9b-runs/` (gitignored) and publishes `docs/QWEN35_MODEL_CARD.md` and `docs/UCAS_AND_BENCHMARK_REPORT.md` once the cloud job finishes. Pass `--no-rollouts` to skip downloading raw rollout JSONLs.

### 2. Inspect Live Modal App Logs

```bash
export CUDA_VISIBLE_DEVICES=""
/home/d4ydy/.venvs/default/bin/modal app list
/home/d4ydy/.venvs/default/bin/modal app logs <app-id>
```

### 3. Launch Cloud-Detached Pipeline

```bash
export CUDA_VISIBLE_DEVICES=""
/home/d4ydy/.venvs/default/bin/modal run --detach training/qwen35/modal_autonomous_pipeline.py
```
