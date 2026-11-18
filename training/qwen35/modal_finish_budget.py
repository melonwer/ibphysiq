"""Budget-Guarded Modal H100 Finisher (< $3.50 total spend, < 40 min wall-clock, timeout=3000).

Executes the exact 2-stage completion plan reusing the cached `qwen35_image` and persistent
Modal Volume `sixthphysics-qwen35-vol`:
  - Stage A: Lock in `round1_sft_core` benchmarks on locked `test.jsonl` (586: 0-retry, 1-retry,
    and teacher-forced Step 2) + `novel-1500-prompts.jsonl` (1,500: 0-retry & 1-retry) via vLLM,
    persisting immediately to `/vol/runs/autonomous/round1_sft_core/` with `vol.commit()`.
  - Stage B: Fast warm-start `round2_warm_polish` (`PeftModel.from_pretrained(..., is_trainable=True)`,
    sparse assistant-only `lm_head` loss, `lr=3.5e-5`, cosine, `grad_accum=4`, `max_steps=90`) on an
    error-targeted mix of `train_r2_expanded.jsonl` (zero `val`/`test` leakage), evaluate on `val.jsonl`
    (645) via vLLM, and strictly promote `round2_warm_polish` iff it beats `round1_sft_core` on `val.jsonl`.

Run foreground:
    CUDA_VISIBLE_DEVICES="" /home/d4ydy/.venvs/default/bin/modal run training/qwen35/modal_finish_budget.py
"""

from __future__ import annotations

from datetime import datetime, timezone
import gc
import hashlib
import json
import math
import multiprocessing as mp
import os
from pathlib import Path
import random
import shutil
import sys
import tempfile
import time
import traceback
from typing import Any

import modal

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from qwen35.modal_autonomous_pipeline import (  # noqa: E402
    MAX_SEQ_LEN,
    _BatchInferenceEngine,
    _eval_split_on_engine,
    _extract_domain,
    _extract_item_id,
    _read_jsonl,
    _write_json,
    _write_jsonl,
    build_augmented_system_prompt,
    tokenize_5turn_assistant_only,
)
from qwen35.modal_env import (  # noqa: E402
    BASE_MODEL_ID,
    DATA_REMOTE_DIR,
    HF_CACHE_DIR,
    RUNS_REMOTE_DIR,
    VOLUME_MOUNT,
    qwen35_image,
    vol,
)
from qwen35.report_builder import (  # noqa: E402
    build_model_card_markdown,
    build_ucas_benchmark_report_markdown,
)

app = modal.App("sixthphysics-qwen35-finish-budget", image=qwen35_image)
AUTONOMOUS_DIR = f"{RUNS_REMOTE_DIR}/autonomous"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _extract_format(record: dict[str, Any]) -> str:
    if isinstance(record.get("format"), str) and record["format"].strip():
        return record["format"].strip()
    meta = record.get("metadata")
    if isinstance(meta, dict) and isinstance(meta.get("format"), str) and meta["format"].strip():
        return meta["format"].strip()
    msgs = record.get("messages")
    if isinstance(msgs, list) and len(msgs) >= 2 and isinstance(msgs[1], dict):
        try:
            u = json.loads(msgs[1].get("content", "{}"))
            if isinstance(u.get("format"), str) and u["format"].strip():
                return u["format"].strip()
        except Exception:
            pass
    return "mcq"


def _gpu_worker_entry(target_fn: Any, kwargs: dict[str, Any], result_path_str: str) -> None:
    try:
        res = target_fn(**kwargs)
        Path(result_path_str).write_text(json.dumps(res), encoding="utf-8")
    except Exception as exc:
        tb = traceback.format_exc()
        Path(result_path_str).write_text(
            json.dumps({"error": repr(exc), "traceback": tb}),
            encoding="utf-8",
        )
        print(f"[GPU WORKER ERROR in {target_fn.__name__}]\n{tb}", file=sys.stderr, flush=True)
        raise


def _spawn_gpu_worker(target_fn: Any, kwargs: dict[str, Any]) -> dict[str, Any]:
    """Run GPU phase in an isolated spawn child process so 100% of VRAM is reclaimed on exit."""
    ctx = mp.get_context("spawn")
    with tempfile.NamedTemporaryFile(prefix="sp_fin_gpu_", suffix=".json", delete=False) as tf:
        result_path = Path(tf.name)
    try:
        proc = ctx.Process(target=_gpu_worker_entry, args=(target_fn, kwargs, str(result_path)))
        proc.start()
        proc.join()
        if proc.exitcode != 0:
            detail = result_path.read_text(encoding="utf-8") if result_path.exists() else "no output"
            raise RuntimeError(
                f"GPU worker {target_fn.__name__} failed with exit code {proc.exitcode}: {detail}"
            )
        return json.loads(result_path.read_text(encoding="utf-8"))
    finally:
        result_path.unlink(missing_ok=True)


def _merge_adapter_worker(
    base_model_dir: str,
    adapter_dir_str: str,
    merged_out_dir_str: str,
) -> dict[str, Any]:
    """Merge saved LoRA adapter into temporary bf16 directory for high-throughput vLLM evaluation."""
    import torch
    from peft import PeftModel
    from transformers import AutoModelForImageTextToText, AutoTokenizer

    t0 = time.time()
    tokenizer = AutoTokenizer.from_pretrained(base_model_dir, trust_remote_code=False)
    base = AutoModelForImageTextToText.from_pretrained(
        base_model_dir,
        dtype=torch.bfloat16,
        device_map="cuda:0",
    )
    peft_m = PeftModel.from_pretrained(base, adapter_dir_str, is_trainable=False)
    merged = peft_m.merge_and_unload()
    merged_dir = Path(merged_out_dir_str)
    if merged_dir.exists():
        shutil.rmtree(merged_dir)
    merged_dir.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(str(merged_dir), max_shard_size="10GB")
    tokenizer.save_pretrained(str(merged_dir))

    del merged
    del peft_m
    del base
    gc.collect()
    torch.cuda.empty_cache()
    elapsed = round(time.time() - t0, 2)
    print(f"[Merge] Merged {adapter_dir_str} -> {merged_out_dir_str} in {elapsed}s", flush=True)
    return {"elapsed_sec": elapsed, "merged_dir": merged_out_dir_str}


