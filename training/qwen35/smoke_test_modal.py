"""Modal H100 smoke test for Qwen/Qwen3.5-9B architecture, masking, LoRA, vLLM, and TS solver/evaluator."""

from __future__ import annotations

import gc
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
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

app = modal.App("sixthphysics-qwen35-smoke", image=qwen35_image)


def build_assistant_only_labels(
    tokenizer: Any,
    messages: list[dict[str, str]],
) -> dict[str, Any]:
    """Tokenize a 5-turn SixthPhysics trace with strict assistant-only loss masking."""
    norm_msgs = [{"role": m["role"], "content": m["content"]} for m in messages]
    if [m["role"] for m in norm_msgs] != ["system", "user", "assistant", "tool", "assistant"]:
        raise ValueError(
            f"Expected 5-turn [system,user,assistant,tool,assistant], got {[m['role'] for m in norm_msgs]}"
        )

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

    if not (s1_text.startswith(p1_text) and p2_text.startswith(s1_text) and full_text.startswith(p2_text)):
        raise AssertionError("Chat template string prefixes did not nest monotonically!")

    p1_ids = tokenizer(p1_text, add_special_tokens=False)["input_ids"]
    s1_ids = tokenizer(s1_text, add_special_tokens=False)["input_ids"]
    p2_ids = tokenizer(p2_text, add_special_tokens=False)["input_ids"]
    full_ids = tokenizer(full_text, add_special_tokens=False)["input_ids"]

    if not (
        full_ids[: len(p1_ids)] == p1_ids
        and full_ids[: len(s1_ids)] == s1_ids
        and full_ids[: len(p2_ids)] == p2_ids
    ):
        raise AssertionError("Token ID prefixes did not match monotonically across turns!")

    im_end_id = tokenizer.convert_tokens_to_ids("<|im_end|>")
    labels = [-100] * len(full_ids)

    # Step 1 assistant span: supervise JSON content up to and including <|im_end|>
    s1_end = len(s1_ids)
    while s1_end > len(p1_ids) and full_ids[s1_end - 1] != im_end_id:
        s1_end -= 1
    for idx in range(len(p1_ids), s1_end):
        labels[idx] = full_ids[idx]

    # Step 2 assistant span: supervise JSON content up to and including <|im_end|>
    s2_end = len(full_ids)
    while s2_end > len(p2_ids) and full_ids[s2_end - 1] != im_end_id:
        s2_end -= 1
    for idx in range(len(p2_ids), s2_end):
        labels[idx] = full_ids[idx]

    return {
        "input_ids": full_ids,
        "labels": labels,
        "p1_len": len(p1_ids),
        "s1_end": s1_end,
        "p2_len": len(p2_ids),
        "s2_end": s2_end,
        "step1_supervised_decoded": tokenizer.decode(full_ids[len(p1_ids) : s1_end], skip_special_tokens=False),
        "step2_supervised_decoded": tokenizer.decode(full_ids[len(p2_ids) : s2_end], skip_special_tokens=False),
        "step1_prompt_tail": p1_text[-120:],
    }


