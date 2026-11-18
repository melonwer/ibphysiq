#!/usr/bin/env python3
"""Local Hugging Face + PEFT + bitsandbytes NF4 bridge for SixthPhysics Qwen3.5-9B.

Used by `npm run generate:live -- --backend hf` to run `Qwen/Qwen3.5-9B` +
`d4ydy/sixthphysics-qwen3.5-9b-lora` locally with 4-bit NF4, 8-bit, or bf16 weights
and `enable_thinking=False` matching the exact training/evaluation chat template.

Examples:
    python3 training/qwen35/local_nf4_bridge.py --check
    python3 training/qwen35/local_nf4_bridge.py --serve-stdio --quant 4bit
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
import traceback
from typing import Any

DEFAULT_BASE_MODEL = "Qwen/Qwen3.5-9B"
DEFAULT_ADAPTER = "d4ydy/sixthphysics-qwen3.5-9b-lora"


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _check_environment() -> dict[str, Any]:
    packages = ["torch", "transformers", "peft", "bitsandbytes", "accelerate"]
    installed: dict[str, str | None] = {}
    missing: list[str] = []

    for pkg in packages:
        if importlib.util.find_spec(pkg) is None:
            installed[pkg] = None
            missing.append(pkg)
        else:
            try:
                mod = __import__(pkg)
                installed[pkg] = getattr(mod, "__version__", "installed")
            except Exception as exc:
                installed[pkg] = f"import-error: {exc}"

    cuda_available = False
    cuda_device_name: str | None = None
    if installed.get("torch") and not str(installed["torch"]).startswith("import-error"):
        import torch

        cuda_available = bool(torch.cuda.is_available())
        if cuda_available:
            cuda_device_name = torch.cuda.get_device_name(0)

    return {
        "ok": len(missing) == 0,
        "packages": installed,
        "missing": missing,
        "cuda_available": cuda_available,
        "cuda_device_name": cuda_device_name,
    }


def _load_model_and_tokenizer(
    base_model_id: str,
    adapter_id: str | None,
    quant: str,
    device_map: str,
) -> tuple[Any, Any, int | None]:
    try:
        import torch
        from transformers import AutoTokenizer
    except ImportError as exc:
        raise RuntimeError(
            f"Missing required Python packages ({exc}). "
            "Install with: pip install torch transformers peft bitsandbytes accelerate"
        ) from exc

    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    tokenizer_source = adapter_id if adapter_id else base_model_id
    try:
        tokenizer = AutoTokenizer.from_pretrained(tokenizer_source, trust_remote_code=False)
    except Exception:
        tokenizer = AutoTokenizer.from_pretrained(base_model_id, trust_remote_code=False)

    if tokenizer.pad_token_id is None and tokenizer.eos_token_id is not None:
        tokenizer.pad_token_id = tokenizer.eos_token_id

    load_kwargs: dict[str, Any] = {
        "device_map": device_map,
        "trust_remote_code": False,
    }

    if quant in ("4bit", "8bit"):
        try:
            from transformers import BitsAndBytesConfig
        except ImportError as exc:
            raise RuntimeError(
                f"bitsandbytes quantization requested (--quant {quant}) but unavailable: {exc}"
            ) from exc

        if quant == "4bit":
            load_kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
            )
        else:
            load_kwargs["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)
    elif quant == "bf16":
        load_kwargs["dtype"] = torch.bfloat16
    else:
        raise ValueError(f"Unsupported --quant value '{quant}'. Use 4bit, 8bit, or bf16.")

    model: Any = None
    try:
        from transformers import AutoModelForImageTextToText

        model = AutoModelForImageTextToText.from_pretrained(base_model_id, **load_kwargs)
    except Exception:
        from transformers import AutoModelForCausalLM

        model = AutoModelForCausalLM.from_pretrained(base_model_id, **load_kwargs)

    if adapter_id:
        try:
            from peft import PeftModel
        except ImportError as exc:
            raise RuntimeError(
                f"PEFT is required to load adapter '{adapter_id}' ({exc}). "
                "Install with: pip install peft"
            ) from exc
        model = PeftModel.from_pretrained(model, adapter_id, is_trainable=False)

    model.eval()
    im_end_id = tokenizer.convert_tokens_to_ids("<|im_end|>")
    if not isinstance(im_end_id, int) or im_end_id < 0:
        im_end_id = None

    return model, tokenizer, im_end_id


def _generate_one(
    model: Any,
    tokenizer: Any,
    im_end_id: int | None,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
    seed: int | None,
    top_p: float,
) -> dict[str, Any]:
    import torch

    t0 = time.perf_counter()
    if seed is not None:
        torch.manual_seed(int(seed))
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(int(seed))

    norm_msgs = [{"role": str(m["role"]), "content": str(m["content"])} for m in messages]
    try:
        prompt_text = tokenizer.apply_chat_template(
            norm_msgs,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
    except TypeError:
        prompt_text = tokenizer.apply_chat_template(
            norm_msgs,
            tokenize=False,
            add_generation_prompt=True,
        )

    encoded = tokenizer(prompt_text, return_tensors="pt", add_special_tokens=False)
    target_device = getattr(model, "device", None)
    if target_device is None or str(target_device) == "meta":
        target_device = next(model.parameters()).device
    encoded = {k: v.to(target_device) for k, v in encoded.items()}
    prompt_len = int(encoded["input_ids"].shape[1])

    eos_ids: list[int] = []
    if im_end_id is not None:
        eos_ids.append(im_end_id)
    if isinstance(tokenizer.eos_token_id, int) and tokenizer.eos_token_id not in eos_ids:
        eos_ids.append(tokenizer.eos_token_id)

    do_sample = temperature > 0.0
    gen_kwargs: dict[str, Any] = {
        "max_new_tokens": int(max_tokens),
        "do_sample": do_sample,
        "pad_token_id": tokenizer.pad_token_id,
    }
    if eos_ids:
        gen_kwargs["eos_token_id"] = eos_ids
    if do_sample:
        gen_kwargs["temperature"] = float(temperature)
        gen_kwargs["top_p"] = float(top_p)

    with torch.inference_mode():
        output_ids = model.generate(**encoded, **gen_kwargs)

    new_tokens = output_ids[0][prompt_len:]
    completion_text = tokenizer.decode(new_tokens, skip_special_tokens=True)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "ok": True,
        "text": completion_text,
        "latency_ms": round(elapsed_ms, 2),
        "prompt_tokens": prompt_len,
        "completion_tokens": int(new_tokens.shape[0]),
    }


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Local Hugging Face NF4/8bit/bf16 inference bridge for SixthPhysics Qwen3.5-9B.",
    )
    parser.add_argument(
        "--base-model",
        default=DEFAULT_BASE_MODEL,
        help=f"Base HF model ID or local path (default: {DEFAULT_BASE_MODEL})",
    )
    parser.add_argument(
        "--adapter",
        default=DEFAULT_ADAPTER,
        help=f"LoRA PEFT adapter ID or local path, or 'none' (default: {DEFAULT_ADAPTER})",
    )
    parser.add_argument(
        "--quant",
        choices=["4bit", "8bit", "bf16"],
        default="4bit",
        help="Weight quantization mode (default: 4bit NF4)",
    )
    parser.add_argument(
        "--device-map",
        default="auto",
        help="transformers device_map (default: auto)",
    )
    parser.add_argument(
        "--serve-stdio",
        action="store_true",
        help="Run persistent line-delimited JSON server on stdin/stdout",
    )
    parser.add_argument(
        "--messages-file",
        default=None,
        help="Optional single-shot JSON file containing {'messages': [...], ...}",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check Python ML dependencies and CUDA availability without loading weights",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)

    if args.check:
        report = _check_environment()
        _emit(report)
        return 0 if report["ok"] else 1

    adapter_id = None if not args.adapter or args.adapter.lower() == "none" else args.adapter

    try:
        model, tokenizer, im_end_id = _load_model_and_tokenizer(
            base_model_id=args.base_model,
            adapter_id=adapter_id,
            quant=args.quant,
            device_map=args.device_map,
        )
    except Exception as exc:
        _emit(
            {
                "type": "error",
                "ok": False,
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
        )
        return 1

    if args.messages_file:
        try:
            payload = json.loads(Path(args.messages_file).read_text(encoding="utf-8"))
            result = _generate_one(
                model=model,
                tokenizer=tokenizer,
                im_end_id=im_end_id,
                messages=payload["messages"],
                temperature=float(payload.get("temperature", 0.0)),
                max_tokens=int(payload.get("max_tokens", 1024)),
                seed=payload.get("seed"),
                top_p=float(payload.get("top_p", 0.95)),
            )
            _emit(result)
            return 0
        except Exception as exc:
            _emit({"ok": False, "error": str(exc), "traceback": traceback.format_exc()})
            return 1

    if args.serve_stdio:
        _emit(
            {
                "type": "ready",
                "ok": True,
                "base_model": args.base_model,
                "adapter": adapter_id,
                "quant": args.quant,
            }
        )
        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                if req.get("cmd") == "shutdown":
                    _emit({"ok": True, "type": "bye"})
                    break
                result = _generate_one(
                    model=model,
                    tokenizer=tokenizer,
                    im_end_id=im_end_id,
                    messages=req["messages"],
                    temperature=float(req.get("temperature", 0.0)),
                    max_tokens=int(req.get("max_tokens", 1024)),
                    seed=req.get("seed"),
                    top_p=float(req.get("top_p", 0.95)),
                )
                _emit(result)
            except Exception as exc:
                _emit(
                    {
                        "ok": False,
                        "error": str(exc),
                        "traceback": traceback.format_exc(),
                    }
                )
        return 0

    # Default single-shot stdin mode
    try:
        raw_stdin = sys.stdin.read().strip()
        payload = json.loads(raw_stdin)
        result = _generate_one(
            model=model,
            tokenizer=tokenizer,
            im_end_id=im_end_id,
            messages=payload["messages"],
            temperature=float(payload.get("temperature", 0.0)),
            max_tokens=int(payload.get("max_tokens", 1024)),
            seed=payload.get("seed"),
            top_p=float(payload.get("top_p", 0.95)),
        )
        _emit(result)
        return 0
    except Exception as exc:
        _emit({"ok": False, "error": str(exc), "traceback": traceback.format_exc()})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