def _vllm_multi_split_eval_worker(
    model_dir: str,
    domain_schemas_path_str: str,
    split_specs: list[dict[str, Any]],
    conditional_r1_val_tuple: list[float] | None = None,
) -> dict[str, Any]:
    """Evaluate one or more splits in a single vLLM session (optionally gating test+novel on val win)."""
    domain_schemas = json.loads(Path(domain_schemas_path_str).read_text(encoding="utf-8"))
    engine = _BatchInferenceEngine(model_dir)
    results: dict[str, Any] = {"backend": engine.backend}
    try:
        for spec in split_specs:
            prefix = str(spec["split_prefix"])
            if spec.get("only_if_val_beats_r1") and conditional_r1_val_tuple is not None:
                val_res = results.get("val", {})
                r2_1 = float(
                    (val_res.get("one_retry") or {})
                    .get("headline", {})
                    .get("endToEndVerifiedRate", 0.0)
                )
                r2_0 = float(
                    (val_res.get("zero_retry") or {})
                    .get("headline", {})
                    .get("endToEndVerifiedRate", 0.0)
                )
                if (r2_1, r2_0) <= (conditional_r1_val_tuple[0], conditional_r1_val_tuple[1]):
                    print(
                        f"[Eval] Skipping {prefix}: round2_warm_polish val "
                        f"(1-retry={r2_1:.4f}, 0-retry={r2_0:.4f}) did not beat round1_sft_core "
                        f"(1-retry={conditional_r1_val_tuple[0]:.4f}, 0-retry={conditional_r1_val_tuple[1]:.4f}).",
                        flush=True,
                    )
                    continue

            res = _eval_split_on_engine(
                engine=engine,
                split_file_str=str(spec["split_file_str"]),
                domain_schemas=domain_schemas,
                out_dir_str=str(spec["out_dir_str"]),
                split_prefix=prefix,
                include_one_retry=bool(spec.get("include_one_retry", True)),
                include_teacher_forced_step2=bool(spec.get("include_teacher_forced_step2", True)),
                save_verified_candidates_jsonl=spec.get("save_verified_candidates_jsonl"),
            )
            z_e2e = res["zero_retry"]["headline"]["endToEndVerifiedRate"]
            o_e2e = (
                res["one_retry"]["headline"]["endToEndVerifiedRate"]
                if res.get("one_retry")
                else None
            )
            print(
                f"[Eval:{prefix}] Done in {res['elapsed_sec']}s | "
                f"0-retry E2E={100.0 * z_e2e:.2f}% | "
                f"1-retry E2E={100.0 * o_e2e:.2f}% "
                if o_e2e is not None
                else f"[Eval:{prefix}] Done in {res['elapsed_sec']}s | 0-retry E2E={100.0 * z_e2e:.2f}%",
                flush=True,
            )
            results[prefix] = res
        return results
    finally:
        engine.close()


def _build_error_targeted_r2_curriculum(
    train_r1_rows: list[dict[str, Any]],
    train_r2_rows: list[dict[str, Any]],
    r1_val_zero_report: dict[str, Any],
    r1_val_one_report: dict[str, Any],
    out_jsonl: Path,
    target_examples: int = 1600,
) -> dict[str, Any]:
    """Build a zero-leakage error-targeted curriculum from `train_r2_expanded.jsonl` (6,412 traces).

    Strictly uses Round 1 `val.jsonl` diagnostics (never `test.jsonl`) to upsample:
      1. Paper 2 `structured` multipart items (where Round 1 val Step-2 gate was 51.83% / 59.63%
         vs MCQ 79.16% / 90.63%), and
      2. Domains where Round 1 `val` Step-2 numerical/distractor checks or Step-1 checks missed
         (`cond_step2 < 0.86` or `e2e < 0.86`), preferring the 3,999 fresh `train_r2_expanded`
         traces unseen in Round 1 while keeping a 20% balanced all-domain replay anchor.
    """
    r1_ids = {_extract_item_id(r, i) for i, r in enumerate(train_r1_rows)}
    by_domain_z = r1_val_zero_report.get("byDomain", {})
    by_domain_o = r1_val_one_report.get("byDomain", {})

    domain_diag: dict[str, dict[str, float]] = {}
    weak_domains: set[str] = set()
    for dom, b_z in by_domain_z.items():
        e2e_z = float(b_z.get("endToEndVerified", {}).get("rate", 0.0))
        cond_s2_z = float(b_z.get("conditionalStep2PassGivenStep1", {}).get("rate", 0.0))
        e2e_o = float(by_domain_o.get(dom, {}).get("endToEndVerified", {}).get("rate", e2e_z))
        domain_diag[dom] = {
            "val_zero_e2e": round(e2e_z, 4),
            "val_one_e2e": round(e2e_o, 4),
            "val_zero_cond_step2": round(cond_s2_z, 4),
        }
        if e2e_z < 0.86 or cond_s2_z < 0.86 or e2e_o < 0.90:
            weak_domains.add(dom)

    rng = random.Random(20261118)

    # Partition unique traces from train_r2_expanded (6,412) into priority buckets vs anchor pool
    fresh_weak_structured: dict[str, list[dict[str, Any]]] = {}
    fresh_weak_mcq: dict[str, list[dict[str, Any]]] = {}
    fresh_strong_structured: dict[str, list[dict[str, Any]]] = {}
    replay_by_domain: dict[str, list[dict[str, Any]]] = {}

    for idx, row in enumerate(train_r2_rows):
        iid = _extract_item_id(row, idx)
        dom = _extract_domain(row)
        fmt = _extract_format(row)
        is_fresh = iid not in r1_ids

        if is_fresh and dom in weak_domains and fmt == "structured":
            fresh_weak_structured.setdefault(dom, []).append(row)
        elif is_fresh and dom in weak_domains:
            fresh_weak_mcq.setdefault(dom, []).append(row)
        elif is_fresh and fmt == "structured":
            fresh_strong_structured.setdefault(dom, []).append(row)
        else:
            replay_by_domain.setdefault(dom, []).append(row)

    for bucket_map in (
        fresh_weak_structured,
        fresh_weak_mcq,
        fresh_strong_structured,
        replay_by_domain,
    ):
        for rows in bucket_map.values():
            rng.shuffle(rows)

    def _round_robin_take(pool_map: dict[str, list[dict[str, Any]]], quota: int) -> list[dict[str, Any]]:
        taken: list[dict[str, Any]] = []
        keys = sorted(pool_map.keys())
        cursors = {k: 0 for k in keys}
        while len(taken) < quota and keys:
            progressed = False
            for k in keys:
                if len(taken) >= quota:
                    break
                c = cursors[k]
                if c < len(pool_map[k]):
                    taken.append(pool_map[k][c])
                    cursors[k] = c + 1
                    progressed = True
            if not progressed:
                break
        # Trim consumed items from pool_map so leftover items can feed fallback pools cleanly
        for k in keys:
            pool_map[k] = pool_map[k][cursors[k] :]
        return taken

    # Target mix out of 1,600 unique traces (first ~1,440 consumed by 90 steps x 16 batch):
    #   - 45% (720) fresh weak-domain Paper 2 structured
    #   - 25% (400) fresh weak-domain Paper 1 MCQ (distractor/3sf polish)
    #   - 10% (160) fresh strong-domain Paper 2 structured
    #   - 20% (320) balanced 11-domain replay anchor
    part_ws = _round_robin_take(fresh_weak_structured, int(0.45 * target_examples))
    part_wm = _round_robin_take(fresh_weak_mcq, int(0.25 * target_examples))
    part_ss = _round_robin_take(fresh_strong_structured, int(0.10 * target_examples))

    # Merge any unconsumed fresh items into replay_by_domain for clean round-robin fill
    for leftover_map in (fresh_weak_structured, fresh_weak_mcq, fresh_strong_structured):
        for dom, rem_rows in leftover_map.items():
            if rem_rows:
                replay_by_domain.setdefault(dom, []).extend(rem_rows)
    for rows in replay_by_domain.values():
        rng.shuffle(rows)

    needed_rem = max(0, target_examples - (len(part_ws) + len(part_wm) + len(part_ss)))
    part_replay = _round_robin_take(replay_by_domain, needed_rem)

    selected = part_ws + part_wm + part_ss + part_replay
    rng.shuffle(selected)
    _write_jsonl(out_jsonl, selected)

    counts_by_dom: dict[str, int] = {}
    counts_by_fmt: dict[str, int] = {}
    fresh_count = 0
    for idx, r in enumerate(selected):
        d = _extract_domain(r)
        f = _extract_format(r)
        counts_by_dom[d] = counts_by_dom.get(d, 0) + 1
        counts_by_fmt[f] = counts_by_fmt.get(f, 0) + 1
        if _extract_item_id(r, idx) not in r1_ids:
            fresh_count += 1

    return {
        "strategy": "error_targeted_fresh_r2_curriculum_zero_leakage",
        "r1_val_domain_diagnostics": domain_diag,
        "weak_domains_upsampled": sorted(weak_domains),
        "source_train_r2_expanded_count": len(train_r2_rows),
        "selected_unique_traces": len(selected),
        "fresh_unseen_in_r1_count": fresh_count,
        "fresh_unseen_in_r1_ratio": round(fresh_count / max(1, len(selected)), 4),
        "bucket_counts": {
            "fresh_weak_structured": len(part_ws),
            "fresh_weak_mcq": len(part_wm),
            "fresh_strong_structured": len(part_ss),
            "balanced_domain_replay": len(part_replay),
        },
        "counts_by_format": counts_by_fmt,
        "counts_by_domain": counts_by_dom,
    }