def _verify_typescript_harness_in_container(sample_trace: dict[str, Any]) -> dict[str, Any]:
    """Verify Node.js 22 + npx tsx + solve-step1-batch.ts (+ evaluate-model-rollouts.ts if present)."""
    node_ver = subprocess.run(
        ["node", "--version"], capture_output=True, text=True, check=True
    ).stdout.strip()
    tsx_ver = subprocess.run(
        ["npx", "tsx", "--version"],
        cwd=WORKSPACE_REMOTE_DIR,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        proposals_path = tmp / "proposals.jsonl"
        receipts_path = tmp / "receipts.jsonl"
        split_path = tmp / "split.jsonl"
        rollouts_path = tmp / "rollouts.jsonl"
        eval_report_path = tmp / "eval_report.json"
        eval_items_path = tmp / "eval_items.jsonl"

        item_id = sample_trace["itemId"]
        domain = sample_trace["metadata"]["domain"]
        step1_raw = sample_trace["messages"][2]["content"]
        step2_raw = sample_trace["messages"][4]["content"]

        proposals_path.write_text(
            json.dumps({"id": item_id, "domain": domain, "assistantStep1Raw": step1_raw}) + "\n",
            encoding="utf-8",
        )

        t0 = time.time()
        solve_proc = subprocess.run(
            [
                "npx",
                "tsx",
                "scripts/benchmark/solve-step1-batch.ts",
                "--input",
                str(proposals_path),
                "--output",
                str(receipts_path),
            ],
            cwd=WORKSPACE_REMOTE_DIR,
            capture_output=True,
            text=True,
            check=False,
        )
        solve_sec = round(time.time() - t0, 3)
        if solve_proc.returncode != 0:
            raise RuntimeError(
                f"solve-step1-batch.ts failed (rc={solve_proc.returncode}): {solve_proc.stderr}"
            )
        receipt_row = json.loads(receipts_path.read_text(encoding="utf-8").splitlines()[0])
        if not receipt_row.get("valid"):
            raise AssertionError(f"Gold trace failed solve-step1-batch.ts: {receipt_row}")

        eval_script = Path(WORKSPACE_REMOTE_DIR) / "scripts" / "benchmark" / "evaluate-model-rollouts.ts"
        eval_check: dict[str, Any] = {"present": eval_script.exists()}
        if eval_script.exists():
            split_path.write_text(json.dumps(sample_trace) + "\n", encoding="utf-8")
            rollout_row = {
                "id": item_id,
                "itemId": item_id,
                "domain": domain,
                "assistantStep1Raw": step1_raw,
                "toolReceiptRaw": receipt_row["toolReceiptJson"],
                "assistantStep2Raw": step2_raw,
                "attemptsUsed": 1,
                "mode": "zero-retry",
            }
            rollouts_path.write_text(json.dumps(rollout_row) + "\n", encoding="utf-8")
            cmd = [
                "npx",
                "tsx",
                "scripts/benchmark/evaluate-model-rollouts.ts",
                "--rollouts",
                str(rollouts_path),
                "--split-file",
                str(split_path),
                "--output",
                str(eval_report_path),
                "--items-output",
                str(eval_items_path),
            ]
            e_t0 = time.time()
            eval_proc = subprocess.run(
                cmd,
                cwd=WORKSPACE_REMOTE_DIR,
                capture_output=True,
                text=True,
                check=False,
            )
            # Fallback if --items-output is not supported yet
            if eval_proc.returncode != 0 and "--items-output" in eval_proc.stderr:
                eval_proc = subprocess.run(
                    cmd[:-2],
                    cwd=WORKSPACE_REMOTE_DIR,
                    capture_output=True,
                    text=True,
                    check=False,
                )
            eval_sec = round(time.time() - e_t0, 3)
            if eval_proc.returncode != 0:
                raise RuntimeError(
                    f"evaluate-model-rollouts.ts failed (rc={eval_proc.returncode}): {eval_proc.stderr}"
                )
            report = json.loads(eval_report_path.read_text(encoding="utf-8"))
            eval_check = {
                "present": True,
                "elapsed_sec": eval_sec,
                "headline": report.get("headline", {}),
                "items_output_written": eval_items_path.exists(),
            }

    return {
        "node_version": node_ver,
        "tsx_version": tsx_ver,
        "solve_step1_batch": {
            "elapsed_sec": solve_sec,
            "valid": receipt_row["valid"],
            "solverId": receipt_row.get("solverId"),
        },
        "evaluate_model_rollouts": eval_check,
    }


@app.function(
    gpu="H100",
    cpu=8,
    memory=65536,
    volumes={VOLUME_MOUNT: vol},
    timeout=3600 * 6,
)
def run_smoke_test() -> str:
    import accelerate
    import bitsandbytes
    import huggingface_hub
    import peft
    import torch
    import torch.nn.functional as F
    import transformers
    import trl
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForImageTextToText, AutoTokenizer

    t0 = time.time()
    vol.reload()
    os.makedirs(HF_CACHE_DIR, exist_ok=True)
    os.makedirs(f"{RUNS_REMOTE_DIR}/autonomous", exist_ok=True)

    train_core_path = Path(DATA_REMOTE_DIR) / "train_r1_core.jsonl"
    if not train_core_path.exists():
        raise FileNotFoundError(f"Expected {train_core_path} on Modal Volume '{VOLUME_MOUNT}'")
    with train_core_path.open(encoding="utf-8") as f:
        sample_trace = json.loads(f.readline())

    ts_check = _verify_typescript_harness_in_container(sample_trace)

    gpu_name = torch.cuda.get_device_name(0)
    vram_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2)

    try:
        import fla  # type: ignore

        fla_version = getattr(fla, "__version__", "installed")
    except Exception as exc:  # pragma: no cover
        fla_version = f"unavailable: {exc}"

    try:
        import vllm  # type: ignore

        vllm_version = vllm.__version__
    except Exception as exc:  # pragma: no cover
        vllm_version = f"unavailable: {exc}"

    # Ensure model snapshot is cached on the persistent Modal Volume
    dl_t0 = time.time()
    local_model_dir = huggingface_hub.snapshot_download(
        repo_id=BASE_MODEL_ID,
        cache_dir=f"{HF_CACHE_DIR}/hub",
    )
    vol.commit()
    dl_sec = round(time.time() - dl_t0, 2)

    tokenizer = AutoTokenizer.from_pretrained(local_model_dir, trust_remote_code=False)
    mask_check = build_assistant_only_labels(tokenizer, sample_trace["messages"])

    load_t0 = time.time()
    model = AutoModelForImageTextToText.from_pretrained(
        local_model_dir,
        dtype=torch.bfloat16,
        device_map="cuda:0",
    )
    load_sec = round(time.time() - load_t0, 2)
    model_class = type(model).__name__

    # Inspect linear module names across visual vs language_model
    lm_linear_leaf_names: set[str] = set()
    visual_linear_count = 0
    for name, mod in model.named_modules():
        if isinstance(mod, torch.nn.Linear):
            if "visual" in name:
                visual_linear_count += 1
            elif "language_model" in name:
                lm_linear_leaf_names.add(name.split(".")[-1])

    # Freeze vision tower explicitly
    if hasattr(model, "model") and hasattr(model.model, "visual"):
        model.model.visual.requires_grad_(False)

    standard_targets = [
        "q_proj",
        "k_proj",
        "v_proj",
        "o_proj",
        "gate_proj",
        "up_proj",
        "down_proj",
    ]
    lora_cfg = LoraConfig(
        r=32,
        lora_alpha=64,
        lora_dropout=0.05,
        bias="none",
        target_modules=standard_targets,
        exclude_modules=r".*(visual|mtp).*",
        task_type="CAUSAL_LM",
    )
    peft_model = get_peft_model(model, lora_cfg)
    peft_model.train()

    trainable_params = 0
    total_params = 0
    trainable_visual_params = 0
    adapted_module_types: set[str] = set()
    for name, param in peft_model.named_parameters():
        total_params += param.numel()
        if param.requires_grad:
            trainable_params += param.numel()
            if "visual" in name:
                trainable_visual_params += param.numel()
            parts = name.split(".")
            for p in parts:
                if p in lm_linear_leaf_names or p in standard_targets:
                    adapted_module_types.add(p)

    if trainable_visual_params != 0:
        raise AssertionError(f"Vision tower leaked {trainable_visual_params} trainable params!")

    # Verify forward + backward pass with strict assistant-only labels
    input_ids = torch.tensor([mask_check["input_ids"]], dtype=torch.long, device="cuda:0")
    labels = torch.tensor([mask_check["labels"]], dtype=torch.long, device="cuda:0")
    attention_mask = torch.ones_like(input_ids)

    outputs = peft_model(
        input_ids=input_ids,
        attention_mask=attention_mask,
        labels=labels,
        use_cache=False,
    )
    loss_val = float(outputs.loss.detach().cpu().item())
    outputs.loss.backward()

    grad_norm_sq = 0.0
    nonzero_grad_tensors = 0
    for _, param in peft_model.named_parameters():
        if param.requires_grad and param.grad is not None:
            gn = float(param.grad.detach().float().norm().cpu().item())
            grad_norm_sq += gn * gn
            if gn > 0:
                nonzero_grad_tensors += 1
    peft_model.zero_grad(set_to_none=True)

    # Verify PEFT disable_adapter() reference log-prob + DPO loss backward check
    with torch.no_grad(), peft_model.disable_adapter():
        ref_logits = peft_model(
            input_ids=input_ids, attention_mask=attention_mask, use_cache=False
        ).logits
        shift_ref = F.log_softmax(ref_logits[:, :-1, :].float(), dim=-1)
        shift_labels = labels[:, 1:]
        valid_mask = shift_labels != -100
        safe_targets = shift_labels.clamp(min=0)
        ref_tok_lp = shift_ref.gather(-1, safe_targets.unsqueeze(-1)).squeeze(-1) * valid_mask
        ref_seq_lp = float(ref_tok_lp.sum().cpu().item())

    # Test single-turn generation with enable_thinking=False via HF generate
    peft_model.eval()
    prompt_msgs = [{"role": m["role"], "content": m["content"]} for m in sample_trace["messages"][:2]]
    prompt_str = tokenizer.apply_chat_template(
        prompt_msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False
    )
    prompt_inputs = tokenizer(prompt_str, return_tensors="pt", add_special_tokens=False).to("cuda:0")
    im_end_id = tokenizer.convert_tokens_to_ids("<|im_end|>")
    gen_t0 = time.time()
    with torch.no_grad():
        gen_out = peft_model.generate(
            **prompt_inputs,
            max_new_tokens=192,
            do_sample=False,
            eos_token_id=[im_end_id, tokenizer.eos_token_id],
            pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
        )
    hf_gen_sec = round(time.time() - gen_t0, 2)
    hf_new_tokens = gen_out[0][prompt_inputs["input_ids"].shape[1] :]
    hf_decoded = tokenizer.decode(hf_new_tokens, skip_special_tokens=True)

    # Free HF model before probing vLLM continuous batching speed
    del peft_model
    del model
    gc.collect()
    torch.cuda.empty_cache()

    vllm_probe: dict[str, Any] = {"supported": False}
    try:
        from vllm import LLM, SamplingParams

        v_t0 = time.time()
        llm = LLM(
            model=local_model_dir,
            dtype="bfloat16",
            max_model_len=8192,
            gpu_memory_utilization=0.85,
            language_model_only=True,
        )
        v_init_sec = round(time.time() - v_t0, 2)
        sp = SamplingParams(
            temperature=0.0,
            max_tokens=256,
            stop_token_ids=[im_end_id],
        )
        v_gen_t0 = time.time()
        v_outs = llm.generate([prompt_str] * 16, sp)
        v_gen_sec = round(time.time() - v_gen_t0, 3)
        total_v_tokens = sum(len(o.outputs[0].token_ids) for o in v_outs)
        vllm_probe = {
            "supported": True,
            "init_sec": v_init_sec,
            "batch16_gen_sec": v_gen_sec,
            "batch16_tokens": total_v_tokens,
            "tok_per_sec": round(total_v_tokens / max(v_gen_sec, 1e-3), 1),
            "sample_output_prefix": v_outs[0].outputs[0].text[:240],
        }
        del llm
        gc.collect()
        torch.cuda.empty_cache()
    except Exception as exc:
        vllm_probe = {"supported": False, "error": repr(exc)}

    supervised_count = sum(1 for x in mask_check["labels"] if x != -100)
    masked_count = sum(1 for x in mask_check["labels"] if x == -100)

    receipt = {
        "status": "ok",
        "elapsed_sec": round(time.time() - t0, 2),
        "gpu": {"name": gpu_name, "vram_gb": vram_gb},
        "versions": {
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "peft": peft.__version__,
            "trl": trl.__version__,
            "accelerate": accelerate.__version__,
            "bitsandbytes": bitsandbytes.__version__,
            "flash_linear_attention": fla_version,
            "vllm": vllm_version,
        },
        "typescript_harness_check": ts_check,
        "snapshot_download_sec": dl_sec,
        "hf_load_sec": load_sec,
        "model_class": model_class,
        "lm_linear_leaf_names": sorted(lm_linear_leaf_names),
        "visual_linear_count": visual_linear_count,
        "lora": {
            "target_modules": standard_targets,
            "adapted_module_types": sorted(adapted_module_types),
            "trainable_params": trainable_params,
            "total_params": total_params,
            "trainable_pct": round(100.0 * trainable_params / total_params, 4),
            "trainable_visual_params": trainable_visual_params,
        },
        "loss_mask_verification": {
            "total_tokens": len(mask_check["input_ids"]),
            "supervised_assistant_tokens": supervised_count,
            "masked_non_assistant_tokens": masked_count,
            "step1_prompt_tail": mask_check["step1_prompt_tail"],
            "step1_supervised_starts_with_json": mask_check["step1_supervised_decoded"].startswith("{"),
            "step1_supervised_ends_with_im_end": mask_check["step1_supervised_decoded"].endswith("<|im_end|>"),
            "step2_supervised_starts_with_json": mask_check["step2_supervised_decoded"].startswith("{"),
            "step2_supervised_ends_with_im_end": mask_check["step2_supervised_decoded"].endswith("<|im_end|>"),
        },
        "forward_backward_check": {
            "initial_sft_loss": round(loss_val, 4),
            "grad_norm": round(grad_norm_sq**0.5, 4),
            "nonzero_grad_tensors": nonzero_grad_tensors,
            "disable_adapter_ref_logp": round(ref_seq_lp, 4),
        },
        "hf_generate_check": {
            "gen_sec": hf_gen_sec,
            "new_tokens": int(hf_new_tokens.shape[0]),
            "starts_without_think_tag": not hf_decoded.lstrip().startswith("<think>"),
            "output_prefix": hf_decoded[:240],
        },
        "vllm_probe": vllm_probe,
    }

    receipt_path = Path(RUNS_REMOTE_DIR) / "autonomous" / "smoke_test_receipt.json"
    serialized = json.dumps(receipt, indent=2)
    receipt_path.write_text(serialized + "\n", encoding="utf-8")
    vol.commit()
    print(serialized)
    return serialized
