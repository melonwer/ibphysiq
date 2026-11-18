"""100% Cloud-Detached Modal H100 Multi-Round Qwen/Qwen3.5-9B Training & Benchmark Pipeline.

Launch detached (survives laptop lid close / client disconnect):
    export CUDA_VISIBLE_DEVICES=""
    /home/d4ydy/.venvs/default/bin/modal run --detach training/qwen35/modal_autonomous_pipeline.py
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
import subprocess
import sys
import tempfile
import time
import traceback
from typing import Any

import modal

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from qwen35.modal_env import (  # noqa: E402
    BASE_MODEL_ID,
    DATA_REMOTE_DIR,
    HF_CACHE_DIR,
    RUNS_REMOTE_DIR,
    VOLUME_MOUNT,
    WORKSPACE_REMOTE_DIR,
    qwen35_image,
    vol,
)
from qwen35.report_builder import (  # noqa: E402
    build_model_card_markdown,
    build_ucas_benchmark_report_markdown,
)

app = modal.App("sixthphysics-qwen35-autonomous", image=qwen35_image)

AUTONOMOUS_DIR = f"{RUNS_REMOTE_DIR}/autonomous"
STANDARD_LORA_TARGETS = [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
]
MAX_SEQ_LEN = 4096


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s:
                rows.append(json.loads(s))
    return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def _write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _extract_domain(record: dict[str, Any]) -> str:
    if isinstance(record.get("domain"), str) and record["domain"].strip():
        return record["domain"].strip()
    meta = record.get("metadata")
    if isinstance(meta, dict) and isinstance(meta.get("domain"), str):
        return meta["domain"].strip()
    msgs = record.get("messages")
    if isinstance(msgs, list) and len(msgs) >= 2 and isinstance(msgs[1], dict):
        try:
            u = json.loads(msgs[1].get("content", "{}"))
            if isinstance(u.get("domain"), str):
                return u["domain"].strip()
        except Exception:
            pass
    return "mechanics"


def _extract_item_id(record: dict[str, Any], idx: int) -> str:
    for key in ("itemId", "id", "traceId"):
        val = record.get(key)
        if isinstance(val, str) and val.strip():
            s = val.strip()
            return s[len("trace-") :] if key == "traceId" and s.startswith("trace-") else s
    return f"item-{idx + 1}"


def build_augmented_system_prompt(
    base_system: str,
    domain: str,
    domain_schemas: dict[str, Any],
) -> str:
    """Append compact code-derived domain tool schema + 3-syllabus numeric contract."""
    dom_entry = domain_schemas.get("domains", {}).get(domain, {})
    compact_summary = dom_entry.get("compactPromptSummary", "")
    contract_block = (
        "\n\n--- DOMAIN TOOL & SYLLABUS CONTRACT ---\n"
        f"{compact_summary}\n"
        'Step 1 JSON format: {"action":"solve_and_render_scenario","domain":"'
        f"{domain}"
        '","scenarioSpec":{"kind":"..."},"hiddenQuantities":["..."],"questionPlan":{"targetSummary":"..."}}\n'
        'Step 2 MCQ JSON format: {"format":"mcq","difficulty":"...","stem":"...","options":[{"label":"A","text":"...","isCorrect":true},{"label":"B","text":"...","isCorrect":false,"distractorRationale":"..."},{"label":"C","text":"...","isCorrect":false,"distractorRationale":"..."},{"label":"D","text":"...","isCorrect":false,"distractorRationale":"..."}],"correctOptionIndex":0,"workedSolution":"...","markScheme":[{"code":"A1","criterion":"...","marks":1}],"totalMarks":1}\n'
        'Step 2 Structured JSON format: {"format":"structured","difficulty":"...","stem":"...","parts":[{"partId":"a","prompt":"...","marks":2,"expectedAnswer":"..."}],"workedSolution":"...","markScheme":[{"code":"M1","criterion":"...","marks":1},{"code":"A1","criterion":"...","marks":1}],"totalMarks":2}\n'
        "Strict rules: Output raw JSON object only (no markdown fences). "
        "IB Physics uses g = 9.8 m s^-2 and excludes retired IB 2016 topics (farad capacitance, 1/f thin-lens equation, quarks/Feynman diagrams, and HL-only quantities on SL prompts). "
        "UK A-Level and NCUK IFY use g = 9.81 m s^-2. "
        "Every numerical answer and workedSolution must match formattedQuantities3sf to 3 significant figures, sum markScheme marks to totalMarks, and never leak hiddenQuantities in the stem."
    )
    return base_system.rstrip() + contract_block


def tokenize_5turn_assistant_only(
    tokenizer: Any,
    messages: list[dict[str, str]],
    max_seq_len: int = MAX_SEQ_LEN,
) -> dict[str, list[int]] | None:
    """Tokenize 5-turn [system, user, assistant, tool, assistant] with strict assistant-only labels."""
    norm_msgs = [{"role": m["role"], "content": m["content"]} for m in messages]
    if [m["role"] for m in norm_msgs] != ["system", "user", "assistant", "tool", "assistant"]:
        return None

    p1_text = tokenizer.apply_chat_template(
        norm_msgs[:2], tokenize=False, add_generation_prompt=True, enable_thinking=False
    )
    s1_text = tokenizer.apply_chat_template(
        norm_msgs[:3], tokenize=False, add_generation_prompt=False, enable_thinking=False
    )
    p2_text = tokenizer.apply_chat_template(
        norm_msgs[:4], tokenize=False, add_generation_prompt=True, enable_thinking=False
    )
    full_text = tokenizer.apply_chat_template(
        norm_msgs[:5], tokenize=False, add_generation_prompt=False, enable_thinking=False
    )

    p1_ids = tokenizer(p1_text, add_special_tokens=False)["input_ids"]
    s1_ids = tokenizer(s1_text, add_special_tokens=False)["input_ids"]
    p2_ids = tokenizer(p2_text, add_special_tokens=False)["input_ids"]
    full_ids = tokenizer(full_text, add_special_tokens=False)["input_ids"]

    if not (
        full_ids[: len(p1_ids)] == p1_ids
        and full_ids[: len(s1_ids)] == s1_ids
        and full_ids[: len(p2_ids)] == p2_ids
    ):
        return None

    im_end_id = tokenizer.convert_tokens_to_ids("<|im_end|>")
    labels = [-100] * len(full_ids)

    s1_end = len(s1_ids)
    while s1_end > len(p1_ids) and full_ids[s1_end - 1] != im_end_id:
        s1_end -= 1
    for idx in range(len(p1_ids), s1_end):
        labels[idx] = full_ids[idx]

    s2_end = len(full_ids)
    while s2_end > len(p2_ids) and full_ids[s2_end - 1] != im_end_id:
        s2_end -= 1
    for idx in range(len(p2_ids), s2_end):
        labels[idx] = full_ids[idx]

    if len(full_ids) > max_seq_len:
        full_ids = full_ids[:max_seq_len]
        labels = labels[:max_seq_len]

    if not any(x != -100 for x in labels):
        return None

    return {"input_ids": full_ids, "labels": labels}


def tokenize_3turn_assistant_only(
    tokenizer: Any,
    messages_3turn: list[dict[str, str]],
    max_seq_len: int = MAX_SEQ_LEN,
) -> dict[str, list[int]] | None:
    """Tokenize 3-turn [system, user, assistant] (e.g. failed Step 1 DPO trajectory) with assistant-only labels."""
    norm_msgs = [{"role": m["role"], "content": m["content"]} for m in messages_3turn]
    if [m["role"] for m in norm_msgs] != ["system", "user", "assistant"]:
        return None

    p1_text = tokenizer.apply_chat_template(
        norm_msgs[:2], tokenize=False, add_generation_prompt=True, enable_thinking=False
    )
    s1_text = tokenizer.apply_chat_template(
        norm_msgs[:3], tokenize=False, add_generation_prompt=False, enable_thinking=False
    )
    p1_ids = tokenizer(p1_text, add_special_tokens=False)["input_ids"]
    full_ids = tokenizer(s1_text, add_special_tokens=False)["input_ids"]
    if full_ids[: len(p1_ids)] != p1_ids:
        return None

    im_end_id = tokenizer.convert_tokens_to_ids("<|im_end|>")
    labels = [-100] * len(full_ids)
    s1_end = len(full_ids)
    while s1_end > len(p1_ids) and full_ids[s1_end - 1] != im_end_id:
        s1_end -= 1
    for idx in range(len(p1_ids), s1_end):
        labels[idx] = full_ids[idx]

    if len(full_ids) > max_seq_len:
        full_ids = full_ids[:max_seq_len]
        labels = labels[:max_seq_len]

    if not any(x != -100 for x in labels):
        return None
    return {"input_ids": full_ids, "labels": labels}


def _run_ts_solve_step1(proposals: list[dict[str, Any]], work_dir: Path) -> dict[str, dict[str, Any]]:
    in_path = work_dir / "step1_proposals.jsonl"
    out_path = work_dir / "step1_receipts.jsonl"
    _write_jsonl(in_path, proposals)
    proc = subprocess.run(
        [
            "npx",
            "tsx",
            "scripts/benchmark/solve-step1-batch.ts",
            "--input",
            str(in_path),
            "--output",
            str(out_path),
        ],
        cwd=WORKSPACE_REMOTE_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"solve-step1-batch.ts failed (rc={proc.returncode}): {proc.stderr}")
    receipts = _read_jsonl(out_path)
    return {str(r["id"]): r for r in receipts}


def _run_ts_evaluate_rollouts(
    rollouts: list[dict[str, Any]],
    split_file: Path,
    report_out: Path,
    items_out: Path | None = None,
    rollouts_save_path: Path | None = None,
    rollouts_only: bool = False,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rollouts_path = rollouts_save_path or report_out.with_suffix(".rollouts.jsonl")
    _write_jsonl(rollouts_path, rollouts)
    eff_items_out = items_out or report_out.with_suffix(".items.jsonl")
    cmd = [
        "npx",
        "tsx",
        "scripts/benchmark/evaluate-model-rollouts.ts",
        "--rollouts",
        str(rollouts_path),
        "--split-file",
        str(split_file),
        "--output",
        str(report_out),
        "--items-output",
        str(eff_items_out),
    ]
    if rollouts_only:
        cmd.append("--rollouts-only")
    proc = subprocess.run(
        cmd,
        cwd=WORKSPACE_REMOTE_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"evaluate-model-rollouts.ts failed (rc={proc.returncode}): {proc.stderr}")
    report = json.loads(report_out.read_text(encoding="utf-8"))
    item_evals = _read_jsonl(eff_items_out) if eff_items_out.exists() else []
    if items_out is None and eff_items_out.exists():
        eff_items_out.unlink(missing_ok=True)
    if rollouts_save_path is None and rollouts_path.exists():
        rollouts_path.unlink(missing_ok=True)
    return report, item_evals


def _spawn_gpu_worker(target_fn: Any, kwargs: dict[str, Any]) -> dict[str, Any]:
    """Execute a GPU phase in an isolated 'spawn' child process so 100% of VRAM frees on exit."""
    ctx = mp.get_context("spawn")
    with tempfile.NamedTemporaryFile(prefix="sp_gpu_res_", suffix=".json", delete=False) as tf:
        result_path = Path(tf.name)
    try:
        proc = ctx.Process(target=_gpu_worker_wrapper, args=(target_fn, kwargs, str(result_path)))
        proc.start()
        proc.join()
        if proc.exitcode != 0:
            err_detail = result_path.read_text(encoding="utf-8") if result_path.exists() else "no output"
            raise RuntimeError(
                f"GPU worker {target_fn.__name__} exited with code {proc.exitcode}: {err_detail}"
            )
        return json.loads(result_path.read_text(encoding="utf-8"))
    finally:
        result_path.unlink(missing_ok=True)


def _gpu_worker_wrapper(target_fn: Any, kwargs: dict[str, Any], result_path_str: str) -> None:
    try:
        res = target_fn(**kwargs)
        Path(result_path_str).write_text(json.dumps(res), encoding="utf-8")
    except Exception as exc:
        tb = traceback.format_exc()
        Path(result_path_str).write_text(
            json.dumps({"error": repr(exc), "traceback": tb}), encoding="utf-8"
        )
        print(f"[GPU WORKER ERROR in {target_fn.__name__}]\n{tb}", file=sys.stderr, flush=True)
        raise


class _BatchInferenceEngine:
    """High-throughput batched text generator using vLLM with automatic HF bfloat16 fallback."""

    def __init__(self, model_dir: str) -> None:
        from transformers import AutoTokenizer

        self.model_dir = model_dir
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir, trust_remote_code=False)
        self.im_end_id = self.tokenizer.convert_tokens_to_ids("<|im_end|>")
        self.backend = "vllm"
        self.llm: Any = None
        self.hf_model: Any = None

        try:
            from vllm import LLM

            self.llm = LLM(
                model=model_dir,
                dtype="bfloat16",
                max_model_len=8192,
                gpu_memory_utilization=0.88,
                language_model_only=True,
                enable_prefix_caching=True,
            )
        except Exception as exc:
            print(f"[Inference] vLLM unavailable ({exc!r}); falling back to batched HF bf16.", flush=True)
            import torch
            from transformers import AutoModelForImageTextToText

            self.backend = "hf"
            self.tokenizer.padding_side = "left"
            if self.tokenizer.pad_token_id is None:
                self.tokenizer.pad_token_id = self.tokenizer.eos_token_id
            self.hf_model = AutoModelForImageTextToText.from_pretrained(
                model_dir,
                dtype=torch.bfloat16,
                device_map="cuda:0",
            )
            self.hf_model.eval()

    def format_prompt(self, messages: list[dict[str, str]]) -> str:
        return self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True, enable_thinking=False
        )

    def generate_batch(
        self,
        prompt_strs: list[str],
        temperature: float = 0.0,
        top_p: float = 0.95,
        max_tokens: int = 1024,
        seed: int = 42,
    ) -> list[str]:
        if not prompt_strs:
            return []

        if self.backend == "vllm":
            from vllm import SamplingParams

            sp = SamplingParams(
                temperature=temperature,
                top_p=top_p if temperature > 0 else 1.0,
                max_tokens=max_tokens,
                stop_token_ids=[self.im_end_id],
                seed=seed,
            )
            outs = self.llm.generate(prompt_strs, sp)
            return [o.outputs[0].text for o in outs]

        import torch

        results: list[str] = []
        batch_size = 24
        for start in range(0, len(prompt_strs), batch_size):
            chunk = prompt_strs[start : start + batch_size]
            enc = self.tokenizer(
                chunk,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=6144,
                add_special_tokens=False,
            ).to("cuda:0")
            in_len = enc["input_ids"].shape[1]
            with torch.no_grad():
                gen = self.hf_model.generate(
                    **enc,
                    max_new_tokens=max_tokens,
                    do_sample=temperature > 0.0,
                    temperature=temperature if temperature > 0.0 else None,
                    top_p=top_p if temperature > 0.0 else None,
                    eos_token_id=[self.im_end_id, self.tokenizer.eos_token_id],
                    pad_token_id=self.tokenizer.pad_token_id,
                )
            for row_idx in range(gen.shape[0]):
                new_ids = gen[row_idx][in_len:]
                results.append(self.tokenizer.decode(new_ids, skip_special_tokens=True))
        return results

    def close(self) -> None:
        import torch

        if self.llm is not None:
            del self.llm
            self.llm = None
        if self.hf_model is not None:
            del self.hf_model
            self.hf_model = None
        gc.collect()
        torch.cuda.empty_cache()


def _eval_split_on_engine(
    engine: _BatchInferenceEngine,
    split_file_str: str,
    domain_schemas: dict[str, Any],
    out_dir_str: str,
    split_prefix: str,
    include_one_retry: bool = True,
    include_teacher_forced_step2: bool = True,
    save_verified_candidates_jsonl: str | None = None,
) -> dict[str, Any]:
    """Run closed-loop 0-retry, 1-retry, and optional teacher-forced Step 2 on an active engine."""
    t0 = time.time()
    split_file = Path(split_file_str)
    out_dir = Path(out_dir_str)
    rollouts_dir = out_dir / "rollouts"
    rollouts_dir.mkdir(parents=True, exist_ok=True)

    records = _read_jsonl(split_file)

    item_ids: list[str] = []
    domains: list[str] = []
    aug_systems: list[str] = []
    user_msgs: list[dict[str, str]] = []
    step1_prompts_a1: list[str] = []

    for idx, rec in enumerate(records):
        iid = _extract_item_id(rec, idx)
        dom = _extract_domain(rec)
        base_sys = rec["messages"][0]["content"]
        user_msg = {"role": "user", "content": rec["messages"][1]["content"]}
        aug_sys = build_augmented_system_prompt(base_sys, dom, domain_schemas)

        item_ids.append(iid)
        domains.append(dom)
        aug_systems.append(aug_sys)
        user_msgs.append(user_msg)
        step1_prompts_a1.append(engine.format_prompt([{"role": "system", "content": aug_sys}, user_msg]))

    # 1. Attempt 1: Step 1 proposals (greedy temp=0.0)
    print(f"[Eval:{split_prefix}] Generating {len(step1_prompts_a1)} Step 1 proposals...", flush=True)
    step1_outs_a1 = engine.generate_batch(step1_prompts_a1, temperature=0.0, max_tokens=768, seed=42)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        proposals_a1 = [
            {"id": iid, "domain": dom, "assistantStep1Raw": raw}
            for iid, dom, raw in zip(item_ids, domains, step1_outs_a1)
        ]
        receipts_a1 = _run_ts_solve_step1(proposals_a1, tmp)

        # 2. Build Step 2 prompts for valid Step 1s + optional Teacher-Forced Step 2 prompts
        valid_indices_a1: list[int] = []
        combined_step2_prompts: list[str] = []

        for idx, iid in enumerate(item_ids):
            rec_s1 = receipts_a1.get(iid, {})
            if rec_s1.get("valid"):
                valid_indices_a1.append(idx)
                msgs_s2 = [
                    {"role": "system", "content": aug_systems[idx]},
                    user_msgs[idx],
                    {"role": "assistant", "content": step1_outs_a1[idx]},
                    {"role": "tool", "content": rec_s1["toolReceiptJson"]},
                ]
                combined_step2_prompts.append(engine.format_prompt(msgs_s2))

        tf_indices: list[int] = []
        has_gold_turns = include_teacher_forced_step2 and all(
            len(r.get("messages", [])) >= 4 for r in records
        )
        if has_gold_turns:
            for idx, rec in enumerate(records):
                tf_indices.append(idx)
                msgs_tf = [
                    {"role": "system", "content": aug_systems[idx]},
                    user_msgs[idx],
                    {"role": "assistant", "content": rec["messages"][2]["content"]},
                    {"role": "tool", "content": rec["messages"][3]["content"]},
                ]
                combined_step2_prompts.append(engine.format_prompt(msgs_tf))

        print(
            f"[Eval:{split_prefix}] Generating {len(combined_step2_prompts)} Step 2 packages "
            f"(closed-loop valid={len(valid_indices_a1)}, teacher-forced={len(tf_indices)})...",
            flush=True,
        )
        combined_step2_outs = engine.generate_batch(
            combined_step2_prompts, temperature=0.0, max_tokens=1400, seed=42
        )

        step2_map_a1: dict[int, str] = {}
        for pos, orig_idx in enumerate(valid_indices_a1):
            step2_map_a1[orig_idx] = combined_step2_outs[pos]

        rollouts_a1: list[dict[str, Any]] = []
        for idx, iid in enumerate(item_ids):
            rec_s1 = receipts_a1.get(iid, {})
            rollouts_a1.append(
                {
                    "id": iid,
                    "itemId": iid,
                    "domain": domains[idx],
                    "assistantStep1Raw": step1_outs_a1[idx],
                    "toolReceiptRaw": rec_s1.get("toolReceiptJson", ""),
                    "assistantStep2Raw": step2_map_a1.get(idx, ""),
                    "attemptsUsed": 1,
                    "mode": "zero-retry",
                }
            )

        zero_report_path = out_dir / f"{split_prefix}_zero_retry.json"
        zero_rollouts_path = rollouts_dir / f"{split_prefix}_zero_retry.jsonl"
        zero_report, zero_item_evals = _run_ts_evaluate_rollouts(
            rollouts=rollouts_a1,
            split_file=split_file,
            report_out=zero_report_path,
            rollouts_save_path=zero_rollouts_path,
        )
        zero_eval_by_id = {str(ev["id"]): ev for ev in zero_item_evals}

        tf_report: dict[str, Any] | None = None
        if has_gold_turns:
            offset = len(valid_indices_a1)
            rollouts_tf: list[dict[str, Any]] = []
            for pos, idx in enumerate(tf_indices):
                iid = item_ids[idx]
                rec = records[idx]
                rollouts_tf.append(
                    {
                        "id": iid,
                        "itemId": iid,
                        "domain": domains[idx],
                        "assistantStep1Raw": rec["messages"][2]["content"],
                        "toolReceiptRaw": rec["messages"][3]["content"],
                        "assistantStep2Raw": combined_step2_outs[offset + pos],
                        "attemptsUsed": 1,
                        "mode": "teacher-forced-step2",
                    }
                )
            tf_report_path = out_dir / f"{split_prefix}_teacher_forced_step2.json"
            tf_rollouts_path = rollouts_dir / f"{split_prefix}_teacher_forced_step2.jsonl"
            tf_report, _ = _run_ts_evaluate_rollouts(
                rollouts=rollouts_tf,
                split_file=split_file,
                report_out=tf_report_path,
                rollouts_save_path=tf_rollouts_path,
            )

        # 3. Attempt 2: Closed-loop 1-retry ONLY for items failing Attempt 1
        one_retry_report: dict[str, Any] | None = None
        final_rollouts = list(rollouts_a1)
        final_eval_by_id = dict(zero_eval_by_id)

        if include_one_retry:
            step1_retry_indices: list[int] = []
            step1_retry_prompts: list[str] = []
            step2_only_retry_indices: list[int] = []
            step2_only_retry_prompts: list[str] = []

            spec_level_syl_codes = {
                "gravity-convention-mismatch",
                "retired-ib-2016-exclusion",
                "level-leakage",
                "concept-excluded-from-syllabus",
            }

            for idx, iid in enumerate(item_ids):
                ev = zero_eval_by_id.get(iid, {})
                if ev.get("endToEndVerified"):
                    continue
                syl_issues = ev.get("syllabusIssues", []) or []
                syl_codes = {str(si.get("code", "")) for si in syl_issues if isinstance(si, dict)}
                needs_step1_retry = (not ev.get("step1SolverPass")) or bool(
                    syl_codes & spec_level_syl_codes
                )

                if needs_step1_retry:
                    rec_s1 = receipts_a1.get(iid, {})
                    feedback = {
                        "status": "error",
                        "errorStage": rec_s1.get("errorStage", "syllabus-or-solver"),
                        "errorMessage": rec_s1.get("errorMessage", ""),
                        "syllabusIssues": [si.get("message", "") for si in syl_issues[:3]],
                        "instruction": (
                            "Emit ONLY a corrected Step 1 JSON object with valid scenarioSpec, "
                            "non-empty hiddenQuantities, questionPlan, and exact syllabus gravity convention."
                        ),
                    }
                    retry_user = {
                        "role": "user",
                        "content": (
                            f"{user_msgs[idx]['content']}\n\n"
                            f"PREVIOUS_ATTEMPT_DIAGNOSTIC: {json.dumps(feedback, ensure_ascii=False)}"
                        ),
                    }
                    step1_retry_indices.append(idx)
                    step1_retry_prompts.append(
                        engine.format_prompt([{"role": "system", "content": aug_systems[idx]}, retry_user])
                    )
                else:
                    rec_s1 = receipts_a1[iid]
                    gate_issues = ev.get("gateIssues", []) or []
                    diag = {
                        "gateIssues": [gi.get("message", "") for gi in gate_issues[:4]],
                        "syllabusIssues": [si.get("message", "") for si in syl_issues[:3]],
                        "instruction": (
                            "Re-author ONLY the Step 2 JSON question package so all numerical answers and "
                            "workedSolution match formattedQuantities3sf to 3 significant figures, all 4 MCQ "
                            "options are distinct with distractorRationales, marks sum to totalMarks, and "
                            "gravity/syllabus rules are respected."
                        ),
                    }
                    augmented_receipt = json.loads(rec_s1["toolReceiptJson"])
                    augmented_receipt["retryFeedback"] = diag
                    msgs_retry_s2 = [
                        {"role": "system", "content": aug_systems[idx]},
                        user_msgs[idx],
                        {"role": "assistant", "content": step1_outs_a1[idx]},
                        {"role": "tool", "content": json.dumps(augmented_receipt, ensure_ascii=False)},
                    ]
                    step2_only_retry_indices.append(idx)
                    step2_only_retry_prompts.append(engine.format_prompt(msgs_retry_s2))

            repaired_rollouts_by_idx: dict[int, dict[str, Any]] = {}

            if step1_retry_prompts:
                print(
                    f"[Eval:{split_prefix}] 1-retry regenerating {len(step1_retry_prompts)} Step 1 proposals...",
                    flush=True,
                )
                s1_retry_outs = engine.generate_batch(
                    step1_retry_prompts, temperature=0.25, max_tokens=768, seed=101
                )
                proposals_a2 = [
                    {"id": item_ids[idx], "domain": domains[idx], "assistantStep1Raw": raw}
                    for idx, raw in zip(step1_retry_indices, s1_retry_outs)
                ]
                receipts_a2 = _run_ts_solve_step1(proposals_a2, tmp)

                s1_retry_valid_indices: list[int] = []
                s1_retry_s2_prompts: list[str] = []
                s1_retry_raw_by_idx = dict(zip(step1_retry_indices, s1_retry_outs))

                for idx in step1_retry_indices:
                    iid = item_ids[idx]
                    r2 = receipts_a2.get(iid, {})
                    if r2.get("valid"):
                        s1_retry_valid_indices.append(idx)
                        msgs_s2 = [
                            {"role": "system", "content": aug_systems[idx]},
                            user_msgs[idx],
                            {"role": "assistant", "content": s1_retry_raw_by_idx[idx]},
                            {"role": "tool", "content": r2["toolReceiptJson"]},
                        ]
                        s1_retry_s2_prompts.append(engine.format_prompt(msgs_s2))
                    else:
                        repaired_rollouts_by_idx[idx] = {
                            "id": iid,
                            "itemId": iid,
                            "domain": domains[idx],
                            "assistantStep1Raw": s1_retry_raw_by_idx[idx],
                            "toolReceiptRaw": "",
                            "assistantStep2Raw": "",
                            "attemptsUsed": 2,
                            "mode": "one-retry",
                        }

                if s1_retry_s2_prompts:
                    s1_retry_s2_outs = engine.generate_batch(
                        s1_retry_s2_prompts, temperature=0.15, max_tokens=1400, seed=102
                    )
                    for idx, s2_raw in zip(s1_retry_valid_indices, s1_retry_s2_outs):
                        iid = item_ids[idx]
                        repaired_rollouts_by_idx[idx] = {
                            "id": iid,
                            "itemId": iid,
                            "domain": domains[idx],
                            "assistantStep1Raw": s1_retry_raw_by_idx[idx],
                            "toolReceiptRaw": receipts_a2[iid]["toolReceiptJson"],
                            "assistantStep2Raw": s2_raw,
                            "attemptsUsed": 2,
                            "mode": "one-retry",
                        }

            if step2_only_retry_prompts:
                print(
                    f"[Eval:{split_prefix}] 1-retry regenerating {len(step2_only_retry_prompts)} Step 2 packages...",
                    flush=True,
                )
                s2_retry_outs = engine.generate_batch(
                    step2_only_retry_prompts, temperature=0.25, max_tokens=1400, seed=103
                )
                for idx, s2_raw in zip(step2_only_retry_indices, s2_retry_outs):
                    iid = item_ids[idx]
                    repaired_rollouts_by_idx[idx] = {
                        "id": iid,
                        "itemId": iid,
                        "domain": domains[idx],
                        "assistantStep1Raw": step1_outs_a1[idx],
                        "toolReceiptRaw": receipts_a1[iid]["toolReceiptJson"],
                        "assistantStep2Raw": s2_raw,
                        "attemptsUsed": 2,
                        "mode": "one-retry",
                    }

            if repaired_rollouts_by_idx:
                subset_rollouts = [repaired_rollouts_by_idx[i] for i in sorted(repaired_rollouts_by_idx)]
                _, subset_evals = _run_ts_evaluate_rollouts(
                    rollouts=subset_rollouts,
                    split_file=split_file,
                    report_out=tmp / "retry_subset_report.json",
                    rollouts_only=True,
                )
                subset_eval_by_id = {str(ev["id"]): ev for ev in subset_evals}

                for idx, cand_rollout in repaired_rollouts_by_idx.items():
                    iid = item_ids[idx]
                    old_ev = zero_eval_by_id.get(iid, {})
                    new_ev = subset_eval_by_id.get(iid, {})
                    # Adopt Attempt 2 if it achieves endToEndVerified or strictly improves stage progression
                    old_rank = (
                        int(bool(old_ev.get("endToEndVerified"))),
                        int(bool(old_ev.get("step2AuthorGatePass"))),
                        int(bool(old_ev.get("step1SolverPass"))),
                        int(bool(old_ev.get("step1JsonValid"))),
                    )
                    new_rank = (
                        int(bool(new_ev.get("endToEndVerified"))),
                        int(bool(new_ev.get("step2AuthorGatePass"))),
                        int(bool(new_ev.get("step1SolverPass"))),
                        int(bool(new_ev.get("step1JsonValid"))),
                    )
                    if new_rank >= old_rank:
                        final_rollouts[idx] = cand_rollout
                    else:
                        kept = dict(rollouts_a1[idx])
                        kept["attemptsUsed"] = 2
                        kept["mode"] = "one-retry"
                        final_rollouts[idx] = kept

            one_report_path = out_dir / f"{split_prefix}_one_retry.json"
            one_rollouts_path = rollouts_dir / f"{split_prefix}_one_retry.jsonl"
            one_retry_report, one_item_evals = _run_ts_evaluate_rollouts(
                rollouts=final_rollouts,
                split_file=split_file,
                report_out=one_report_path,
                rollouts_save_path=one_rollouts_path,
            )
            final_eval_by_id = {str(ev["id"]): ev for ev in one_item_evals}

        if save_verified_candidates_jsonl:
            verified_rows = []
            for r in final_rollouts:
                iid = str(r["id"])
                ev = final_eval_by_id.get(iid, {})
                if ev.get("endToEndVerified"):
                    verified_rows.append({"rollout": r, "evaluation": ev})
            _write_jsonl(Path(save_verified_candidates_jsonl), verified_rows)

    return {
        "elapsed_sec": round(time.time() - t0, 2),
        "zero_retry": zero_report,
        "one_retry": one_retry_report,
        "teacher_forced_step2": tf_report,
    }


def _closed_loop_eval_worker(
    model_dir: str,
    split_file_str: str,
    domain_schemas_path_str: str,
    out_dir_str: str,
    split_prefix: str,
    include_one_retry: bool = True,
    include_teacher_forced_step2: bool = True,
    save_verified_candidates_jsonl: str | None = None,
) -> dict[str, Any]:
    domain_schemas = json.loads(Path(domain_schemas_path_str).read_text(encoding="utf-8"))
    engine = _BatchInferenceEngine(model_dir)
    try:
        return _eval_split_on_engine(
            engine=engine,
            split_file_str=split_file_str,
            domain_schemas=domain_schemas,
            out_dir_str=out_dir_str,
            split_prefix=split_prefix,
            include_one_retry=include_one_retry,
            include_teacher_forced_step2=include_teacher_forced_step2,
            save_verified_candidates_jsonl=save_verified_candidates_jsonl,
        )
    finally:
        engine.close()


def _multi_split_eval_worker(
    model_dir: str,
    domain_schemas_path_str: str,
    split_specs: list[dict[str, Any]],
    conditional_r1_val_tuple: list[float] | None = None,
) -> dict[str, Any]:
    """Evaluate multiple splits in ONE vLLM session (optionally gating test+novel on beating r1 val)."""
    domain_schemas = json.loads(Path(domain_schemas_path_str).read_text(encoding="utf-8"))
    engine = _BatchInferenceEngine(model_dir)
    results: dict[str, Any] = {}
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
                        f"[Eval] Skipping {prefix}: warm-start val ({r2_1:.4f}, {r2_0:.4f}) "
                        f"did not beat Round 1 ({conditional_r1_val_tuple[0]:.4f}, {conditional_r1_val_tuple[1]:.4f}).",
                        flush=True,
                    )
                    continue
            results[prefix] = _eval_split_on_engine(
                engine=engine,
                split_file_str=str(spec["split_file_str"]),
                domain_schemas=domain_schemas,
                out_dir_str=str(spec["out_dir_str"]),
                split_prefix=prefix,
                include_one_retry=bool(spec.get("include_one_retry", True)),
                include_teacher_forced_step2=bool(spec.get("include_teacher_forced_step2", True)),
                save_verified_candidates_jsonl=spec.get("save_verified_candidates_jsonl"),
            )
        return results
    finally:
        engine.close()


def _warmstart_polish_sft_worker(
    base_model_dir: str,
    init_adapter_dir_str: str,
    train_traces_path_str: str,
    domain_schemas_path_str: str,
    adapter_out_dir_str: str,
    merged_out_dir_str: str,
    round_label: str = "r2-warmstart-polish",
    max_steps: int = 140,
    max_wall_sec: float = 1020.0,
    lr: float = 4e-5,
    micro_batch_size: int = 4,
    grad_accum_steps: int = 4,
    seed: int = 1337,
) -> dict[str, Any]:
    """Warm-start directly from Round 1 LoRA adapter for bounded curriculum polish."""
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    import torch
    import torch.nn.functional as F
    from torch.utils.checkpoint import checkpoint as grad_ckpt
    from peft import PeftModel
    from transformers import AutoModelForImageTextToText, AutoTokenizer

    t0 = time.time()
    random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

    domain_schemas = json.loads(Path(domain_schemas_path_str).read_text(encoding="utf-8"))
    raw_traces = _read_jsonl(Path(train_traces_path_str))

    try:
        import transformers.models.qwen3_5.modeling_qwen3_5 as _q35_mod
        from fla.ops.gated_delta_rule import chunk_gated_delta_rule as _fla_chunk_gdr

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
    except Exception:
        pass

    tokenizer = AutoTokenizer.from_pretrained(base_model_dir, trust_remote_code=False)
    pad_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id

    needed_examples = max_steps * micro_batch_size * grad_accum_steps
    tokenized_examples: list[dict[str, list[int]]] = []
    for tr in raw_traces[: needed_examples + 64]:
        dom = _extract_domain(tr)
        msgs = [dict(m) for m in tr["messages"]]
        msgs[0]["content"] = build_augmented_system_prompt(msgs[0]["content"], dom, domain_schemas)
        tok = tokenize_5turn_assistant_only(tokenizer, msgs, max_seq_len=MAX_SEQ_LEN)
        if tok is not None:
            tokenized_examples.append(tok)
        if len(tokenized_examples) >= needed_examples:
            break

    print(
        f"[{round_label}] Tokenized {len(tokenized_examples)} targeted warm-start traces. Loading Round 1 adapter...",
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
    for name, p in peft_model.named_parameters():
        if "visual" in name and p.requires_grad:
            p.requires_grad_(False)
    peft_model.train()

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

    optimizer = torch.optim.AdamW(
        [p for p in peft_model.parameters() if p.requires_grad],
        lr=lr,
        betas=(0.9, 0.95),
        weight_decay=0.01,
        fused=True,
    )

    warmup_steps = max(1, int(0.08 * max_steps))
    optimizer.zero_grad(set_to_none=True)
    opt_step = 0
    micro_count = 0
    running_loss = 0.0
    loss_history: list[dict[str, Any]] = []

    for start in range(0, len(tokenized_examples), micro_batch_size):
        if opt_step >= max_steps:
            break
        batch_items = tokenized_examples[start : start + micro_batch_size]
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
        micro_count += 1

        if micro_count % grad_accum_steps == 0:
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
            if opt_step % 20 == 0 or opt_step == max_steps or elapsed_now >= max_wall_sec:
                rec = {
                    "step": opt_step,
                    "max_steps": max_steps,
                    "loss": round(running_loss / max(1, micro_count), 4),
                    "grad_norm": round(gn, 4),
                    "lr": round(cur_lr, 7),
                    "peak_vram_gb": round(torch.cuda.max_memory_allocated(0) / (1024**3), 2),
                    "elapsed_sec": round(elapsed_now, 1),
                }
                loss_history.append(rec)
                print(f"[{round_label}] {rec}", flush=True)
                running_loss = 0.0
                micro_count = 0

            if elapsed_now >= max_wall_sec:
                print(
                    f"[{round_label}] Reached wall-clock budget cap ({elapsed_now:.1f}s) cleanly at step {opt_step}.",
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
        "steps_completed": opt_step,
        "lr": lr,
        "loss_history": loss_history,
    }


def _sft_train_worker(
    base_model_dir: str,
    train_traces_path_str: str,
    domain_schemas_path_str: str,
    adapter_out_dir_str: str,
    merged_out_dir_str: str,
    live_status_path_str: str,
    round_label: str,
    lora_r: int,
    lora_alpha: int,
    num_epochs: int,
    lr: float,
    micro_batch_size: int = 4,
    grad_accum_steps: int = 4,
    seed: int = 42,
) -> dict[str, Any]:
    """Train bf16 LoRA with frozen vision tower and sparse assistant-only lm_head cross-entropy."""
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    import torch
    import torch.nn.functional as F
    from torch.utils.checkpoint import checkpoint as grad_ckpt
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForImageTextToText, AutoTokenizer

    t0 = time.time()
    random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

    domain_schemas = json.loads(Path(domain_schemas_path_str).read_text(encoding="utf-8"))
    raw_traces = _read_jsonl(Path(train_traces_path_str))

    # Bind fla Triton chunk_gated_delta_rule directly (verified max_diff=0.00000, ~2x step speedup)
    try:
        import transformers.models.qwen3_5.modeling_qwen3_5 as _q35_mod
        from fla.ops.gated_delta_rule import chunk_gated_delta_rule as _fla_chunk_gdr

        _orig_gdr = _q35_mod.torch_chunk_gated_delta_rule

        def _fast_gdr(
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

        _q35_mod.torch_chunk_gated_delta_rule = _fast_gdr
    except Exception as exc:
        print(f"[{round_label}] fla direct binding skipped ({exc!r})", flush=True)

    tokenizer = AutoTokenizer.from_pretrained(base_model_dir, trust_remote_code=False)
    pad_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id

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

    print(
        f"[{round_label}] Tokenized {len(tokenized_examples)} traces (skipped={skipped}). Loading bf16 model...",
        flush=True,
    )

    model = AutoModelForImageTextToText.from_pretrained(
        base_model_dir,
        dtype=torch.bfloat16,
        device_map="cuda:0",
    )
    if hasattr(model, "model") and hasattr(model.model, "visual"):
        model.model.visual.requires_grad_(False)

    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.enable_input_require_grads()

    lora_cfg = LoraConfig(
        r=lora_r,
        lora_alpha=lora_alpha,
        lora_dropout=0.05,
        bias="none",
        target_modules=STANDARD_LORA_TARGETS,
        exclude_modules=r".*(visual|mtp).*",
        task_type="CAUSAL_LM",
    )
    peft_model = get_peft_model(model, lora_cfg)
    peft_model.train()

    core_vlm = peft_model.get_base_model()
    lm_head = core_vlm.get_output_embeddings()

    def _chunk_ce_sum(c_hidden: torch.Tensor, c_targets: torch.Tensor) -> torch.Tensor:
        return F.cross_entropy(lm_head(c_hidden).float(), c_targets, reduction="sum")

    def _sparse_assistant_ce_loss(
        in_ids: torch.Tensor,
        amask: torch.Tensor,
        lbls: torch.Tensor,
    ) -> torch.Tensor:
        backbone_out = core_vlm.model(
            input_ids=in_ids,
            attention_mask=amask,
            use_cache=False,
        )
        hidden = (
            backbone_out.last_hidden_state
            if hasattr(backbone_out, "last_hidden_state")
            else backbone_out[0]
        )
        shift_h = hidden[:, :-1, :]
        shift_y = lbls[:, 1:]
        valid_mask = shift_y != -100
        act_h = shift_h[valid_mask]
        act_y = shift_y[valid_mask]
        total_act = int(act_y.numel())
        if total_act == 0:
            return hidden.sum() * 0.0
        chunk_sums: list[torch.Tensor] = []
        for c_idx in range(0, total_act, 512):
            sub_h = act_h[c_idx : c_idx + 512]
            sub_y = act_y[c_idx : c_idx + 512]
            chunk_sums.append(grad_ckpt(_chunk_ce_sum, sub_h, sub_y, use_reentrant=False))
        return torch.stack(chunk_sums).sum() / float(total_act)

    # Step-0 mathematical equivalence self-check on a tiny 64-token slice (<120 MiB)
    with torch.no_grad():
        sample0 = tokenized_examples[0]["input_ids"][:64]
        t_in = torch.tensor([sample0], dtype=torch.long, device="cuda:0")
        t_am = torch.ones_like(t_in)
        t_lb = torch.full_like(t_in, -100)
        t_lb[:, -16:] = t_in[:, -16:]
        ref_full_loss = float(
            peft_model(input_ids=t_in, attention_mask=t_am, labels=t_lb, use_cache=False)
            .loss.detach()
            .cpu()
            .item()
        )
        sparse_chk_loss = float(_sparse_assistant_ce_loss(t_in, t_am, t_lb).detach().cpu().item())
        loss_diff = abs(ref_full_loss - sparse_chk_loss)
        print(
            f"[{round_label}] Sparse lm_head equivalence verified: "
            f"full={ref_full_loss:.5f}, sparse={sparse_chk_loss:.5f}, diff={loss_diff:.6f}",
            flush=True,
        )
        if loss_diff > 1e-2:
            raise AssertionError(
                f"Sparse lm_head loss diverged from full ForCausalLMLoss: {ref_full_loss} vs {sparse_chk_loss}"
            )

    trainable_params = 0
    total_params = 0
    visual_trainable = 0
    for name, p in peft_model.named_parameters():
        total_params += p.numel()
        if p.requires_grad:
            trainable_params += p.numel()
            if "visual" in name:
                visual_trainable += p.numel()
    if visual_trainable != 0:
        raise AssertionError(f"Vision tower leaked {visual_trainable} trainable parameters!")

    optimizer = torch.optim.AdamW(
        [p for p in peft_model.parameters() if p.requires_grad],
        lr=lr,
        betas=(0.9, 0.95),
        weight_decay=0.01,
        fused=True,
    )

    steps_per_epoch = math.ceil(len(tokenized_examples) / (micro_batch_size * grad_accum_steps))
    total_opt_steps = max(1, steps_per_epoch * num_epochs)
    warmup_steps = max(1, int(0.05 * total_opt_steps))

    def _lr_at_step(step_idx: int) -> float:
        if step_idx < warmup_steps:
            return lr * float(step_idx + 1) / float(warmup_steps)
        progress = float(step_idx - warmup_steps) / float(max(1, total_opt_steps - warmup_steps))
        cosine = 0.5 * (1.0 + math.cos(math.pi * min(1.0, progress)))
        return lr * (0.1 + 0.9 * cosine)

    loss_history: list[dict[str, Any]] = []
    global_opt_step = 0
    rng = random.Random(seed)

    for epoch in range(num_epochs):
        indices = list(range(len(tokenized_examples)))
        rng.shuffle(indices)
        optimizer.zero_grad(set_to_none=True)
        running_loss = 0.0
        micro_count = 0

        for start in range(0, len(indices), micro_batch_size):
            batch_idxs = indices[start : start + micro_batch_size]
            batch_items = [tokenized_examples[i] for i in batch_idxs]
            max_len = max(len(x["input_ids"]) for x in batch_items)

            input_ids = torch.full((len(batch_items), max_len), pad_id, dtype=torch.long, device="cuda:0")
            labels = torch.full((len(batch_items), max_len), -100, dtype=torch.long, device="cuda:0")
            attn_mask = torch.zeros((len(batch_items), max_len), dtype=torch.long, device="cuda:0")

            for r_i, item in enumerate(batch_items):
                L = len(item["input_ids"])
                input_ids[r_i, :L] = torch.tensor(item["input_ids"], dtype=torch.long, device="cuda:0")
                labels[r_i, :L] = torch.tensor(item["labels"], dtype=torch.long, device="cuda:0")
                attn_mask[r_i, :L] = 1

            raw_loss = _sparse_assistant_ce_loss(input_ids, attn_mask, labels)
            loss = raw_loss / grad_accum_steps
            loss.backward()
            running_loss += float(raw_loss.detach().cpu().item())
            micro_count += 1

            is_last_batch = (start + micro_batch_size) >= len(indices)
            if micro_count % grad_accum_steps == 0 or is_last_batch:
                cur_lr = _lr_at_step(global_opt_step)
                for pg in optimizer.param_groups:
                    pg["lr"] = cur_lr
                grad_norm = float(
                    torch.nn.utils.clip_grad_norm_(
                        [p for p in peft_model.parameters() if p.requires_grad], 1.0
                    )
                    .detach()
                    .cpu()
                    .item()
                )
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                global_opt_step += 1

                if global_opt_step % 25 == 0 or is_last_batch:
                    avg_loss = running_loss / max(1, micro_count)
                    peak_mem_gb = round(torch.cuda.max_memory_allocated(0) / (1024**3), 2)
                    rec = {
                        "step": global_opt_step,
                        "total_steps": total_opt_steps,
                        "epoch": epoch + 1,
                        "loss": round(avg_loss, 4),
                        "grad_norm": round(grad_norm, 4),
                        "lr": round(cur_lr, 7),
                        "peak_vram_gb": peak_mem_gb,
                        "elapsed_sec": round(time.time() - t0, 1),
                    }
                    loss_history.append(rec)
                    print(f"[{round_label}] {rec}", flush=True)
                    running_loss = 0.0
                    micro_count = 0

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
    del model
    gc.collect()
    torch.cuda.empty_cache()

    return {
        "round": round_label,
        "elapsed_sec": round(time.time() - t0, 2),
        "num_examples": len(tokenized_examples),
        "num_epochs": num_epochs,
        "lora_r": lora_r,
        "lora_alpha": lora_alpha,
        "lr": lr,
        "trainable_params": trainable_params,
        "total_params": total_params,
        "trainable_pct": round(100.0 * trainable_params / total_params, 4),
        "trainable_visual_params": visual_trainable,
        "total_opt_steps": global_opt_step,
        "initial_loss": loss_history[0]["loss"] if loss_history else None,
        "final_loss": loss_history[-1]["loss"] if loss_history else None,
        "loss_history": loss_history,
        "live_status_ref": live_status_path_str,
    }


def _r3_sample_and_grade_rollouts_worker(
    merged_r2_dir_str: str,
    train_subset_path_str: str,
    domain_schemas_path_str: str,
    out_dir_str: str,
    k_samples: int = 4,
    temperature: float = 0.6,
) -> dict[str, Any]:
    """Sample K=4 rollouts (temp=0.6) across 1,200 train-only prompts and build solver-verified DPO + RFT sets."""
    t0 = time.time()
    train_subset_path = Path(train_subset_path_str)
    out_dir = Path(out_dir_str)
    out_dir.mkdir(parents=True, exist_ok=True)

    domain_schemas = json.loads(Path(domain_schemas_path_str).read_text(encoding="utf-8"))
    prompts_records = _read_jsonl(train_subset_path)

    engine = _BatchInferenceEngine(merged_r2_dir_str)

    # Expand N prompts x K=4
    expanded_meta: list[tuple[int, int, str, str, str, dict[str, str]]] = []
    step1_prompts: list[str] = []

    for idx, rec in enumerate(prompts_records):
        iid = _extract_item_id(rec, idx)
        dom = _extract_domain(rec)
        aug_sys = build_augmented_system_prompt(rec["messages"][0]["content"], dom, domain_schemas)
        user_msg = {"role": "user", "content": rec["messages"][1]["content"]}
        p_str = engine.format_prompt([{"role": "system", "content": aug_sys}, user_msg])
        for k in range(k_samples):
            rid = f"{iid}__k{k}"
            expanded_meta.append((idx, k, rid, iid, dom, user_msg))
            step1_prompts.append(p_str)

    print(f"[R3-Rollouts] Sampling {len(step1_prompts)} Step 1 proposals (K={k_samples}, T={temperature})...", flush=True)
    step1_outs = engine.generate_batch(
        step1_prompts, temperature=temperature, top_p=0.95, max_tokens=768, seed=303
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        proposals = [
            {"id": rid, "domain": dom, "assistantStep1Raw": raw}
            for (_, _, rid, _, dom, _), raw in zip(expanded_meta, step1_outs)
        ]
        receipts = _run_ts_solve_step1(proposals, tmp)

        valid_positions: list[int] = []
        step2_prompts: list[str] = []
        for pos, (orig_idx, _, rid, _, dom, user_msg) in enumerate(expanded_meta):
            rec_s1 = receipts.get(rid, {})
            if rec_s1.get("valid"):
                aug_sys = build_augmented_system_prompt(
                    prompts_records[orig_idx]["messages"][0]["content"], dom, domain_schemas
                )
                msgs_s2 = [
                    {"role": "system", "content": aug_sys},
                    user_msg,
                    {"role": "assistant", "content": step1_outs[pos]},
                    {"role": "tool", "content": rec_s1["toolReceiptJson"]},
                ]
                valid_positions.append(pos)
                step2_prompts.append(engine.format_prompt(msgs_s2))

        print(f"[R3-Rollouts] Sampling {len(step2_prompts)} Step 2 packages...", flush=True)
        step2_outs = engine.generate_batch(
            step2_prompts, temperature=temperature, top_p=0.95, max_tokens=1400, seed=304
        )
        step2_by_pos = dict(zip(valid_positions, step2_outs))

        all_rollouts: list[dict[str, Any]] = []
        for pos, (_, _, rid, iid, dom, _) in enumerate(expanded_meta):
            rec_s1 = receipts.get(rid, {})
            all_rollouts.append(
                {
                    "id": rid,
                    "itemId": iid,
                    "domain": dom,
                    "assistantStep1Raw": step1_outs[pos],
                    "toolReceiptRaw": rec_s1.get("toolReceiptJson", ""),
                    "assistantStep2Raw": step2_by_pos.get(pos, ""),
                    "attemptsUsed": 1,
                    "mode": "r3-k4-sample",
                }
            )

        grading_report_path = out_dir / "r3_rollout_grading_summary.json"
        grading_report, eval_items = _run_ts_evaluate_rollouts(
            rollouts=all_rollouts,
            split_file=train_subset_path,
            report_out=grading_report_path,
            rollouts_only=True,
        )

    engine.close()

    eval_by_rid = {str(ev["id"]): ev for ev in eval_items}
    rollout_by_rid = {str(r["id"]): r for r in all_rollouts}

    # Group by prompt item_id to build solver-verified DPO pairs + RFT traces
    dpo_pairs: list[dict[str, Any]] = []
    rft_traces: list[dict[str, Any]] = []
    rollout_vs_rollout_count = 0
    gold_vs_failure_count = 0
    verified_rollouts_count = 0

    for idx, gold_rec in enumerate(prompts_records):
        iid = _extract_item_id(gold_rec, idx)
        dom = _extract_domain(gold_rec)
        base_sys = gold_rec["messages"][0]["content"]
        user_content = gold_rec["messages"][1]["content"]

        chosen_candidates: list[dict[str, Any]] = []
        rejected_step2_candidates: list[dict[str, Any]] = []
        rejected_step1_candidates: list[dict[str, Any]] = []

        for k in range(k_samples):
            rid = f"{iid}__k{k}"
            r = rollout_by_rid[rid]
            ev = eval_by_rid.get(rid, {})
            if ev.get("endToEndVerified"):
                verified_rollouts_count += 1
                msgs_5 = [
                    {"role": "system", "content": base_sys},
                    {"role": "user", "content": user_content},
                    {"role": "assistant", "content": r["assistantStep1Raw"]},
                    {"role": "tool", "content": r["toolReceiptRaw"]},
                    {"role": "assistant", "content": r["assistantStep2Raw"]},
                ]
                chosen_candidates.append({"messages": msgs_5, "domain": dom})
                if len(chosen_candidates) == 1:
                    rft_traces.append({"messages": msgs_5, "domain": dom, "itemId": iid})
            elif ev.get("step1SolverPass") and r.get("assistantStep2Raw"):
                msgs_rej_5 = [
                    {"role": "system", "content": base_sys},
                    {"role": "user", "content": user_content},
                    {"role": "assistant", "content": r["assistantStep1Raw"]},
                    {"role": "tool", "content": r["toolReceiptRaw"]},
                    {"role": "assistant", "content": r["assistantStep2Raw"]},
                ]
                rejected_step2_candidates.append({"messages": msgs_rej_5, "domain": dom})
            elif r.get("assistantStep1Raw"):
                msgs_rej_3 = [
                    {"role": "system", "content": base_sys},
                    {"role": "user", "content": user_content},
                    {"role": "assistant", "content": r["assistantStep1Raw"]},
                ]
                rejected_step1_candidates.append({"messages": msgs_rej_3, "domain": dom})

        if chosen_candidates and (rejected_step2_candidates or rejected_step1_candidates):
            best_chosen = chosen_candidates[0]
            if rejected_step2_candidates:
                dpo_pairs.append(
                    {
                        "pair_type": "rollout_vs_rollout_5turn",
                        "domain": dom,
                        "itemId": iid,
                        "chosen_messages": best_chosen["messages"],
                        "rejected_messages": rejected_step2_candidates[0]["messages"],
                    }
                )
                rollout_vs_rollout_count += 1
            elif rejected_step1_candidates:
                # 3-turn Step 1 DPO pair: verified rollout Step 1 vs solver-failed rollout Step 1
                dpo_pairs.append(
                    {
                        "pair_type": "rollout_vs_rollout_3turn_step1",
                        "domain": dom,
                        "itemId": iid,
                        "chosen_messages": best_chosen["messages"][:3],
                        "rejected_messages": rejected_step1_candidates[0]["messages"],
                    }
                )
                rollout_vs_rollout_count += 1
        elif not chosen_candidates and (rejected_step2_candidates or rejected_step1_candidates):
            # All 4 rollouts failed on this hard train prompt -> pair gold train trace vs failure
            gold_msgs = [{"role": m["role"], "content": m["content"]} for m in gold_rec["messages"]]
            if rejected_step2_candidates:
                dpo_pairs.append(
                    {
                        "pair_type": "gold_vs_failure_5turn",
                        "domain": dom,
                        "itemId": iid,
                        "chosen_messages": gold_msgs,
                        "rejected_messages": rejected_step2_candidates[0]["messages"],
                    }
                )
            else:
                dpo_pairs.append(
                    {
                        "pair_type": "gold_vs_failure_3turn_step1",
                        "domain": dom,
                        "itemId": iid,
                        "chosen_messages": gold_msgs[:3],
                        "rejected_messages": rejected_step1_candidates[0]["messages"],
                    }
                )
            gold_vs_failure_count += 1

    dpo_pairs_path = out_dir / "dpo_pairs.jsonl"
    rft_traces_path = out_dir / "rft_verified_traces.jsonl"
    _write_jsonl(dpo_pairs_path, dpo_pairs)
    _write_jsonl(rft_traces_path, rft_traces)

    summary = {
        "elapsed_sec": round(time.time() - t0, 2),
        "prompts_sampled": len(prompts_records),
        "k_samples": k_samples,
        "temperature": temperature,
        "total_rollouts_graded": len(all_rollouts),
        "verified_rollouts_count": verified_rollouts_count,
        "rollout_verified_rate": round(verified_rollouts_count / max(1, len(all_rollouts)), 6),
        "rft_unique_verified_traces": len(rft_traces),
        "dpo_pairs_count": len(dpo_pairs),
        "rollout_vs_rollout_pairs": rollout_vs_rollout_count,
        "gold_vs_hard_failure_pairs": gold_vs_failure_count,
        "rollout_headline": grading_report.get("headline", {}),
    }
    _write_json(out_dir / "dpo_pairs_summary.json", summary)
    return summary


def _dpo_rft_train_worker(
    base_model_dir: str,
    r2_adapter_dir_str: str,
    dpo_pairs_path_str: str,
    domain_schemas_path_str: str,
    adapter_out_dir_str: str,
    merged_out_dir_str: str,
    beta: float = 0.1,
    lr: float = 5e-6,
    rft_anchor_weight: float = 0.1,
    seed: int = 42,
) -> dict[str, Any]:
    """Run solver-verified DPO (beta=0.1, lr=5e-6) + RFT anchor continuing from Round 2 PeftModel."""
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    import torch
    import torch.nn.functional as F
    from torch.utils.checkpoint import checkpoint as grad_ckpt
    from peft import PeftModel
    from transformers import AutoModelForImageTextToText, AutoTokenizer

    t0 = time.time()
    random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

    domain_schemas = json.loads(Path(domain_schemas_path_str).read_text(encoding="utf-8"))
    raw_pairs = _read_jsonl(Path(dpo_pairs_path_str))

    try:
        import transformers.models.qwen3_5.modeling_qwen3_5 as _q35_mod
        from fla.ops.gated_delta_rule import chunk_gated_delta_rule as _fla_chunk_gdr

        def _fast_dpo_gdr(
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

        _q35_mod.torch_chunk_gated_delta_rule = _fast_dpo_gdr
    except Exception:
        pass
    tokenizer = AutoTokenizer.from_pretrained(base_model_dir, trust_remote_code=False)
    pad_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id

    def _tok_traj(msgs: list[dict[str, str]], dom: str) -> dict[str, list[int]] | None:
        m_copy = [dict(m) for m in msgs]
        m_copy[0]["content"] = build_augmented_system_prompt(m_copy[0]["content"], dom, domain_schemas)
        if len(m_copy) == 5:
            return tokenize_5turn_assistant_only(tokenizer, m_copy, max_seq_len=MAX_SEQ_LEN)
        if len(m_copy) == 3:
            return tokenize_3turn_assistant_only(tokenizer, m_copy, max_seq_len=MAX_SEQ_LEN)
        return None

    tokenized_pairs: list[dict[str, Any]] = []
    for p in raw_pairs:
        dom = str(p.get("domain", "mechanics"))
        ch_tok = _tok_traj(p["chosen_messages"], dom)
        rj_tok = _tok_traj(p["rejected_messages"], dom)
        if ch_tok is not None and rj_tok is not None:
            tokenized_pairs.append({"chosen": ch_tok, "rejected": rj_tok})

    # Cap at 1,200 pairs if larger, shuffled deterministically
    rng = random.Random(seed)
    rng.shuffle(tokenized_pairs)
    tokenized_pairs = tokenized_pairs[:1200]

    print(f"[R3-DPO] Prepared {len(tokenized_pairs)} tokenized preference pairs.", flush=True)

    base_model = AutoModelForImageTextToText.from_pretrained(
        base_model_dir,
        dtype=torch.bfloat16,
        device_map="cuda:0",
    )
    if hasattr(base_model, "model") and hasattr(base_model.model, "visual"):
        base_model.model.visual.requires_grad_(False)

    base_model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    base_model.enable_input_require_grads()

    peft_model = PeftModel.from_pretrained(base_model, r2_adapter_dir_str, is_trainable=True)
    for name, param in peft_model.named_parameters():
        if "visual" in name and param.requires_grad:
            param.requires_grad_(False)

    core_vlm = peft_model.get_base_model()
    lm_head = core_vlm.get_output_embeddings()

    def _chunk_logp_sum(c_hidden: torch.Tensor, c_targets: torch.Tensor) -> torch.Tensor:
        return -F.cross_entropy(lm_head(c_hidden).float(), c_targets, reduction="sum")

    def _batch_seq_logps(
        batch_trajs: list[dict[str, list[int]]],
        require_grad: bool = True,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        max_len = max(len(x["input_ids"]) for x in batch_trajs)
        in_ids = torch.full((len(batch_trajs), max_len), pad_id, dtype=torch.long, device="cuda:0")
        lbls = torch.full((len(batch_trajs), max_len), -100, dtype=torch.long, device="cuda:0")
        amask = torch.zeros((len(batch_trajs), max_len), dtype=torch.long, device="cuda:0")
        for i, item in enumerate(batch_trajs):
            L = len(item["input_ids"])
            in_ids[i, :L] = torch.tensor(item["input_ids"], dtype=torch.long, device="cuda:0")
            lbls[i, :L] = torch.tensor(item["labels"], dtype=torch.long, device="cuda:0")
            amask[i, :L] = 1

        backbone_out = core_vlm.model(
            input_ids=in_ids,
            attention_mask=amask,
            use_cache=False,
        )
        hidden = (
            backbone_out.last_hidden_state
            if hasattr(backbone_out, "last_hidden_state")
            else backbone_out[0]
        )
        shift_h = hidden[:, :-1, :]
        shift_y = lbls[:, 1:]

        seq_lps: list[torch.Tensor] = []
        mean_nlls: list[torch.Tensor] = []
        for b_idx in range(shift_h.shape[0]):
            vmask = shift_y[b_idx] != -100
            act_h = shift_h[b_idx][vmask]
            act_y = shift_y[b_idx][vmask]
            n_tok = int(act_y.numel())
            if n_tok == 0:
                zero = hidden.sum() * 0.0
                seq_lps.append(zero)
                mean_nlls.append(zero)
                continue
            parts: list[torch.Tensor] = []
            for c_idx in range(0, n_tok, 512):
                sub_h = act_h[c_idx : c_idx + 512]
                sub_y = act_y[c_idx : c_idx + 512]
                if require_grad:
                    parts.append(grad_ckpt(_chunk_logp_sum, sub_h, sub_y, use_reentrant=False))
                else:
                    parts.append(_chunk_logp_sum(sub_h, sub_y))
            s_lp = torch.stack(parts).sum()
            seq_lps.append(s_lp)
            mean_nlls.append(-s_lp / float(n_tok))
        return torch.stack(seq_lps), torch.stack(mean_nlls)

    # Step A: Precompute exact Round 2 reference log-probabilities before modifying adapter weights
    peft_model.eval()
    ref_chosen_lps: list[float] = []
    ref_rejected_lps: list[float] = []
    ref_bs = 4
    with torch.no_grad():
        for start in range(0, len(tokenized_pairs), ref_bs):
            sub = tokenized_pairs[start : start + ref_bs]
            c_lp, _ = _batch_seq_logps([x["chosen"] for x in sub], require_grad=False)
            r_lp, _ = _batch_seq_logps([x["rejected"] for x in sub], require_grad=False)
            ref_chosen_lps.extend(c_lp.detach().cpu().tolist())
            ref_rejected_lps.extend(r_lp.detach().cpu().tolist())

    print(
        f"[R3-DPO] Precomputed exact Round 2 reference log-probs in {round(time.time() - t0, 1)}s.",
        flush=True,
    )

    # Step B: DPO + RFT optimization
    peft_model.train()
    optimizer = torch.optim.AdamW(
        [p for p in peft_model.parameters() if p.requires_grad],
        lr=lr,
        betas=(0.9, 0.999),
        weight_decay=0.01,
        fused=True,
    )

    micro_pairs = 2
    grad_accum = 4
    total_opt_steps = max(1, math.ceil(len(tokenized_pairs) / (micro_pairs * grad_accum)))
    warmup_steps = max(1, int(0.1 * total_opt_steps))

    order = list(range(len(tokenized_pairs)))
    rng.shuffle(order)

    optimizer.zero_grad(set_to_none=True)
    opt_step = 0
    micro_step = 0
    acc_loss = 0.0
    acc_reward_acc = 0.0
    history: list[dict[str, Any]] = []

    for start in range(0, len(order), micro_pairs):
        idxs = order[start : start + micro_pairs]
        ch_batch = [tokenized_pairs[i]["chosen"] for i in idxs]
        rj_batch = [tokenized_pairs[i]["rejected"] for i in idxs]
        ref_c = torch.tensor([ref_chosen_lps[i] for i in idxs], dtype=torch.float32, device="cuda:0")
        ref_r = torch.tensor([ref_rejected_lps[i] for i in idxs], dtype=torch.float32, device="cuda:0")

        pol_c, chosen_nll = _batch_seq_logps(ch_batch)
        pol_r, _ = _batch_seq_logps(rj_batch)

        logits_diff = beta * ((pol_c - ref_c) - (pol_r - ref_r))
        dpo_loss = -F.logsigmoid(logits_diff).mean()
        rft_loss = chosen_nll.mean()
        total_loss = (dpo_loss + rft_anchor_weight * rft_loss) / grad_accum
        total_loss.backward()

        acc_loss += float((dpo_loss + rft_anchor_weight * rft_loss).detach().cpu().item())
        acc_reward_acc += float((logits_diff > 0).float().mean().detach().cpu().item())
        micro_step += 1

        is_last = (start + micro_pairs) >= len(order)
        if micro_step % grad_accum == 0 or is_last:
            if opt_step < warmup_steps:
                cur_lr = lr * float(opt_step + 1) / float(warmup_steps)
            else:
                prog = float(opt_step - warmup_steps) / float(max(1, total_opt_steps - warmup_steps))
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

            if opt_step % 15 == 0 or is_last:
                rec = {
                    "step": opt_step,
                    "total_steps": total_opt_steps,
                    "loss": round(acc_loss / max(1, micro_step), 4),
                    "preference_accuracy": round(acc_reward_acc / max(1, micro_step), 4),
                    "grad_norm": round(gn, 4),
                    "lr": round(cur_lr, 8),
                    "elapsed_sec": round(time.time() - t0, 1),
                }
                history.append(rec)
                print(f"[R3-DPO] {rec}", flush=True)
                acc_loss = 0.0
                acc_reward_acc = 0.0
                micro_step = 0

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
        "elapsed_sec": round(time.time() - t0, 2),
        "dpo_pairs_trained": len(tokenized_pairs),
        "beta": beta,
        "lr": lr,
        "rft_anchor_weight": rft_anchor_weight,
        "total_opt_steps": opt_step,
        "history": history,
    }


def _merge_adapter_worker(
    base_model_dir: str,
    adapter_dir_str: str,
    merged_out_dir_str: str,
) -> dict[str, Any]:
    """Merge a saved PEFT adapter into a temporary bf16 directory for fast vLLM inference."""
    import torch
    from peft import PeftModel
    from transformers import AutoModelForImageTextToText, AutoTokenizer

    t0 = time.time()
    tokenizer = AutoTokenizer.from_pretrained(base_model_dir, trust_remote_code=False)
    base = AutoModelForImageTextToText.from_pretrained(
        base_model_dir, dtype=torch.bfloat16, device_map="cuda:0"
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
    return {"elapsed_sec": round(time.time() - t0, 2), "merged_dir": merged_out_dir_str}


def _build_r2_curriculum_dataset(
    train_expanded: list[dict[str, Any]],
    r1_val_zero_report: dict[str, Any],
    out_jsonl: Path,
) -> dict[str, Any]:
    """Deterministically upsample weaker domains identified ONLY on Round 1 val.jsonl."""
    by_domain = r1_val_zero_report.get("byDomain", {})
    domain_rates: list[tuple[str, float]] = []
    for dom, bucket in by_domain.items():
        rate = float(bucket.get("endToEndVerified", {}).get("rate", 0.0))
        domain_rates.append((dom, rate))
    domain_rates.sort(key=lambda x: x[1])

    rates_only = [r for _, r in domain_rates]
    median_rate = rates_only[len(rates_only) // 2] if rates_only else 0.0

    upsampled_domains: list[str] = []
    for dom, rate in domain_rates[:5]:
        if rate < max(median_rate, 0.85):
            upsampled_domains.append(dom)

    curriculum_rows: list[dict[str, Any]] = []
    counts_by_domain: dict[str, int] = {}
    for row in train_expanded:
        dom = _extract_domain(row)
        repeats = 2 if dom in upsampled_domains else 1
        for _ in range(repeats):
            curriculum_rows.append(row)
            counts_by_domain[dom] = counts_by_domain.get(dom, 0) + 1

    rng = random.Random(20261118)
    rng.shuffle(curriculum_rows)
    _write_jsonl(out_jsonl, curriculum_rows)

    return {
        "r1_val_domain_rates": {d: round(r, 4) for d, r in domain_rates},
        "r1_val_median_rate": round(median_rate, 4),
        "upsampled_domains": upsampled_domains,
        "upsample_factor": 2,
        "base_expanded_train_count": len(train_expanded),
        "total_curriculum_examples": len(curriculum_rows),
        "curriculum_counts_by_domain": counts_by_domain,
    }


def _select_stratified_train_1200(
    train_expanded: list[dict[str, Any]],
    out_jsonl: Path,
    target_count: int = 1200,
) -> int:
    """Select 1,200 stratified prompts strictly from the train split across all 11 domains."""
    by_dom: dict[str, list[dict[str, Any]]] = {}
    for row in train_expanded:
        by_dom.setdefault(_extract_domain(row), []).append(row)

    rng = random.Random(20260303)
    for dom_rows in by_dom.values():
        rng.shuffle(dom_rows)

    domains = sorted(by_dom.keys())
    selected: list[dict[str, Any]] = []
    cursors = {d: 0 for d in domains}
    while len(selected) < target_count:
        progressed = False
        for d in domains:
            if len(selected) >= target_count:
                break
            c = cursors[d]
            if c < len(by_dom[d]):
                selected.append(by_dom[d][c])
                cursors[d] = c + 1
                progressed = True
        if not progressed:
            break

    _write_jsonl(out_jsonl, selected)
    return len(selected)


def _build_warmstart_polish_curriculum(
    train_r1_rows: list[dict[str, Any]],
    train_r2_rows: list[dict[str, Any]],
    r1_val_zero_report: dict[str, Any],
    out_jsonl: Path,
    target_examples: int = 2300,
) -> dict[str, Any]:
    """Build a focused 2,300-trace warm-start polish mix targeting weaker val domains & Paper 2 structured."""
    r1_ids = {_extract_item_id(r, i) for i, r in enumerate(train_r1_rows)}
    by_domain = r1_val_zero_report.get("byDomain", {})
    domain_rates = sorted(
        [(dom, float(b.get("endToEndVerified", {}).get("rate", 0.0))) for dom, b in by_domain.items()],
        key=lambda x: x[1],
    )
    weak_domains = {dom for dom, rate in domain_rates if rate < 0.78}

    priority_pool: list[dict[str, Any]] = []
    replay_pool: list[dict[str, Any]] = []

    for idx, row in enumerate(train_r2_rows):
        iid = _extract_item_id(row, idx)
        dom = _extract_domain(row)
        fmt = str(row.get("metadata", {}).get("format", ""))
        is_new = iid not in r1_ids
        if dom in weak_domains:
            priority_pool.append(row)
            if is_new or fmt == "structured":
                priority_pool.append(row)
        elif fmt == "structured" and is_new:
            priority_pool.append(row)
        else:
            replay_pool.append(row)

    rng = random.Random(20261118)
    rng.shuffle(priority_pool)
    rng.shuffle(replay_pool)

    n_priority = min(len(priority_pool), int(0.75 * target_examples))
    n_replay = min(len(replay_pool), target_examples - n_priority)
    selected = priority_pool[:n_priority] + replay_pool[:n_replay]
    rng.shuffle(selected)
    _write_jsonl(out_jsonl, selected)

    counts_by_dom: dict[str, int] = {}
    for r in selected:
        d = _extract_domain(r)
        counts_by_dom[d] = counts_by_dom.get(d, 0) + 1

    return {
        "r1_val_domain_rates": {d: round(r, 4) for d, r in domain_rates},
        "weak_domains_targeted": sorted(weak_domains),
        "selected_examples": len(selected),
        "priority_count": n_priority,
        "replay_count": n_replay,
        "counts_by_domain": counts_by_dom,
    }


@app.function(
    gpu="H100",
    cpu=12,
    memory=98304,
    volumes={VOLUME_MOUNT: vol},
    timeout=2400,
)
def run_autonomous_pipeline() -> str:
    """Budget-guarded Step A (lock in R1 Test + Novel-1500) -> Step B (140-step warm-start R2 polish)."""
    import huggingface_hub
    import torch

    pipeline_t0 = time.time()
    vol.reload()

    run_root = Path(AUTONOMOUS_DIR)
    run_root.mkdir(parents=True, exist_ok=True)
    os.makedirs(HF_CACHE_DIR, exist_ok=True)

    status_path = run_root / "LIVE_STATUS.json"
    status_state: dict[str, Any] = (
        json.loads(status_path.read_text(encoding="utf-8"))
        if status_path.exists()
        else {
            "run_id": f"sixthphysics-qwen35-{int(pipeline_t0)}",
            "started_at": _utc_now(),
            "completed_stages": [],
            "stage_timings_sec": {},
            "round_headlines": {},
            "errors": [],
        }
    )

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
        "initializing_step_a_and_b",
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

    base_model_dir = huggingface_hub.snapshot_download(
        repo_id=BASE_MODEL_ID,
        cache_dir=f"{HF_CACHE_DIR}/hub",
    )

    r0_dir = run_root / "round0_untuned"
    r0_summary = json.loads((r0_dir / "round0_summary.json").read_text(encoding="utf-8"))

    r1_dir = run_root / "round1_sft_core"
    r1_adapter_dir = r1_dir / "adapter"
    r1_summary = json.loads((r1_dir / "round1_summary.json").read_text(encoding="utf-8"))

    final_dir = run_root / "final_champion"
    final_dir.mkdir(parents=True, exist_ok=True)
    champ_adapter_dst = run_root / "champion-adapter"

    def _write_deliverables(
        champ_name: str,
        champ_src_adapter: Path,
        champ_test_dict: dict[str, Any],
        champ_novel_dict: dict[str, Any],
        champion_selection: dict[str, Any],
        rounds_payload: dict[str, Any],
    ) -> dict[str, Any]:
        if champ_adapter_dst.exists():
            shutil.rmtree(champ_adapter_dst)
        shutil.copytree(champ_src_adapter, champ_adapter_dst)
        _write_json(final_dir / "champion_selection.json", champion_selection)

        summary_obj = {
            "schema_version": "sixthphysics-qwen35-autonomous-summary/1.0.0",
            "completed_at_utc": _utc_now(),
            "total_elapsed_sec": round(time.time() - pipeline_t0, 2),
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
    # STEP A: Lock in Guaranteed Round 1 Benchmarks on Locked Test + Novel-1500
    # =========================================================================
    r1_bench_marker = r1_dir / "r1_benchmarks_summary.json"
    if not r1_bench_marker.exists():
        step_a_t0 = time.time()
        _commit_status("step_a_round1_test_and_novel_1500")
        merged_r1_tmp = "/tmp/merged_r1_model"
        _spawn_gpu_worker(
            _merge_adapter_worker,
            {
                "base_model_dir": base_model_dir,
                "adapter_dir_str": str(r1_adapter_dir),
                "merged_out_dir_str": merged_r1_tmp,
            },
        )
        r1_evals = _spawn_gpu_worker(
            _multi_split_eval_worker,
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

        r1_bench = {
            "elapsed_sec": round(time.time() - step_a_t0, 2),
            "test": r1_evals["test"],
            "novel_1500": r1_evals["novel_1500"],
        }
        _write_json(r1_bench_marker, r1_bench)

        # Copy R1 test & novel reports into final_champion/ immediately as guaranteed baseline champion
        for fname in [
            "test_zero_retry.json",
            "test_one_retry.json",
            "test_teacher_forced_step2.json",
            "novel_1500_zero_retry.json",
            "novel_1500_one_retry.json",
            "novel_1500_verified_bank_candidates.jsonl",
        ]:
            src_f = r1_dir / fname
            if src_f.exists():
                shutil.copy2(src_f, final_dir / fname)
        if (r1_dir / "rollouts").exists():
            dst_rolls = final_dir / "rollouts"
            dst_rolls.mkdir(parents=True, exist_ok=True)
            for rf in (r1_dir / "rollouts").glob("*.jsonl"):
                if rf.name.startswith(("test_", "novel_1500_")):
                    shutil.copy2(rf, dst_rolls / rf.name)

        status_state["round_headlines"]["round1_test_0retry"] = r1_bench["test"]["zero_retry"]["headline"]
        status_state["round_headlines"]["round1_test_1retry"] = r1_bench["test"]["one_retry"]["headline"]
        status_state["round_headlines"]["round1_novel1500_0retry"] = r1_bench["novel_1500"]["zero_retry"]["headline"]
        status_state["round_headlines"]["round1_novel1500_1retry"] = r1_bench["novel_1500"]["one_retry"]["headline"]
        status_state["champion_round"] = "round1_sft_core"

        prelim_sel = {
            "selected_round": "round1_sft_core",
            "selection_criterion": "Strictly held-out val.jsonl (645 items)",
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
            champ_test_dict=r1_bench["test"],
            champ_novel_dict=r1_bench["novel_1500"],
            champion_selection=prelim_sel,
            rounds_payload={"round0": r0_summary, "round1": r1_summary},
        )
        _commit_status("step_a_locked_in")
        print("[Step A] Guaranteed Round 1 Test + Novel-1500 benchmarks locked in on Volume!", flush=True)
    else:
        r1_bench = json.loads(r1_bench_marker.read_text(encoding="utf-8"))

    # =========================================================================
    # STEP B: Bounded Warm-Start Round 2 Polish (140 steps from Round 1 adapter)
    # =========================================================================
    r2_dir = run_root / "round2_warmstart_polish"
    r2_summary_path = r2_dir / "round2_summary.json"
    r2_adapter_dir = r2_dir / "adapter"
    merged_r2_tmp = "/tmp/merged_r2_warmstart"

    r1_val_1 = float(r1_summary["val_one_retry"]["headline"]["endToEndVerifiedRate"])
    r1_val_0 = float(r1_summary["val_zero_retry"]["headline"]["endToEndVerifiedRate"])

    if not r2_summary_path.exists():
        step_b_t0 = time.time()
        _commit_status("step_b_round2_warmstart_training")
        ws_jsonl = Path("/tmp/r2_warmstart_polish.jsonl")
        curriculum_plan = _build_warmstart_polish_curriculum(
            train_r1_rows=train_r1_rows,
            train_r2_rows=train_r2_rows,
            r1_val_zero_report=r1_summary["val_zero_retry"],
            out_jsonl=ws_jsonl,
            target_examples=2300,
        )
        _write_json(r2_dir / "curriculum_plan.json", curriculum_plan)
        vol.commit()

        # Leave >= 540s inside timeout=2400 for val (+ conditional test + Novel-1500) vLLM eval
        remaining_for_train = max(360.0, 2400.0 - (time.time() - pipeline_t0) - 540.0)
        ws_wall_cap = min(1020.0, remaining_for_train)

        r2_train_metrics = _spawn_gpu_worker(
            _warmstart_polish_sft_worker,
            {
                "base_model_dir": base_model_dir,
                "init_adapter_dir_str": str(r1_adapter_dir),
                "train_traces_path_str": str(ws_jsonl),
                "domain_schemas_path_str": str(schemas_path),
                "adapter_out_dir_str": str(r2_adapter_dir),
                "merged_out_dir_str": merged_r2_tmp,
                "round_label": "r2-warmstart-polish",
                "max_steps": 140,
                "max_wall_sec": ws_wall_cap,
                "lr": 4e-5,
                "micro_batch_size": 4,
                "grad_accum_steps": 4,
                "seed": 1337,
            },
        )
        ws_jsonl.unlink(missing_ok=True)
        _write_json(r2_dir / "train_metrics.json", r2_train_metrics)
        _commit_status("step_b_round2_eval")

        r2_evals = _spawn_gpu_worker(
            _multi_split_eval_worker,
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
                        "out_dir_str": str(final_dir),
                        "include_one_retry": True,
                        "include_teacher_forced_step2": True,
                        "only_if_val_beats_r1": True,
                    },
                    {
                        "split_prefix": "novel_1500",
                        "split_file_str": str(novel_path),
                        "out_dir_str": str(final_dir),
                        "include_one_retry": True,
                        "include_teacher_forced_step2": False,
                        "only_if_val_beats_r1": True,
                        "save_verified_candidates_jsonl": str(
                            final_dir / "novel_1500_verified_bank_candidates.jsonl"
                        ),
                    },
                ],
            },
        )
        shutil.rmtree(merged_r2_tmp, ignore_errors=True)

        r2_val = r2_evals["val"]
        r2_summary = {
            "round": "round2_warmstart_polish",
            "elapsed_sec": round(time.time() - step_b_t0, 2),
            "curriculum_plan": curriculum_plan,
            "train_metrics": r2_train_metrics,
            "val_zero_retry": r2_val["zero_retry"],
            "val_one_retry": r2_val["one_retry"],
            "val_teacher_forced_step2": r2_val["teacher_forced_step2"],
            "beat_round1_on_val": "test" in r2_evals,
            "test": r2_evals.get("test"),
            "novel_1500": r2_evals.get("novel_1500"),
        }
        _write_json(r2_summary_path, r2_summary)
        if "round2_warmstart_polish" not in status_state["completed_stages"]:
            status_state["completed_stages"].append("round2_warmstart_polish")
        status_state["stage_timings_sec"]["round2_warmstart_polish"] = r2_summary["elapsed_sec"]
        status_state["round_headlines"]["round2_val_0retry"] = r2_val["zero_retry"]["headline"]
        status_state["round_headlines"]["round2_val_1retry"] = r2_val["one_retry"]["headline"]
        _commit_status("round2_complete")
    else:
        r2_summary = json.loads(r2_summary_path.read_text(encoding="utf-8"))

    # =========================================================================
    # FINAL CHAMPION SELECTION & REPORT GENERATION
    # =========================================================================
    r2_val_1 = float(r2_summary["val_one_retry"]["headline"]["endToEndVerifiedRate"])
    r2_val_0 = float(r2_summary["val_zero_retry"]["headline"]["endToEndVerifiedRate"])

    if (r2_val_1, r2_val_0) > (r1_val_1, r1_val_0) and r2_summary.get("test") and r2_summary.get("novel_1500"):
        champ_name = "round2_warmstart_polish"
        champ_src = r2_adapter_dir
        champ_test_final = r2_summary["test"]
        champ_novel_final = r2_summary["novel_1500"]
    else:
        champ_name = "round1_sft_core"
        champ_src = r1_adapter_dir
        champ_test_final = r1_bench["test"]
        champ_novel_final = r1_bench["novel_1500"]

    leaderboard = sorted(
        [
            {
                "round": "round1_sft_core",
                "val_zero_retry_e2e": r1_val_0,
                "val_one_retry_e2e": r1_val_1,
                "val_syllabus_alignment": r1_summary["val_zero_retry"]["headline"]["syllabusAlignmentRate"],
                "val_step1_solver_pass": r1_summary["val_zero_retry"]["headline"]["step1SolverPassRate"],
            },
            {
                "round": "round2_warmstart_polish",
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
        "val_leaderboard": leaderboard,
    }

    status_state["round_headlines"]["champion_test_0retry"] = champ_test_final["zero_retry"]["headline"]
    status_state["round_headlines"]["champion_test_1retry"] = champ_test_final["one_retry"]["headline"]
    status_state["round_headlines"]["champion_novel1500_0retry"] = champ_novel_final["zero_retry"]["headline"]
    status_state["round_headlines"]["champion_novel1500_1retry"] = champ_novel_final["one_retry"]["headline"]

    final_summary = _write_deliverables(
        champ_name=champ_name,
        champ_src_adapter=champ_src,
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

    print(f"[Autonomous] COMPLETE! Champion={champ_name}", flush=True)
    return json.dumps(
        {
            "status": "completed",
            "champion_round": champ_name,
            "total_elapsed_sec": final_summary["total_elapsed_sec"],
            "headlines": status_state["round_headlines"],
        },
        indent=2,
    )