def _warm_polish_r2_worker(
    base_model_dir: str,
    init_adapter_dir_str: str,
    train_traces_path_str: str,
    domain_schemas_path_str: str,
    adapter_out_dir_str: str,
    merged_out_dir_str: str,
    round_label: str = "round2_warm_polish",
    max_steps: int = 90,
    max_wall_sec: float = 1200.0,
    lr: float = 3.5e-5,
    micro_batch_size: int = 4,
    grad_accum_steps: int = 4,
    seed: int = 1337,
) -> dict[str, Any]:
    """Warm-start directly from `round1_sft_core/adapter` using sparse assistant-only lm_head loss."""
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    import torch
    import torch.nn.functional as F
    from peft import PeftModel
    from torch.utils.checkpoint import checkpoint as grad_ckpt
    from transformers import AutoModelForImageTextToText, AutoTokenizer

    t0 = time.time()
    random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

    domain_schemas = json.loads(Path(domain_schemas_path_str).read_text(encoding="utf-8"))
    raw_traces = _read_jsonl(Path(train_traces_path_str))

    # Bind Triton chunk_gated_delta_rule directly for ~2x H100 step speed (verified exact)
    try:
        import transformers.models.qwen3_5.modeling_qwen3_5 as _q35_mod
        from fla.ops.gated_delta_rule import chunk_gated_delta_rule as _fla_chunk_gdr

        _orig_gdr = _q35_mod.torch_chunk_gated_delta_rule

        def _fast_ws_gdr(
            query: Any,
            key: Any,
            value: Any,
            g: Any,
            beta: Any,
            chunk_size: int = 64,
            initial_state: Any = None,
            output_final_state: bool = False,
            use_qk_l2norm_in_kernel: bool = False,
            **kwargs: Any,
        ) -> Any:
            if not query.is_cuda:
                return _orig_gdr(
                    query,
                    key,
                    value,
                    g=g,
                    beta=beta,
                    chunk_size=chunk_size,
                    initial_state=initial_state,
                    output_final_state=output_final_state,
                    use_qk_l2norm_in_kernel=use_qk_l2norm_in_kernel,
                    **kwargs,
                )
            return _fla_chunk_gdr(
                query.contiguous(),
                key.contiguous(),
                value.contiguous(),
                g=g.contiguous(),
                beta=beta.contiguous(),
                initial_state=initial_state,
                output_final_state=output_final_state,
                use_qk_l2norm_in_kernel=use_qk_l2norm_in_kernel,
                cu_seqlens=kwargs.get("cu_seqlens", None),
            )

        _q35_mod.torch_chunk_gated_delta_rule = _fast_ws_gdr
    except Exception as exc:
        print(f"[{round_label}] fla direct binding skipped ({exc!r})", flush=True)

    tokenizer = AutoTokenizer.from_pretrained(base_model_dir, trust_remote_code=False)
    pad_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id

    needed_examples = max_steps * micro_batch_size * grad_accum_steps
    tokenized_examples: list[dict[str, list[int]]] = []
    skipped = 0
    for tr in raw_traces:
        dom = _extract_domain(tr)
        msgs = [dict(m) for m in tr["messages"]]
        msgs[0]["content"] = build_augmented_system_prompt(msgs[0]["content"], dom, domain_schemas)
        tok = tokenize_5turn_assistant_only(tokenizer, msgs, max_seq_len=MAX_SEQ_LEN)
        if tok is None:
            skipped += 1
            continue
        tokenized_examples.append(tok)
        if len(tokenized_examples) >= needed_examples:
            break

    print(
        f"[{round_label}] Tokenized {len(tokenized_examples)} error-targeted traces (skipped={skipped}). "
        f"Warm-starting from {init_adapter_dir_str}...",
        flush=True,
    )

    base_model = AutoModelForImageTextToText.from_pretrained(
        base_model_dir,
        dtype=torch.bfloat16,
        device_map="cuda:0",
    )
    if hasattr(base_model, "model") and hasattr(base_model.model, "visual"):
        base_model.model.visual.requires_grad_(False)
    base_model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    base_model.enable_input_require_grads()

    peft_model = PeftModel.from_pretrained(base_model, init_adapter_dir_str, is_trainable=True)
    trainable_params = 0
    total_params = 0
    visual_trainable = 0
    for name, p in peft_model.named_parameters():
        total_params += p.numel()
        if "visual" in name and p.requires_grad:
            p.requires_grad_(False)
        if p.requires_grad:
            trainable_params += p.numel()
            if "visual" in name:
                visual_trainable += p.numel()
    if visual_trainable != 0:
        raise AssertionError(f"Vision tower leaked {visual_trainable} trainable parameters!")

    core_vlm = peft_model.get_base_model()
    lm_head = core_vlm.get_output_embeddings()

    def _chunk_ce_sum(c_hidden: torch.Tensor, c_targets: torch.Tensor) -> torch.Tensor:
        return F.cross_entropy(lm_head(c_hidden).float(), c_targets, reduction="sum")

    def _sparse_ce(in_ids: torch.Tensor, amask: torch.Tensor, lbls: torch.Tensor) -> torch.Tensor:
        backbone_out = core_vlm.model(input_ids=in_ids, attention_mask=amask, use_cache=False)
        hidden = (
            backbone_out.last_hidden_state
            if hasattr(backbone_out, "last_hidden_state")
            else backbone_out[0]
        )
        shift_h = hidden[:, :-1, :]
        shift_y = lbls[:, 1:]
        vmask = shift_y != -100
        act_h = shift_h[vmask]
        act_y = shift_y[vmask]
        total_act = int(act_y.numel())
        if total_act == 0:
            return hidden.sum() * 0.0
        sums = [
            grad_ckpt(_chunk_ce_sum, act_h[i : i + 512], act_y[i : i + 512], use_reentrant=False)
            for i in range(0, total_act, 512)
        ]
        return torch.stack(sums).sum() / float(total_act)

    # Step-0 mathematical equivalence check on 64-token slice (eval mode so lora_dropout=0.05 is deterministic!)
    peft_model.eval()
    with torch.no_grad():
        sample0 = tokenized_examples[0]["input_ids"][:64]
        t_in = torch.tensor([sample0], dtype=torch.long, device="cuda:0")
        t_am = torch.ones_like(t_in)
        t_lb = torch.full_like(t_in, -100)
        t_lb[:, -16:] = t_in[:, -16:]
        ref_loss = float(
            peft_model(input_ids=t_in, attention_mask=t_am, labels=t_lb, use_cache=False)
            .loss.detach()
            .cpu()
            .item()
        )
        sp_loss = float(_sparse_ce(t_in, t_am, t_lb).detach().cpu().item())
        if abs(ref_loss - sp_loss) > 1e-2:
            raise AssertionError(f"Sparse lm_head loss mismatch: full={ref_loss} vs sparse={sp_loss}")
        print(
            f"[{round_label}] Sparse lm_head equivalence verified (eval mode diff={abs(ref_loss - sp_loss):.6f}).",
            flush=True,
        )

    peft_model.train()

    optimizer = torch.optim.AdamW(
        [p for p in peft_model.parameters() if p.requires_grad],
        lr=lr,
        betas=(0.9, 0.95),
        weight_decay=0.01,
        fused=True,
    )

    warmup_steps = max(1, int(round(0.09 * max_steps)))
    optimizer.zero_grad(set_to_none=True)
    opt_step = 0
    running_loss = 0.0
    micro_in_log_window = 0
    loss_history: list[dict[str, Any]] = []
    step_batch_size = micro_batch_size * grad_accum_steps

    for step_start in range(0, len(tokenized_examples), step_batch_size):
        if opt_step >= max_steps:
            break
        step_items = tokenized_examples[step_start : step_start + step_batch_size]
        if len(step_items) < step_batch_size:
            break
        # Sort the 16 items within each optimizer step by length into 4 tight microbatches of 4:
        # mathematically identical accumulated gradient with ~20-25% less wasted padding compute.
        step_items = sorted(step_items, key=lambda x: len(x["input_ids"]))

        for mb_start in range(0, step_batch_size, micro_batch_size):
            batch_items = step_items[mb_start : mb_start + micro_batch_size]
            max_len = max(len(x["input_ids"]) for x in batch_items)

            input_ids = torch.full((len(batch_items), max_len), pad_id, dtype=torch.long, device="cuda:0")
            labels = torch.full((len(batch_items), max_len), -100, dtype=torch.long, device="cuda:0")
            attn_mask = torch.zeros((len(batch_items), max_len), dtype=torch.long, device="cuda:0")
            for r_i, item in enumerate(batch_items):
                L = len(item["input_ids"])
                input_ids[r_i, :L] = torch.tensor(item["input_ids"], dtype=torch.long, device="cuda:0")
                labels[r_i, :L] = torch.tensor(item["labels"], dtype=torch.long, device="cuda:0")
                attn_mask[r_i, :L] = 1

            raw_loss = _sparse_ce(input_ids, attn_mask, labels)
            (raw_loss / grad_accum_steps).backward()
            running_loss += float(raw_loss.detach().cpu().item())
            micro_in_log_window += 1

        if opt_step < warmup_steps:
            cur_lr = lr * float(opt_step + 1) / float(warmup_steps)
        else:
            prog = float(opt_step - warmup_steps) / float(max(1, max_steps - warmup_steps))
            cur_lr = lr * (0.1 + 0.9 * 0.5 * (1.0 + math.cos(math.pi * min(1.0, prog))))
        for pg in optimizer.param_groups:
            pg["lr"] = cur_lr

        gn = float(
            torch.nn.utils.clip_grad_norm_(
                [p for p in peft_model.parameters() if p.requires_grad], 1.0
            )
            .detach()
            .cpu()
            .item()
        )
        optimizer.step()
        optimizer.zero_grad(set_to_none=True)
        opt_step += 1

        elapsed_now = time.time() - t0
        if opt_step % 15 == 0 or opt_step == 1 or opt_step == max_steps or elapsed_now >= max_wall_sec:
            rec = {
                "step": opt_step,
                "max_steps": max_steps,
                "loss": round(running_loss / max(1, micro_in_log_window), 4),
                "grad_norm": round(gn, 4),
                "lr": round(cur_lr, 7),
                "peak_vram_gb": round(torch.cuda.max_memory_allocated(0) / (1024**3), 2),
                "elapsed_sec": round(elapsed_now, 1),
            }
            loss_history.append(rec)
            print(f"[{round_label}] {rec}", flush=True)
            running_loss = 0.0
            micro_in_log_window = 0

        if opt_step == 30 and opt_step < max_steps:
            ckpt_dir = Path(adapter_out_dir_str).parent / f"checkpoint-{opt_step}"
            ckpt_dir.mkdir(parents=True, exist_ok=True)
            peft_model.save_pretrained(str(ckpt_dir))
            print(f"[{round_label}] Saved intermediate checkpoint -> {ckpt_dir}", flush=True)

        if elapsed_now >= max_wall_sec:
            print(
                f"[{round_label}] Reached wall-clock safety cap ({elapsed_now:.1f}s) cleanly at step {opt_step}.",
                flush=True,
            )
            break

    adapter_dir = Path(adapter_out_dir_str)
    adapter_dir.mkdir(parents=True, exist_ok=True)
    peft_model.save_pretrained(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))

    merged_dir = Path(merged_out_dir_str)
    if merged_dir.exists():
        shutil.rmtree(merged_dir)
    merged_dir.mkdir(parents=True, exist_ok=True)
    merged_model = peft_model.merge_and_unload()
    merged_model.save_pretrained(str(merged_dir), max_shard_size="10GB")
    tokenizer.save_pretrained(str(merged_dir))

    del merged_model
    del peft_model
    del base_model
    gc.collect()
    torch.cuda.empty_cache()

    return {
        "round": round_label,
        "warm_started_from": init_adapter_dir_str,
        "elapsed_sec": round(time.time() - t0, 2),
        "examples_seen": opt_step * micro_batch_size * grad_accum_steps,
        "steps_completed": opt_step,
        "max_steps": max_steps,
        "lr": lr,
        "micro_batch_size": micro_batch_size,
        "grad_accum_steps": grad_accum_steps,
        "trainable_params": trainable_params,
        "total_params": total_params,
        "trainable_visual_params": visual_trainable,
        "initial_loss": loss_history[0]["loss"] if loss_history else None,
        "final_loss": loss_history[-1]["loss"] if loss_history else None,
        "loss_history": loss_history,
    }


def _copy_champion_eval_files(src_dir: Path, final_dir: Path) -> None:
    final_dir.mkdir(parents=True, exist_ok=True)
    for fname in [
        "test_zero_retry.json",
        "test_one_retry.json",
        "test_teacher_forced_step2.json",
        "novel_1500_zero_retry.json",
        "novel_1500_one_retry.json",
        "novel_1500_verified_bank_candidates.jsonl",
    ]:
        src_f = src_dir / fname
        if src_f.exists():
            shutil.copy2(src_f, final_dir / fname)
    src_rolls = src_dir / "rollouts"
    if src_rolls.exists():
        dst_rolls = final_dir / "rollouts"
        dst_rolls.mkdir(parents=True, exist_ok=True)
        for rf in src_rolls.glob("*.jsonl"):
            if rf.name.startswith(("test_", "novel_1500_")):
                shutil.copy2(rf, dst_rolls / rf.name)


@app.function(
    gpu="H100",
    cpu=12,
    memory=98304,
    volumes={VOLUME_MOUNT: vol},
    timeout=2400,
)
def run_budget_finish() -> str:
    """Execute Stage A (R1 Test + Novel-1500 lock-in) and Stage B (90-step warm-start R2 polish)."""
    import huggingface_hub
    import torch

    pipeline_t0 = time.time()
    vol.reload()

    run_root = Path(AUTONOMOUS_DIR)
    run_root.mkdir(parents=True, exist_ok=True)
    os.makedirs(HF_CACHE_DIR, exist_ok=True)

    status_path = run_root / "LIVE_STATUS.json"
    prior_status: dict[str, Any] = (
        json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {}
    )
    status_state: dict[str, Any] = {
        "run_id": prior_status.get("run_id", f"sixthphysics-qwen35-finish-{int(pipeline_t0)}"),
        "started_at": prior_status.get("started_at", _utc_now()),
        "finisher_started_at": _utc_now(),
        "completed_stages": list(prior_status.get("completed_stages", ["round0_untuned", "round1_sft_core"])),
        "stage_timings_sec": dict(prior_status.get("stage_timings_sec", {})),
        "round_headlines": dict(prior_status.get("round_headlines", {})),
        "errors": [],
    }

    def _commit_status(stage: str, extra: dict[str, Any] | None = None) -> None:
        status_state["current_stage"] = stage
        status_state["updated_at"] = _utc_now()
        status_state["elapsed_sec"] = round(time.time() - pipeline_t0, 1)
        if extra:
            status_state.update(extra)
        _write_json(status_path, status_state)
        vol.commit()

    gpu_info = {
        "name": torch.cuda.get_device_name(0),
        "vram_gb": round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2),
    }
    print(f"[FinishBudget] H100 initialized: {gpu_info}", flush=True)

    data_dir = Path(DATA_REMOTE_DIR)
    train_r1_path = data_dir / "train_r1_core.jsonl"
    train_r2_path = data_dir / "train_r2_expanded.jsonl"
    val_path = data_dir / "val.jsonl"
    test_path = data_dir / "test.jsonl"
    schemas_path = data_dir / "domain-tool-schemas.json"
    novel_path = data_dir / "novel-1500-prompts.jsonl"

    for req_file in [train_r1_path, train_r2_path, val_path, test_path, schemas_path, novel_path]:
        if not req_file.exists():
            raise FileNotFoundError(f"Missing required cloud dataset file: {req_file}")

    train_r1_rows = _read_jsonl(train_r1_path)
    train_r2_rows = _read_jsonl(train_r2_path)
    val_rows = _read_jsonl(val_path)
    test_rows = _read_jsonl(test_path)
    novel_rows = _read_jsonl(novel_path)

    # Strict programmatic zero-contamination check before any Stage A / Stage B work
    heldout_ids = {_extract_item_id(r, i) for i, r in enumerate(val_rows + test_rows)}
    heldout_families = {str(r.get("familyGroupKey", "")) for r in (val_rows + test_rows)}
    for split_name, rows in [("train_r1_core", train_r1_rows), ("train_r2_expanded", train_r2_rows)]:
        overlap_ids = {_extract_item_id(r, i) for i, r in enumerate(rows)} & heldout_ids
        overlap_fams = {str(r.get("familyGroupKey", "")) for r in rows} & heldout_families
        if overlap_ids or overlap_fams:
            raise AssertionError(
                f"Contamination detected in {split_name}! ids={len(overlap_ids)}, families={len(overlap_fams)}"
            )

    val_sha = _sha256_file(val_path)
    test_sha = _sha256_file(test_path)

    _commit_status(
        "stage_a_initializing",
        {
            "gpu": gpu_info,
            "dataset_counts": {
                "train_r1_core": len(train_r1_rows),
                "train_r2_expanded": len(train_r2_rows),
                "val": len(val_rows),
                "test": len(test_rows),
                "novel_1500": len(novel_rows),
            },
            "dataset_sha256": {"val": val_sha, "test": test_sha},
            "zero_contamination_verified": True,
        },
    )

    try:
        base_model_dir = huggingface_hub.snapshot_download(
            repo_id=BASE_MODEL_ID,
            cache_dir=f"{HF_CACHE_DIR}/hub",
            local_files_only=True,
        )
    except Exception:
        base_model_dir = huggingface_hub.snapshot_download(
            repo_id=BASE_MODEL_ID,
            cache_dir=f"{HF_CACHE_DIR}/hub",
        )

    r0_dir = run_root / "round0_untuned"
    r0_summary = json.loads((r0_dir / "round0_summary.json").read_text(encoding="utf-8"))

    r1_dir = run_root / "round1_sft_core"
    r1_adapter_dir = r1_dir / "adapter"
    r1_summary_path = r1_dir / "round1_summary.json"
    r1_summary = json.loads(r1_summary_path.read_text(encoding="utf-8"))

    final_dir = run_root / "final_champion"
    final_dir.mkdir(parents=True, exist_ok=True)
    champ_adapter_dst = run_root / "champion-adapter"

    def _write_deliverables(
        champ_name: str,
        champ_src_adapter: Path,
        champ_eval_src_dir: Path,
        champ_test_dict: dict[str, Any],
        champ_novel_dict: dict[str, Any],
        champion_selection: dict[str, Any],
        rounds_payload: dict[str, Any],
    ) -> dict[str, Any]:
        if champ_adapter_dst.exists():
            shutil.rmtree(champ_adapter_dst)
        shutil.copytree(champ_src_adapter, champ_adapter_dst)
        _copy_champion_eval_files(champ_eval_src_dir, final_dir)
        _write_json(final_dir / "champion_selection.json", champion_selection)

        summary_obj = {
            "schema_version": "sixthphysics-qwen35-autonomous-summary/1.0.0",
            "completed_at_utc": _utc_now(),
            "finisher_elapsed_sec": round(time.time() - pipeline_t0, 2),
            "total_elapsed_sec": round(
                float(status_state["stage_timings_sec"].get("round0_untuned", 0.0))
                + float(status_state["stage_timings_sec"].get("round1_sft_core", 0.0))
                + (time.time() - pipeline_t0),
                2,
            ),
            "base_model_id": BASE_MODEL_ID,
            "gpu": gpu_info,
            "dataset_counts": status_state["dataset_counts"],
            "dataset_sha256": status_state["dataset_sha256"],
            "zero_contamination_verified": True,
            "champion_selection": champion_selection,
            "rounds": rounds_payload,
            "final_champion": {
                "champion_round": champ_name,
                "test_zero_retry": champ_test_dict["zero_retry"],
                "test_one_retry": champ_test_dict["one_retry"],
                "test_teacher_forced_step2": champ_test_dict["teacher_forced_step2"],
                "novel_1500_zero_retry": champ_novel_dict["zero_retry"],
                "novel_1500_one_retry": champ_novel_dict["one_retry"],
            },
        }
        _write_json(run_root / "FINAL_SUMMARY.json", summary_obj)
        mc_md = build_model_card_markdown(summary_obj)
        ur_md = build_ucas_benchmark_report_markdown(summary_obj)
        (run_root / "MODEL_CARD.md").write_text(mc_md, encoding="utf-8")
        (champ_adapter_dst / "README.md").write_text(mc_md, encoding="utf-8")
        (run_root / "UCAS_AND_BENCHMARK_REPORT.md").write_text(ur_md, encoding="utf-8")
        vol.commit()
        return summary_obj

    # =========================================================================
    # STAGE A — Lock In `round1_sft_core` Final Benchmarks FIRST (~8-12 min)
    # =========================================================================
    r1_bench_marker = r1_dir / "r1_benchmarks_summary.json"
    if not r1_bench_marker.exists():
        stage_a_t0 = time.time()
        _commit_status("stage_a_round1_test_and_novel_1500")
        print("[Stage A] Merging round1_sft_core/adapter for vLLM evaluation...", flush=True)
        merged_r1_tmp = "/tmp/merged_r1_model"
        _spawn_gpu_worker(
            _merge_adapter_worker,
            {
                "base_model_dir": base_model_dir,
                "adapter_dir_str": str(r1_adapter_dir),
                "merged_out_dir_str": merged_r1_tmp,
            },
        )
        print("[Stage A] Running vLLM evaluation on test.jsonl (586) + novel-1500-prompts.jsonl (1,500)...", flush=True)
        r1_evals = _spawn_gpu_worker(
            _vllm_multi_split_eval_worker,
            {
                "model_dir": merged_r1_tmp,
                "domain_schemas_path_str": str(schemas_path),
                "split_specs": [
                    {
                        "split_prefix": "test",
                        "split_file_str": str(test_path),
                        "out_dir_str": str(r1_dir),
                        "include_one_retry": True,
                        "include_teacher_forced_step2": True,
                    },
                    {
                        "split_prefix": "novel_1500",
                        "split_file_str": str(novel_path),
                        "out_dir_str": str(r1_dir),
                        "include_one_retry": True,
                        "include_teacher_forced_step2": False,
                        "save_verified_candidates_jsonl": str(
                            r1_dir / "novel_1500_verified_bank_candidates.jsonl"
                        ),
                    },
                ],
            },
        )
        shutil.rmtree(merged_r1_tmp, ignore_errors=True)

        stage_a_elapsed = round(time.time() - stage_a_t0, 2)
        r1_bench = {
            "elapsed_sec": stage_a_elapsed,
            "backend": r1_evals.get("backend", "vllm"),
            "test": r1_evals["test"],
            "novel_1500": r1_evals["novel_1500"],
        }
        _write_json(r1_bench_marker, r1_bench)

        # Enrich round1_summary.json while keeping all original fields intact
        r1_summary["stage_a_eval_elapsed_sec"] = stage_a_elapsed
        r1_summary["test_zero_retry"] = r1_bench["test"]["zero_retry"]
        r1_summary["test_one_retry"] = r1_bench["test"]["one_retry"]
        r1_summary["test_teacher_forced_step2"] = r1_bench["test"]["teacher_forced_step2"]
        r1_summary["novel_1500_zero_retry"] = r1_bench["novel_1500"]["zero_retry"]
        r1_summary["novel_1500_one_retry"] = r1_bench["novel_1500"]["one_retry"]
        _write_json(r1_summary_path, r1_summary)

        if "stage_a_round1_benchmarks" not in status_state["completed_stages"]:
            status_state["completed_stages"].append("stage_a_round1_benchmarks")
        status_state["stage_timings_sec"]["stage_a_round1_benchmarks"] = stage_a_elapsed
        status_state["round_headlines"]["round1_test_0retry"] = r1_bench["test"]["zero_retry"]["headline"]
        status_state["round_headlines"]["round1_test_1retry"] = r1_bench["test"]["one_retry"]["headline"]
        status_state["round_headlines"]["round1_test_tf_step2"] = r1_bench["test"]["teacher_forced_step2"]["headline"]
        status_state["round_headlines"]["round1_novel1500_0retry"] = r1_bench["novel_1500"]["zero_retry"]["headline"]
        status_state["round_headlines"]["round1_novel1500_1retry"] = r1_bench["novel_1500"]["one_retry"]["headline"]
        status_state["champion_round"] = "round1_sft_core"

        prelim_sel = {
            "selected_round": "round1_sft_core",
            "selection_criterion": "Strictly held-out val.jsonl (645 items): (one_retry_e2e, zero_retry_e2e)",
            "selection_rationale": "Stage A preliminary lock-in of round1_sft_core prior to Stage B warm-start comparison.",
            "val_leaderboard": [
                {
                    "round": "round1_sft_core",
                    "val_zero_retry_e2e": r1_summary["val_zero_retry"]["headline"]["endToEndVerifiedRate"],
                    "val_one_retry_e2e": r1_summary["val_one_retry"]["headline"]["endToEndVerifiedRate"],
                    "val_syllabus_alignment": r1_summary["val_zero_retry"]["headline"]["syllabusAlignmentRate"],
                    "val_step1_solver_pass": r1_summary["val_zero_retry"]["headline"]["step1SolverPassRate"],
                }
            ],
        }
        _write_deliverables(
            champ_name="round1_sft_core",
            champ_src_adapter=r1_adapter_dir,
            champ_eval_src_dir=r1_dir,
            champ_test_dict=r1_bench["test"],
            champ_novel_dict=r1_bench["novel_1500"],
            champion_selection=prelim_sel,
            rounds_payload={"round0": r0_summary, "round1": r1_summary},
        )
        _commit_status("stage_a_locked_in")
        print(
            f"[Stage A] LOCKED IN on Volume in {stage_a_elapsed}s! "
            f"R1 Test E2E: 0-retry={100.0 * r1_bench['test']['zero_retry']['headline']['endToEndVerifiedRate']:.2f}%, "
            f"1-retry={100.0 * r1_bench['test']['one_retry']['headline']['endToEndVerifiedRate']:.2f}% | "
            f"R1 Novel-1500 E2E: 0-retry={100.0 * r1_bench['novel_1500']['zero_retry']['headline']['endToEndVerifiedRate']:.2f}%, "
            f"1-retry={100.0 * r1_bench['novel_1500']['one_retry']['headline']['endToEndVerifiedRate']:.2f}%",
            flush=True,
        )
    else:
        r1_bench = json.loads(r1_bench_marker.read_text(encoding="utf-8"))
        if "test_zero_retry" not in r1_summary:
            r1_summary["test_zero_retry"] = r1_bench["test"]["zero_retry"]
            r1_summary["test_one_retry"] = r1_bench["test"]["one_retry"]
            r1_summary["test_teacher_forced_step2"] = r1_bench["test"]["teacher_forced_step2"]
            r1_summary["novel_1500_zero_retry"] = r1_bench["novel_1500"]["zero_retry"]
            r1_summary["novel_1500_one_retry"] = r1_bench["novel_1500"]["one_retry"]
            _write_json(r1_summary_path, r1_summary)
        print("[Stage A] Loaded existing locked-in round1_sft_core benchmarks from Volume.", flush=True)

    # =========================================================================
    # STAGE B — Fast Warm-Start `round2_warm_polish` (max_steps=90, lr=3.5e-5)
    # =========================================================================
    r2_dir = run_root / "round2_warm_polish"
    r2_dir.mkdir(parents=True, exist_ok=True)
    r2_summary_path = r2_dir / "round2_summary.json"
    r2_adapter_dir = r2_dir / "adapter"
    merged_r2_tmp = "/tmp/merged_r2_warm_polish"

    r1_val_1 = float(r1_summary["val_one_retry"]["headline"]["endToEndVerifiedRate"])
    r1_val_0 = float(r1_summary["val_zero_retry"]["headline"]["endToEndVerifiedRate"])

    if not r2_summary_path.exists():
        stage_b_t0 = time.time()
        _commit_status("stage_b_round2_warm_polish_training")

        ws_jsonl = Path("/tmp/r2_warm_polish_curriculum.jsonl")
        curriculum_plan = _build_error_targeted_r2_curriculum(
            train_r1_rows=train_r1_rows,
            train_r2_rows=train_r2_rows,
            r1_val_zero_report=r1_summary["val_zero_retry"],
            r1_val_one_report=r1_summary["val_one_retry"],
            out_jsonl=ws_jsonl,
            target_examples=1600,
        )
        _write_json(r2_dir / "curriculum_plan.json", curriculum_plan)
        vol.commit()

        # Reserve >= 720s inside timeout=2400 for vLLM val (+ conditional test + Novel-1500) evaluation
        remaining_for_train = max(360.0, 2400.0 - (time.time() - pipeline_t0) - 720.0)
        ws_wall_cap = min(1200.0, remaining_for_train)

        print(
            f"[Stage B] Launching round2_warm_polish (max_steps=60, lr=3.5e-5, wall_cap={ws_wall_cap:.0f}s)...",
            flush=True,
        )
        r2_train_metrics = _spawn_gpu_worker(
            _warm_polish_r2_worker,
            {
                "base_model_dir": base_model_dir,
                "init_adapter_dir_str": str(r1_adapter_dir),
                "train_traces_path_str": str(ws_jsonl),
                "domain_schemas_path_str": str(schemas_path),
                "adapter_out_dir_str": str(r2_adapter_dir),
                "merged_out_dir_str": merged_r2_tmp,
                "round_label": "round2_warm_polish",
                "max_steps": 60,
                "max_wall_sec": ws_wall_cap,
                "lr": 3.5e-5,
                "micro_batch_size": 4,
                "grad_accum_steps": 4,
                "seed": 1337,
            },
        )
        ws_jsonl.unlink(missing_ok=True)
        _write_json(r2_dir / "train_metrics.json", r2_train_metrics)
        _commit_status("stage_b_round2_warm_polish_eval")

        r2_evals = _spawn_gpu_worker(
            _vllm_multi_split_eval_worker,
            {
                "model_dir": merged_r2_tmp,
                "domain_schemas_path_str": str(schemas_path),
                "conditional_r1_val_tuple": [r1_val_1, r1_val_0],
                "split_specs": [
                    {
                        "split_prefix": "val",
                        "split_file_str": str(val_path),
                        "out_dir_str": str(r2_dir),
                        "include_one_retry": True,
                        "include_teacher_forced_step2": True,
                    },
                    {
                        "split_prefix": "test",
                        "split_file_str": str(test_path),
                        "out_dir_str": str(r2_dir),
                        "include_one_retry": True,
                        "include_teacher_forced_step2": True,
                        "only_if_val_beats_r1": True,
                    },
                    {
                        "split_prefix": "novel_1500",
                        "split_file_str": str(novel_path),
                        "out_dir_str": str(r2_dir),
                        "include_one_retry": True,
                        "include_teacher_forced_step2": False,
                        "only_if_val_beats_r1": True,
                        "save_verified_candidates_jsonl": str(
                            r2_dir / "novel_1500_verified_bank_candidates.jsonl"
                        ),
                    },
                ],
            },
        )
        shutil.rmtree(merged_r2_tmp, ignore_errors=True)

        stage_b_elapsed = round(time.time() - stage_b_t0, 2)
        r2_val = r2_evals["val"]
        r2_summary: dict[str, Any] = {
            "round": "round2_warm_polish",
            "elapsed_sec": stage_b_elapsed,
            "curriculum_plan": curriculum_plan,
            "train_metrics": r2_train_metrics,
            "val_zero_retry": r2_val["zero_retry"],
            "val_one_retry": r2_val["one_retry"],
            "val_teacher_forced_step2": r2_val["teacher_forced_step2"],
            "beat_round1_on_val": "test" in r2_evals and "novel_1500" in r2_evals,
            "test_zero_retry": (r2_evals.get("test") or {}).get("zero_retry"),
            "test_one_retry": (r2_evals.get("test") or {}).get("one_retry"),
            "test_teacher_forced_step2": (r2_evals.get("test") or {}).get("teacher_forced_step2"),
            "novel_1500_zero_retry": (r2_evals.get("novel_1500") or {}).get("zero_retry"),
            "novel_1500_one_retry": (r2_evals.get("novel_1500") or {}).get("one_retry"),
            "test": r2_evals.get("test"),
            "novel_1500": r2_evals.get("novel_1500"),
        }
        _write_json(r2_summary_path, r2_summary)

        if "round2_warm_polish" not in status_state["completed_stages"]:
            status_state["completed_stages"].append("round2_warm_polish")
        status_state["stage_timings_sec"]["round2_warm_polish"] = stage_b_elapsed
        status_state["round_headlines"]["round2_val_0retry"] = r2_val["zero_retry"]["headline"]
        status_state["round_headlines"]["round2_val_1retry"] = r2_val["one_retry"]["headline"]
        status_state["round_headlines"]["round2_val_tf_step2"] = r2_val["teacher_forced_step2"]["headline"]
        if r2_summary["beat_round1_on_val"]:
            status_state["round_headlines"]["round2_test_0retry"] = r2_evals["test"]["zero_retry"]["headline"]
            status_state["round_headlines"]["round2_test_1retry"] = r2_evals["test"]["one_retry"]["headline"]
            status_state["round_headlines"]["round2_novel1500_0retry"] = r2_evals["novel_1500"]["zero_retry"]["headline"]
            status_state["round_headlines"]["round2_novel1500_1retry"] = r2_evals["novel_1500"]["one_retry"]["headline"]
        _commit_status("stage_b_complete")
    else:
        r2_summary = json.loads(r2_summary_path.read_text(encoding="utf-8"))

    # =========================================================================
    # STRICT HELD-OUT `val.jsonl` CHAMPION PROMOTION & DELIVERABLES
    # =========================================================================
    r2_val_1 = float(r2_summary["val_one_retry"]["headline"]["endToEndVerifiedRate"])
    r2_val_0 = float(r2_summary["val_zero_retry"]["headline"]["endToEndVerifiedRate"])

    if (r2_val_1, r2_val_0) > (r1_val_1, r1_val_0) and r2_summary.get("test") and r2_summary.get("novel_1500"):
        champ_name = "round2_warm_polish"
        champ_src_adapter = r2_adapter_dir
        champ_eval_dir = r2_dir
        champ_test_final = r2_summary["test"]
        champ_novel_final = r2_summary["novel_1500"]
        rationale = (
            f"`round2_warm_polish` beat `round1_sft_core` on held-out `val.jsonl` "
            f"(1-retry E2E `{100.0 * r2_val_1:.2f}%` vs `{100.0 * r1_val_1:.2f}%`, "
            f"0-retry E2E `{100.0 * r2_val_0:.2f}%` vs `{100.0 * r1_val_0:.2f}%`) "
            f"and was promoted to `champion-adapter/`."
        )
    else:
        champ_name = "round1_sft_core"
        champ_src_adapter = r1_adapter_dir
        champ_eval_dir = r1_dir
        champ_test_final = r1_bench["test"]
        champ_novel_final = r1_bench["novel_1500"]
        rationale = (
            f"`round1_sft_core` retained the lead on held-out `val.jsonl` "
            f"(1-retry E2E `{100.0 * r1_val_1:.2f}%` vs `{100.0 * r2_val_1:.2f}%`, "
            f"0-retry E2E `{100.0 * r1_val_0:.2f}%` vs `{100.0 * r2_val_0:.2f}%`); "
            f"`round1_sft_core` was promoted to `champion-adapter/` per the strict `val.jsonl` selection rule."
        )

    leaderboard = sorted(
        [
            {
                "round": "round0_untuned",
                "val_zero_retry_e2e": r0_summary["val_zero_retry"]["headline"]["endToEndVerifiedRate"],
                "val_one_retry_e2e": r0_summary["val_one_retry"]["headline"]["endToEndVerifiedRate"],
                "val_syllabus_alignment": r0_summary["val_zero_retry"]["headline"]["syllabusAlignmentRate"],
                "val_step1_solver_pass": r0_summary["val_zero_retry"]["headline"]["step1SolverPassRate"],
            },
            {
                "round": "round1_sft_core",
                "val_zero_retry_e2e": r1_val_0,
                "val_one_retry_e2e": r1_val_1,
                "val_syllabus_alignment": r1_summary["val_zero_retry"]["headline"]["syllabusAlignmentRate"],
                "val_step1_solver_pass": r1_summary["val_zero_retry"]["headline"]["step1SolverPassRate"],
            },
            {
                "round": "round2_warm_polish",
                "val_zero_retry_e2e": r2_val_0,
                "val_one_retry_e2e": r2_val_1,
                "val_syllabus_alignment": r2_summary["val_zero_retry"]["headline"]["syllabusAlignmentRate"],
                "val_step1_solver_pass": r2_summary["val_zero_retry"]["headline"]["step1SolverPassRate"],
            },
        ],
        key=lambda row: (row["val_one_retry_e2e"], row["val_zero_retry_e2e"]),
        reverse=True,
    )

    champion_selection = {
        "selected_round": champ_name,
        "selection_criterion": "Strictly held-out val.jsonl (645 items): (one_retry_e2e, zero_retry_e2e)",
        "selection_rationale": rationale,
        "val_leaderboard": leaderboard,
    }

    status_state["round_headlines"]["champion_test_0retry"] = champ_test_final["zero_retry"]["headline"]
    status_state["round_headlines"]["champion_test_1retry"] = champ_test_final["one_retry"]["headline"]
    status_state["round_headlines"]["champion_test_tf_step2"] = champ_test_final["teacher_forced_step2"]["headline"]
    status_state["round_headlines"]["champion_novel1500_0retry"] = champ_novel_final["zero_retry"]["headline"]
    status_state["round_headlines"]["champion_novel1500_1retry"] = champ_novel_final["one_retry"]["headline"]

    final_summary = _write_deliverables(
        champ_name=champ_name,
        champ_src_adapter=champ_src_adapter,
        champ_eval_src_dir=champ_eval_dir,
        champ_test_dict=champ_test_final,
        champ_novel_dict=champ_novel_final,
        champion_selection=champion_selection,
        rounds_payload={
            "round0": r0_summary,
            "round1": r1_summary,
            "round2": r2_summary,
        },
    )

    if "final_champion_and_novel_1500" not in status_state["completed_stages"]:
        status_state["completed_stages"].append("final_champion_and_novel_1500")
    _commit_status("completed", {"champion_round": champ_name})

    result_payload = {
        "status": "completed",
        "champion_round": champ_name,
        "selection_rationale": rationale,
        "finisher_elapsed_sec": final_summary["finisher_elapsed_sec"],
        "headlines": status_state["round_headlines"],
    }
    print(f"[FinishBudget] COMPLETE!\n{json.dumps(result_payload, indent=2)}", flush=True)
    return json.dumps(result_payload, indent=2)


@app.local_entrypoint()
def main() -> None:
    out = run_budget_finish.remote()
    print(out)
