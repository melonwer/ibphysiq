"""Cloud-only Modal CPU pipeline: merge bf16 Champion LoRA into Qwen/Qwen3.5-9B,
convert & quantize to GGUF (Q4_K_M, Q6_K, Q8_0), smoke-test Q4_K_M with llama-cli,
and publish directly to Hugging Face (d4ydy/sixthphysics-qwen3.5-9b-GGUF).

Uses 0 GB of local NVMe disk and runs on a low-cost Modal CPU container
(cpu=16, memory=65536, no GPU required).

Run:
    modal run training/qwen35/modal_merge_and_quantize_gguf.py
"""

from __future__ import annotations

from datetime import datetime, timezone
import gc
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from typing import Any

import modal

APP_NAME = "sixthphysics-qwen35-gguf-quantize"
BASE_MODEL_ID = "Qwen/Qwen3.5-9B"
SOURCE_LORA_REPO_ID = "d4ydy/sixthphysics-qwen3.5-9b-lora"
DATASET_REPO_ID = "d4ydy/sixthphysics-bench-and-bank"
TARGET_GGUF_REPO_ID = "d4ydy/sixthphysics-qwen3.5-9b-GGUF"

VOLUME_NAME = "sixthphysics-qwen35-vol"
VOLUME_MOUNT = "/vol"
HF_CACHE_DIR = f"{VOLUME_MOUNT}/hf_cache"
CHAMPION_ADAPTER_DIR = f"{VOLUME_MOUNT}/runs/autonomous/champion-adapter"
DOMAIN_SCHEMAS_PATH = f"{VOLUME_MOUNT}/data/domain-tool-schemas.json"

LLAMA_CPP_DIR = "/opt/llama.cpp"
QUANT_SPECS: list[tuple[str, str, str]] = [
    (
        "Q4_K_M",
        "sixthphysics-qwen3.5-9b-Q4_K_M.gguf",
        "Recommended default — fits 8 GB GPUs, Apple Silicon MacBooks, and Ollama",
    ),
    (
        "Q6_K",
        "sixthphysics-qwen3.5-9b-Q6_K.gguf",
        "Near-lossless quality/size balance — 10–12 GB VRAM or 16 GB unified memory",
    ),
    (
        "Q8_0",
        "sixthphysics-qwen3.5-9b-Q8_0.gguf",
        "Maximum GGUF precision — 12–16 GB VRAM or 16+ GB RAM",
    ),
]

BASE_SYSTEM_PROMPT = (
    "You are the SixthPhysics neuro-symbolic physics question author. Follow the strict "
    "two-step deterministic harness protocol:\n"
    "Step 1 (propose_scenario): Given the target syllabus, concept, domain, format, "
    "difficulty, and seed, emit a JSON proposal calling solve_and_render_scenario with a "
    "physically valid scenarioSpec, hiddenQuantities (target unknowns that must never leak "
    "in student figures), and questionPlan. Never guess or compute numerical answers before "
    "receiving the harness receipt.\n"
    "Step 2 (author_package): Given the physics_harness receipt containing solver-verified "
    "quantities and student figure metadata, emit a complete JSON question package (stem, "
    "4 unique options A-D with distractorRationales for MCQ or structured subparts with "
    "dependencies, workedSolution, and markScheme) whose numerical values agree with "
    "verifiedQuantities to 3 significant figures, include every required given, balance "
    "marks exactly, and leak zero answers in the student stem."
)

FALLBACK_MECHANICS_SCHEMA = (
    'Domain "mechanics" (visualFamily="mechanics_scene"):\n'
    '- kind="projectile-kinematics": req={launchSpeedMs: number [m s^-1], '
    "launchAngleDegrees: number [deg], gravityMs2: number [m s^-2]} | constraints: "
    "launchSpeedMs > 0, gravityMs2 > 0, 0 < launchAngleDegrees < 90 | "
    "outputs=[flightTimeS, horizontalSpeedMs, initialVerticalSpeedMs, maxHeightM, horizontalRangeM]\n"
    '- kind="incline-dynamics": req={massKg: number [kg], angleDegrees: number [deg], '
    "gravityMs2: number [m s^-2], frictionCoeff: number} | constraints: massKg > 0, "
    "0 < angleDegrees < 85, frictionCoeff >= 0 | "
    "outputs=[weightN, normalForceN, parallelWeightN, frictionForceN, netForceN, accelerationMs2]"
)

SMOKE_TEST_USER_PROMPT_OBJ: dict[str, Any] = {
    "task": "generate_verified_physics_question",
    "syllabi": [
        {
            "syllabus": "ib",
            "level": "HL",
            "topicId": "ib-theme-a",
            "subtopicId": "ib-a1-kinematics",
        }
    ],
    "domain": "mechanics",
    "conceptId": "kinematics-suvat",
    "templateArchetype": "novel-bench-kinematics-suvat-marine-instrumentation-v2",
    "visualFamily": "mechanics_scene",
    "format": "mcq",
    "difficulty": "higher",
    "totalMarks": 1,
    "seed": 90000052,
}

vol = modal.Volume.from_name(VOLUME_NAME, create_if_missing=False)


def build_gguf_cpu_image() -> modal.Image:
    """Clean CPU-only Modal image with Transformers 5.x, PEFT, and latest upstream llama.cpp."""
    return (
        modal.Image.debian_slim(python_version="3.11")
        .apt_install(
            "cmake",
            "build-essential",
            "git",
            "curl",
            "ca-certificates",
            "pkg-config",
        )
        .uv_pip_install(
            "torch",
            index_url="https://download.pytorch.org/whl/cpu",
        )
        .uv_pip_install(
            "transformers>=5.16.1,<5.23.0",
            "peft==0.21.3",
            "accelerate>=1.11.0",
            "safetensors",
            "huggingface_hub[hf_transfer]",
            "gguf",
            "sentencepiece",
            "protobuf",
            "numpy",
            "pyyaml",
            "pillow",
            "jinja2",
        )
        .run_commands(
            f"git clone --depth 1 https://github.com/ggml-org/llama.cpp.git {LLAMA_CPP_DIR} "
            f"&& cmake -S {LLAMA_CPP_DIR} -B {LLAMA_CPP_DIR}/build "
            "-DGGML_CUDA=OFF "
            "-DGGML_NATIVE=OFF "
            "-DGGML_AVX2=ON "
            "-DGGML_FMA=ON "
            "-DGGML_F16C=ON "
            "-DLLAMA_OPENSSL=OFF "
            "-DLLAMA_BUILD_TESTS=OFF "
            "-DLLAMA_BUILD_EXAMPLES=OFF "
            "-DLLAMA_BUILD_SERVER=ON "
            "-DLLAMA_BUILD_HTML=OFF "
            "-DCMAKE_BUILD_TYPE=Release "
            f"&& cmake --build {LLAMA_CPP_DIR}/build "
            "--target llama-quantize llama-cli llama-completion -j $(nproc) "
            f"&& ls -lh {LLAMA_CPP_DIR}/build/bin/llama-quantize "
            f"{LLAMA_CPP_DIR}/build/bin/llama-cli "
            f"{LLAMA_CPP_DIR}/build/bin/llama-completion"
        )
        .env(
            {
                "HF_HOME": HF_CACHE_DIR,
                "HUGGINGFACE_HUB_CACHE": f"{HF_CACHE_DIR}/hub",
                "HF_HUB_ENABLE_HF_TRANSFER": "1",
                "TOKENIZERS_PARALLELISM": "false",
            }
        )
    )


gguf_image = build_gguf_cpu_image()
app = modal.App(APP_NAME, image=gguf_image)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _format_size(num_bytes: int) -> tuple[str, str]:
    gb_dec = num_bytes / 1_000_000_000
    gib_bin = num_bytes / (1024**3)
    return f"{gb_dec:.2f} GB", f"{gib_bin:.2f} GiB"


def _run_cmd(
    cmd: list[str],
    *,
    cwd: str | None = None,
    timeout: int = 1800,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    print(f"[cmd] {' '.join(cmd[:8])}{' ...' if len(cmd) > 8 else ''}", flush=True)
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
    )
    if check and proc.returncode != 0:
        stdout_tail = proc.stdout[-4000:] if proc.stdout else ""
        stderr_tail = proc.stderr[-4000:] if proc.stderr else ""
        raise RuntimeError(
            f"Command failed (rc={proc.returncode}): {' '.join(cmd[:6])}\n"
            f"--- STDOUT TAIL ---\n{stdout_tail}\n"
            f"--- STDERR TAIL ---\n{stderr_tail}"
        )
    return proc


def _resolve_cached_base_model_dir() -> str:
    snapshots_root = Path(HF_CACHE_DIR) / "hub" / "models--Qwen--Qwen3.5-9B" / "snapshots"
    if snapshots_root.is_dir():
        candidates = sorted(
            [p for p in snapshots_root.iterdir() if p.is_dir() and (p / "config.json").exists()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if candidates:
            return str(candidates[0])
    return BASE_MODEL_ID


def _build_augmented_system_prompt(domain: str) -> str:
    compact_summary = FALLBACK_MECHANICS_SCHEMA
    schemas_file = Path(DOMAIN_SCHEMAS_PATH)
    if schemas_file.is_file():
        data = json.loads(schemas_file.read_text(encoding="utf-8"))
        dom_entry = data.get("domains", {}).get(domain, {})
        summary = dom_entry.get("compactPromptSummary")
        if isinstance(summary, str) and summary.strip():
            compact_summary = summary.strip()

    contract_block = (
        "\n\n--- DOMAIN TOOL & SYLLABUS CONTRACT ---\n"
        f"{compact_summary}\n"
        'Step 1 JSON format: {"action":"solve_and_render_scenario","domain":"'
        f"{domain}"
        '","scenarioSpec":{"kind":"..."},"hiddenQuantities":["..."],'
        '"questionPlan":{"targetSummary":"..."}}\n'
        'Step 2 MCQ JSON format: {"format":"mcq","difficulty":"...","stem":"...",'
        '"options":[{"label":"A","text":"...","isCorrect":true},'
        '{"label":"B","text":"...","isCorrect":false,"distractorRationale":"..."},'
        '{"label":"C","text":"...","isCorrect":false,"distractorRationale":"..."},'
        '{"label":"D","text":"...","isCorrect":false,"distractorRationale":"..."}],'
        '"correctOptionIndex":0,"workedSolution":"...",'
        '"markScheme":[{"code":"A1","criterion":"...","marks":1}],"totalMarks":1}\n'
        'Step 2 Structured JSON format: {"format":"structured","difficulty":"...",'
        '"stem":"...","parts":[{"partId":"a","prompt":"...","marks":2,'
        '"expectedAnswer":"..."}],"workedSolution":"...",'
        '"markScheme":[{"code":"M1","criterion":"...","marks":1},'
        '{"code":"A1","criterion":"...","marks":1}],"totalMarks":2}\n'
        "Strict rules: Output raw JSON object only (no markdown fences). "
        "IB Physics uses g = 9.8 m s^-2 and excludes retired IB 2016 topics "
        "(farad capacitance, 1/f thin-lens equation, quarks/Feynman diagrams, and "
        "HL-only quantities on SL prompts). "
        "UK A-Level and NCUK IFY use g = 9.81 m s^-2. "
        "Every numerical answer and workedSolution must match formattedQuantities3sf "
        "to 3 significant figures, sum markScheme marks to totalMarks, and never leak "
        "hiddenQuantities in the stem."
    )
    return BASE_SYSTEM_PROMPT.rstrip() + contract_block


def _extract_step1_json(raw_output: str) -> dict[str, Any] | None:
    """Strip optional <think> blocks / fences and parse the first solve_and_render_scenario JSON."""
    cleaned = re.sub(r"<think>.*?</think>", "", raw_output, flags=re.DOTALL).strip()
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", cleaned):
        start = match.start()
        try:
            obj, _ = decoder.raw_decode(cleaned[start:])
        except json.JSONDecodeError:
            continue
        if (
            isinstance(obj, dict)
            and obj.get("action") == "solve_and_render_scenario"
            and isinstance(obj.get("scenarioSpec"), dict)
            and isinstance(obj["scenarioSpec"].get("kind"), str)
            and isinstance(obj.get("hiddenQuantities"), list)
            and len(obj["hiddenQuantities"]) >= 1
            and isinstance(obj.get("questionPlan"), dict)
        ):
            return obj
    return None


def _build_ollama_modelfile() -> str:
    return (
        "# SixthPhysics-Qwen3.5-9B (Q4_K_M default; swap FROM for Q6_K or Q8_0)\n"
        "# Usage:\n"
        "#   ollama create sixthphysics-qwen3.5-9b -f Modelfile\n"
        "#   ollama run sixthphysics-qwen3.5-9b\n"
        "FROM ./sixthphysics-qwen3.5-9b-Q4_K_M.gguf\n\n"
        "# Exact Qwen3.5 chat template with empty <think> block (enable_thinking=False)\n"
        "# matching the round1_sft_core two-turn neuro-symbolic harness training format.\n"
        'TEMPLATE """{{- if .Messages }}\n'
        '{{- range .Messages }}{{- if eq .Role "system" }}<|im_start|>system\n'
        "{{ .Content }}<|im_end|>\n"
        '{{- else if eq .Role "user" }}<|im_start|>user\n'
        "{{ .Content }}<|im_end|>\n"
        '{{- else if eq .Role "assistant" }}<|im_start|>assistant\n'
        "<think>\n\n"
        "</think>\n\n"
        "{{ .Content }}<|im_end|>\n"
        '{{- else if eq .Role "tool" }}<|im_start|>user\n'
        "<tool_response>\n"
        "{{ .Content }}\n"
        "</tool_response><|im_end|>\n"
        "{{- end }}\n"
        "{{ end }}<|im_start|>assistant\n"
        "<think>\n\n"
        "</think>\n\n"
        "{{- else }}\n"
        "{{- if .System }}<|im_start|>system\n"
        "{{ .System }}<|im_end|>\n"
        "{{- end }}\n"
        "{{- if .Prompt }}<|im_start|>user\n"
        "{{ .Prompt }}<|im_end|>\n"
        "{{- end }}<|im_start|>assistant\n"
        "<think>\n\n"
        "</think>\n\n"
        "{{- end }}{{ .Response }}{{ if .Response }}<|im_end|>{{ end }}\"\"\"\n\n"
        "PARAMETER temperature 0.0\n"
        "PARAMETER top_p 1.0\n"
        "PARAMETER num_ctx 8192\n"
        'PARAMETER stop "<|im_end|>"\n'
        'PARAMETER stop "<|endoftext|>"\n'
    )


def _build_gguf_model_card(
    quant_records: list[dict[str, Any]],
    llama_cpp_commit: str,
    gguf_meta: dict[str, Any],
    smoke_receipt: dict[str, Any],
    merge_stats: dict[str, Any],
) -> str:
    rows: list[str] = []
    ram_guide = {
        "Q4_K_M": "~7.5 GB VRAM/RAM (8 GB GPU / 16 GB MacBook)",
        "Q6_K": "~9.5 GB VRAM/RAM (10–12 GB GPU / 16 GB MacBook)",
        "Q8_0": "~11.5 GB VRAM/RAM (12–16 GB GPU / 16+ GB RAM)",
    }
    for rec in quant_records:
        q = rec["quant"]
        fname = rec["filename"]
        size_gb = rec["size_gb"]
        size_gib = rec["size_gib"]
        size_bytes = f"{rec['size_bytes']:,}"
        sha_short = rec["sha256"][:16]
        rec_note = rec["notes"]
        rows.append(
            f"| `{q}` | [`{fname}`](./{fname}) | {size_gb} ({size_gib}, `{size_bytes}` B) "
            f"| {ram_guide[q]} | `{sha_short}...` | {rec_note} |"
        )
    quant_table = "\n".join(rows)
    smoke_json_pretty = json.dumps(smoke_receipt["parsed_json"], indent=2)

    return f"""---
base_model:
  - {BASE_MODEL_ID}
  - {SOURCE_LORA_REPO_ID}
base_model_relation: quantized
datasets:
  - {DATASET_REPO_ID}
license: apache-2.0
language:
  - en
pipeline_tag: text-generation
tags:
  - gguf
  - llama-cpp
  - ollama
  - lm-studio
  - physics
  - education
  - neuro-symbolic
  - tool-use
  - qwen3_5
  - ib-physics
  - a-level-physics
  - ncuk-ify
---

# SixthPhysics-Qwen3.5-9B-GGUF

**Live Practice App:** [sixthphysics.github.io](https://sixthphysics.github.io) · **Source Code:** [sixthphysics/sixthphysics](https://github.com/sixthphysics/sixthphysics) · **LoRA Adapter (`bf16`):** [{SOURCE_LORA_REPO_ID}](https://huggingface.co/{SOURCE_LORA_REPO_ID}) · **Dataset & Benchmark:** [{DATASET_REPO_ID}](https://huggingface.co/datasets/{DATASET_REPO_ID})

## Overview

Quantized **GGUF** builds of the promoted SixthPhysics champion model (`round1_sft_core` `bf16` LoRA merged cleanly into [`{BASE_MODEL_ID}`](https://huggingface.co/{BASE_MODEL_ID}), vision tower frozen / text backbone exported cleanly for local CPU & consumer GPU inference).

SixthPhysics-Qwen3.5-9B is trained for the **SixthPhysics two-turn neuro-symbolic physics question generation harness** across three pre-university specifications simultaneously:
- **IB Physics (First Assessment 2025)** — SL & HL (`g = 9.8 m s^-2`, excluding retired IB 2016 options/topics)
- **UK A-Level Physics (DfE / AQA 7408 core)** — Year 12 (AS) & Year 13 (`g = 9.81 m s^-2`)
- **NCUK International Foundation Year (IFY) Physics (`IFYPH005`)** — Semesters 1 & 2 (`g = 9.81 m s^-2`)

> **Important inference note (`enable_thinking=False`):** The champion adapter was fine-tuned with Qwen3.5's empty `<think>\\n\\n</think>\\n\\n` prefix so Turn 1 (`propose_scenario`) and Turn 2 (`author_package`) emit clean raw JSON immediately. Disable reasoning/thinking (`--reasoning off` in `llama.cpp`, `think: false` in Ollama API, or the included [`Modelfile`](./Modelfile)) for best results.

## Available GGUF Quantizations

| Quant | File | Verified Size | Minimum Memory (8K ctx) | SHA-256 Prefix | Recommended Fit |
| --- | --- | --- | --- | --- | --- |
{quant_table}

## Quickstart

### 1. Ollama (1-Line Pull & Run + Live Neuro-Symbolic Harness)

Run directly from Hugging Face via Ollama:

```bash
ollama run hf.co/{TARGET_GGUF_REPO_ID}:Q4_K_M
```

Or generate solver-verified, SVG-rendered questions locally with the SixthPhysics closed-loop harness:

```bash
git clone https://github.com/sixthphysics/sixthphysics.git
cd sixthphysics && npm ci

ollama pull hf.co/{TARGET_GGUF_REPO_ID}:Q4_K_M
npm run generate:live -- \\
  --syllabus ib --level HL --topic ib-theme-c --format mcq \\
  --backend ollama --model hf.co/{TARGET_GGUF_REPO_ID}:Q4_K_M
```

To build a named local Ollama model with our tuned `Modelfile` (`enable_thinking=False`, `num_ctx=8192`, `temperature=0.0`):

```bash
hf download {TARGET_GGUF_REPO_ID} sixthphysics-qwen3.5-9b-Q4_K_M.gguf Modelfile --local-dir ./sixthphysics-gguf
cd sixthphysics-gguf
ollama create sixthphysics-qwen3.5-9b -f Modelfile
```

### 2. `llama.cpp` (`llama-server`)

```bash
llama-server \\
  -hf {TARGET_GGUF_REPO_ID}:Q4_K_M \\
  --ctx-size 8192 \\
  --port 8080 \\
  --jinja \\
  --reasoning off

# Connect the SixthPhysics live harness to llama-server:
npm run generate:live -- \\
  --syllabus alevel --level Y13 --domain mechanics --format mcq \\
  --backend openai --base-url http://127.0.0.1:8080/v1 --model sixthphysics-qwen3.5-9b
```

### 3. LM Studio

1. Open LM Studio and search **`{TARGET_GGUF_REPO_ID}`**.
2. Download **`sixthphysics-qwen3.5-9b-Q4_K_M.gguf`** (or `Q6_K` / `Q8_0` if you have 12+ GB VRAM/RAM).
3. Load the model with context length `8192`, temperature `0.0`, and thinking disabled, then start the Local Server (`http://127.0.0.1:1234/v1`).
4. Point the SixthPhysics harness at LM Studio:

```bash
npm run generate:live -- \\
  --syllabus ncuk --level IFY --domain circuits --format structured \\
  --backend openai --base-url http://127.0.0.1:1234/v1 --model sixthphysics-qwen3.5-9b
```

## Source Champion Benchmarks (`bf16` Merged LoRA)

Full methodology, 95% Wilson confidence intervals, per-syllabus breakdowns, and qualitative spot-checks are documented on [{SOURCE_LORA_REPO_ID}](https://huggingface.co/{SOURCE_LORA_REPO_ID}). Headline `bf16` results on Modal H100 (family-disjoint splits, `0` contamination):

| Benchmark Split & Protocol | Untuned `Qwen/Qwen3.5-9B` E2E | Champion (`round1_sft_core`) E2E | Champion Syllabus Alignment |
| --- | ---: | ---: | ---: |
| Locked `test.jsonl` — 0-Retry (`N = 586`, 28 unseen families) | `0.00%` | **`64.51%`** `[60.55%, 68.27%]` | **`78.50%`** (`100.00%` of solved) |
| Locked `test.jsonl` — 1-Retry Closed-Loop (`N = 586`) | `0.34%` | **`75.60%`** `[71.96%, 78.90%]` | **`87.03%`** (`100.00%` of solved) |
| Locked `test.jsonl` — Teacher-Forced Step 2 (`N = 586`) | `0.68%` | **`90.61%`** `[87.98%, 92.72%]` | **`99.32%`** |
| Out-of-Sample `Novel-1500` — 1-Retry (`500` IB / `500` A-Level / `500` NCUK) | — | **`78.40%`** `[76.25%, 80.41%]` | **`91.07%`** (`99.85%` of solved) |

*(Note: Quantized `Q4_K_M` / `Q6_K` / `Q8_0` GGUFs are converted directly from these exact `bf16` merged weights; full benchmark tables above were measured at `bf16`.)*

## Merge, Conversion & Live `Q4_K_M` Smoke-Test Provenance

- **Merge Integrity:** `{SOURCE_LORA_REPO_ID}` (`round1_sft_core`, LoRA `r=32, alpha=64`) merged into `{BASE_MODEL_ID}` in `bfloat16` (`{merge_stats["tensor_count"]}` tensors, `{merge_stats["total_params"]:,}` parameters, **`0` NaN / `0` Inf**).
- **Converter:** Upstream [`ggml-org/llama.cpp`](https://github.com/ggml-org/llama.cpp) commit `{llama_cpp_commit}` (`convert_hf_to_gguf.py --outtype bf16 --no-mtp`, `llama-quantize`).
- **Verified GGUF Metadata (`Q4_K_M`):** `general.architecture = {gguf_meta.get("architecture")}`, `block_count = {gguf_meta.get("block_count")}`, `tensors = {gguf_meta.get("tensor_count")}`, `chat_template_embedded = {gguf_meta.get("has_chat_template")}`.
- **Live `Q4_K_M` Turn-1 Smoke Test (`{smoke_receipt["runner"]}`, CPU, `temp=0`, `enable_thinking=False`, `{smoke_receipt["elapsed_sec"]}s`):**
  Prompt: IB Physics HL (`ib-theme-a` / `ib-a1-kinematics`, `mechanics`, `mcq`, `seed=90000052`). Verified valid `solve_and_render_scenario` JSON proposal:

```json
{smoke_json_pretty}
```

## License

Apache 2.0 (matching `{BASE_MODEL_ID}` and `{SOURCE_LORA_REPO_ID}`).
"""


@app.function(
    cpu=16,
    memory=65536,
    timeout=3600,
    volumes={VOLUME_MOUNT: vol},
)
def merge_quantize_and_publish(dry_run: bool = False) -> dict[str, Any]:
    """Merge bf16 champion LoRA, convert & quantize GGUFs, smoke-test Q4_K_M, upload to HF."""
    import torch
    from huggingface_hub import HfApi
    from peft import PeftModel
    from safetensors import safe_open
    from transformers import AutoModelForImageTextToText, AutoTokenizer

    sys.path.insert(0, f"{LLAMA_CPP_DIR}/gguf-py")
    import gguf

    t_start = time.time()
    hf_token = os.environ.get("HF_TOKEN", "").strip()
    if not dry_run and not hf_token:
        raise RuntimeError("HF_TOKEN missing in Modal function environment.")

    work_dir = Path("/tmp/sixthphysics_gguf_work")
    merged_dir = Path("/tmp/merged_hf")
    bf16_gguf_path = Path("/tmp/sixthphysics-qwen3.5-9b-bf16.gguf")
    quant_out_dir = Path("/tmp/sixthphysics_gguf_out")

    for p in (work_dir, merged_dir, quant_out_dir):
        if p.exists():
            shutil.rmtree(p)
        p.mkdir(parents=True, exist_ok=True)
    if bf16_gguf_path.exists():
        bf16_gguf_path.unlink()

    try:
        # ------------------------------------------------------------------
        # Step 0: Record llama.cpp commit SHA
        # ------------------------------------------------------------------
        git_rev = _run_cmd(["git", "-C", LLAMA_CPP_DIR, "rev-parse", "--short=12", "HEAD"])
        llama_cpp_commit = git_rev.stdout.strip()
        print(f"[{_utc_now()}] llama.cpp HEAD={llama_cpp_commit}", flush=True)

        # ------------------------------------------------------------------
        # Step 1: Load Qwen/Qwen3.5-9B (bf16 CPU) + Champion LoRA -> Merge
        # ------------------------------------------------------------------
        t1 = time.time()
        base_model_src = _resolve_cached_base_model_dir()
        adapter_dir = Path(CHAMPION_ADAPTER_DIR)
        if not (adapter_dir / "adapter_model.safetensors").is_file():
            raise FileNotFoundError(
                f"Champion adapter missing at {adapter_dir / 'adapter_model.safetensors'}"
            )
        print(
            f"[{_utc_now()}] Step 1: Merging bf16 LoRA from {adapter_dir} into {base_model_src}",
            flush=True,
        )

        # Verify adapter tensors have 0 NaN/Inf before merge
        adapter_tensors = 0
        with safe_open(str(adapter_dir / "adapter_model.safetensors"), framework="pt") as sf:
            for key in sf.keys():
                t = sf.get_tensor(key)
                adapter_tensors += 1
                if not torch.isfinite(t).all().item():
                    raise RuntimeError(f"Non-finite value detected in adapter tensor: {key}")
        print(
            f"[{_utc_now()}] Adapter pre-check passed: {adapter_tensors} tensors, 0 NaN/Inf.",
            flush=True,
        )

        tokenizer = AutoTokenizer.from_pretrained(base_model_src, trust_remote_code=False)
        base_model = AutoModelForImageTextToText.from_pretrained(
            base_model_src,
            dtype=torch.bfloat16,
            device_map="cpu",
            low_cpu_mem_usage=True,
            trust_remote_code=False,
        )
        peft_model = PeftModel.from_pretrained(
            base_model,
            str(adapter_dir),
            is_trainable=False,
        )
        merged = peft_model.merge_and_unload()

        # Verify 0 NaN / 0 Inf across all merged parameters
        tensor_count = 0
        total_params = 0
        nan_tensors: list[str] = []
        inf_tensors: list[str] = []
        for pname, param in merged.named_parameters():
            tensor_count += 1
            total_params += param.numel()
            if not torch.isfinite(param).all().item():
                if torch.isnan(param).any().item():
                    nan_tensors.append(pname)
                if torch.isinf(param).any().item():
                    inf_tensors.append(pname)
        if nan_tensors or inf_tensors:
            raise RuntimeError(
                f"Merged model contains non-finite weights: "
                f"nan={nan_tensors[:5]}, inf={inf_tensors[:5]}"
            )

        merge_stats = {
            "adapter_tensors": adapter_tensors,
            "tensor_count": tensor_count,
            "total_params": total_params,
            "nan_count": 0,
            "inf_count": 0,
        }
        print(
            f"[{_utc_now()}] Merge verified: {tensor_count} tensors, "
            f"{total_params:,} params, 0 NaN/Inf. Saving to {merged_dir}...",
            flush=True,
        )

        merged.save_pretrained(str(merged_dir), max_shard_size="5GB", safe_serialization=True)
        tokenizer.save_pretrained(str(merged_dir))

        # Guarantee chat_template.jinja is present in merged_dir for convert_hf_to_gguf.py
        merged_chat_tpl = merged_dir / "chat_template.jinja"
        if not merged_chat_tpl.is_file():
            for candidate in (
                adapter_dir / "chat_template.jinja",
                Path(base_model_src) / "chat_template.jinja",
            ):
                if candidate.is_file():
                    shutil.copy2(candidate, merged_chat_tpl)
                    print(f"[{_utc_now()}] Copied chat_template.jinja from {candidate}", flush=True)
                    break

        # Render exact smoke-test prompt before releasing tokenizer
        smoke_sys_prompt = _build_augmented_system_prompt("mechanics")
        smoke_user_prompt = json.dumps(SMOKE_TEST_USER_PROMPT_OBJ, separators=(",", ":"))
        smoke_rendered_prompt = tokenizer.apply_chat_template(
            [
                {"role": "system", "content": smoke_sys_prompt},
                {"role": "user", "content": smoke_user_prompt},
            ],
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        smoke_prompt_file = work_dir / "smoke_rendered_prompt.txt"
        smoke_prompt_file.write_text(smoke_rendered_prompt, encoding="utf-8")

        # Inspect saved merged config & check if MTP weights exist
        merged_cfg = json.loads((merged_dir / "config.json").read_text(encoding="utf-8"))
        has_mtp_weights = False
        idx_file = merged_dir / "model.safetensors.index.json"
        if idx_file.is_file():
            wmap = json.loads(idx_file.read_text(encoding="utf-8")).get("weight_map", {})
            has_mtp_weights = any(
                k.startswith("mtp.") or k.startswith("model.mtp.") for k in wmap
            )
        print(
            f"[{_utc_now()}] Saved merged HF in {time.time() - t1:.1f}s | "
            f"architectures={merged_cfg.get('architectures')} | "
            f"has_mtp_weights={has_mtp_weights} | "
            f"chat_template_jinja={merged_chat_tpl.is_file()}",
            flush=True,
        )

        # Free RAM immediately before GGUF conversion
        del merged, peft_model, base_model, tokenizer
        gc.collect()
        merge_stats["elapsed_sec"] = round(time.time() - t1, 1)

        # ------------------------------------------------------------------
        # Step 2: Convert merged HF -> bf16 GGUF -> Q4_K_M, Q6_K, Q8_0
        # ------------------------------------------------------------------
        t2 = time.time()
        convert_cmd = [
            sys.executable,
            f"{LLAMA_CPP_DIR}/convert_hf_to_gguf.py",
            str(merged_dir),
            "--outfile",
            str(bf16_gguf_path),
            "--outtype",
            "bf16",
            "--model-name",
            "SixthPhysics-Qwen3.5-9B",
        ]
        if not has_mtp_weights:
            convert_cmd.append("--no-mtp")

        print(f"[{_utc_now()}] Step 2a: Converting merged HF to bf16 GGUF...", flush=True)
        conv_proc = _run_cmd(convert_cmd, timeout=1200)
        for line in (conv_proc.stderr or "").splitlines()[-15:]:
            print(f"  [convert] {line}", flush=True)

        bf16_bytes = bf16_gguf_path.stat().st_size
        bf16_gb, bf16_gib = _format_size(bf16_bytes)
        print(
            f"[{_utc_now()}] Produced bf16 GGUF: {bf16_gb} ({bf16_gib}, {bf16_bytes:,} B) "
            f"in {time.time() - t2:.1f}s",
            flush=True,
        )

        # Reclaim ~19 GB immediately
        shutil.rmtree(merged_dir)
        print(f"[{_utc_now()}] Removed temporary {merged_dir}", flush=True)

        # Quantize to Q4_K_M, Q6_K, Q8_0
        n_threads = os.cpu_count() or 16
        quantize_bin = f"{LLAMA_CPP_DIR}/build/bin/llama-quantize"
        quant_records: list[dict[str, Any]] = []
        for qtype, fname, notes in QUANT_SPECS:
            tq = time.time()
            out_path = quant_out_dir / fname
            print(f"[{_utc_now()}] Step 2b: Quantizing {qtype} -> {fname}...", flush=True)
            q_proc = _run_cmd(
                [quantize_bin, str(bf16_gguf_path), str(out_path), qtype, str(n_threads)],
                timeout=1200,
            )
            for line in (q_proc.stderr or "").splitlines()[-6:]:
                print(f"  [{qtype}] {line}", flush=True)

            fbytes = out_path.stat().st_size
            fgb, fgib = _format_size(fbytes)
            sha256 = _sha256_file(out_path)
            rec = {
                "quant": qtype,
                "filename": fname,
                "path": str(out_path),
                "size_bytes": fbytes,
                "size_gb": fgb,
                "size_gib": fgib,
                "sha256": sha256,
                "notes": notes,
                "elapsed_sec": round(time.time() - tq, 1),
            }
            quant_records.append(rec)
            print(
                f"[{_utc_now()}] Verified {fname}: {fgb} ({fgib}, {fbytes:,} B) | "
                f"sha256={sha256[:16]}... | {rec['elapsed_sec']}s",
                flush=True,
            )

        # Reclaim ~18 GB intermediate bf16 GGUF immediately
        bf16_gguf_path.unlink()
        print(f"[{_utc_now()}] Removed temporary {bf16_gguf_path}", flush=True)

        # Inspect Q4_K_M GGUF header metadata
        q4_path = quant_out_dir / "sixthphysics-qwen3.5-9b-Q4_K_M.gguf"
        reader = gguf.GGUFReader(str(q4_path))

        def _read_field(key: str) -> Any:
            field = reader.get_field(key)
            if field is None:
                return None
            return field.contents()

        arch = _read_field("general.architecture")
        block_count = _read_field(f"{arch}.block_count") if arch else None
        chat_tpl_val = _read_field("tokenizer.chat_template")
        gguf_meta = {
            "architecture": arch,
            "block_count": block_count,
            "tensor_count": len(reader.tensors),
            "has_chat_template": bool(isinstance(chat_tpl_val, str) and len(chat_tpl_val) > 50),
            "rope_dimension_sections": _read_field(f"{arch}.rope.dimension_sections")
            if arch
            else None,
        }
        print(f"[{_utc_now()}] Q4_K_M GGUF metadata: {json.dumps(gguf_meta)}", flush=True)
        if not gguf_meta["has_chat_template"]:
            raise RuntimeError("GGUF missing embedded tokenizer.chat_template metadata!")

        # ------------------------------------------------------------------
        # Step 3: Live Q4_K_M Smoke Test inside Modal with llama-cli
        # ------------------------------------------------------------------
        t3 = time.time()
        print(
            f"[{_utc_now()}] Step 3: Live Q4_K_M smoke test on IB HL mechanics Turn-1 prompt...",
            flush=True,
        )
        llama_cli_bin = f"{LLAMA_CPP_DIR}/build/bin/llama-cli"
        llama_completion_bin = f"{LLAMA_CPP_DIR}/build/bin/llama-completion"

        runner_used = "llama-cli"
        cli_cmd = [
            llama_cli_bin,
            "-m",
            str(q4_path),
            "-st",
            "--simple-io",
            "--no-display-prompt",
            "--reasoning",
            "off",
            "--chat-template-kwargs",
            '{"enable_thinking":false}',
            "-sys",
            smoke_sys_prompt,
            "-p",
            smoke_user_prompt,
            "-n",
            "512",
            "-c",
            "4096",
            "-t",
            str(n_threads),
            "--temp",
            "0",
            "--top-k",
            "1",
            "--seed",
            "42",
        ]
        smoke_proc = _run_cmd(cli_cmd, timeout=300, check=False)
        parsed_step1 = _extract_step1_json(smoke_proc.stdout or "")
        raw_smoke_stdout = (smoke_proc.stdout or "").strip()

        if smoke_proc.returncode != 0 or parsed_step1 is None:
            print(
                f"[{_utc_now()}] llama-cli attempt rc={smoke_proc.returncode}, "
                f"parsed={parsed_step1 is not None}; retrying with llama-completion "
                "using exact rendered chat-template prompt...",
                flush=True,
            )
            if smoke_proc.stderr:
                print(f"  [llama-cli stderr tail] {smoke_proc.stderr[-1200:]}", flush=True)
            runner_used = "llama-completion"
            comp_cmd = [
                llama_completion_bin,
                "-m",
                str(q4_path),
                "-f",
                str(smoke_prompt_file),
                "-no-cnv",
                "--no-display-prompt",
                "-n",
                "512",
                "-c",
                "4096",
                "-t",
                str(n_threads),
                "--temp",
                "0",
                "--top-k",
                "1",
                "--seed",
                "42",
            ]
            smoke_proc = _run_cmd(comp_cmd, timeout=300, check=True)
            raw_smoke_stdout = (smoke_proc.stdout or "").strip()
            parsed_step1 = _extract_step1_json(raw_smoke_stdout)

        if parsed_step1 is None:
            raise RuntimeError(
                "Q4_K_M smoke test did not emit valid solve_and_render_scenario JSON!\n"
                f"--- RAW STDOUT ---\n{raw_smoke_stdout[:2500]}\n"
                f"--- RAW STDERR ---\n{(smoke_proc.stderr or '')[-1500:]}"
            )

        smoke_receipt = {
            "runner": runner_used,
            "elapsed_sec": round(time.time() - t3, 1),
            "prompt_id": "novel-ib-0052",
            "action": parsed_step1.get("action"),
            "domain": parsed_step1.get("domain"),
            "scenario_kind": parsed_step1.get("scenarioSpec", {}).get("kind"),
            "hidden_quantities": parsed_step1.get("hiddenQuantities"),
            "parsed_json": parsed_step1,
        }
        print(
            f"[{_utc_now()}] Q4_K_M smoke test PASSED ({runner_used}, "
            f"{smoke_receipt['elapsed_sec']}s): action={smoke_receipt['action']}, "
            f"domain={smoke_receipt['domain']}, kind={smoke_receipt['scenario_kind']}",
            flush=True,
        )

        # ------------------------------------------------------------------
        # Step 4: Generate Modelfile & Model Card, then publish to HF Hub
        # ------------------------------------------------------------------
        modelfile_path = quant_out_dir / "Modelfile"
        modelfile_path.write_text(_build_ollama_modelfile(), encoding="utf-8")

        readme_path = quant_out_dir / "README.md"
        readme_path.write_text(
            _build_gguf_model_card(
                quant_records=quant_records,
                llama_cpp_commit=llama_cpp_commit,
                gguf_meta=gguf_meta,
                smoke_receipt=smoke_receipt,
                merge_stats=merge_stats,
            ),
            encoding="utf-8",
        )

        uploads: list[dict[str, Any]] = []
        if not dry_run:
            t4 = time.time()
            print(
                f"[{_utc_now()}] Step 4: Publishing directly from Modal to "
                f"https://huggingface.co/{TARGET_GGUF_REPO_ID}...",
                flush=True,
            )
            api = HfApi(token=hf_token)
            api.create_repo(
                repo_id=TARGET_GGUF_REPO_ID,
                repo_type="model",
                private=False,
                exist_ok=True,
            )

            files_to_upload: list[tuple[Path, str, str]] = [
                (
                    quant_out_dir / rec["filename"],
                    rec["filename"],
                    f"Upload {rec['quant']} GGUF ({rec['size_gb']}, sha256:{rec['sha256'][:12]})",
                )
                for rec in quant_records
            ]
            files_to_upload.extend(
                [
                    (modelfile_path, "Modelfile", "Add Ollama Modelfile for Qwen3.5-9B harness"),
                    (
                        readme_path,
                        "README.md",
                        "Add SixthPhysics-Qwen3.5-9B-GGUF model card and verification receipts",
                    ),
                ]
            )

            for local_path, repo_path, commit_msg in files_to_upload:
                tf = time.time()
                info = api.upload_file(
                    path_or_fileobj=str(local_path),
                    path_in_repo=repo_path,
                    repo_id=TARGET_GGUF_REPO_ID,
                    repo_type="model",
                    commit_message=commit_msg,
                )
                commit_oid = getattr(info, "oid", None) or str(info)
                uploads.append(
                    {
                        "path_in_repo": repo_path,
                        "size_bytes": local_path.stat().st_size,
                        "elapsed_sec": round(time.time() - tf, 1),
                        "commit_info": commit_oid,
                    }
                )
                print(
                    f"[{_utc_now()}] Uploaded {repo_path} "
                    f"({local_path.stat().st_size:,} B) in {time.time() - tf:.1f}s",
                    flush=True,
                )
            print(
                f"[{_utc_now()}] All {len(uploads)} files uploaded in {time.time() - t4:.1f}s.",
                flush=True,
            )

        summary = {
            "completed_at": _utc_now(),
            "repo_id": TARGET_GGUF_REPO_ID,
            "repo_url": f"https://huggingface.co/{TARGET_GGUF_REPO_ID}",
            "dry_run": dry_run,
            "llama_cpp_commit": llama_cpp_commit,
            "merge_stats": merge_stats,
            "gguf_meta": gguf_meta,
            "quants": [
                {
                    "quant": r["quant"],
                    "filename": r["filename"],
                    "size_bytes": r["size_bytes"],
                    "size_gb": r["size_gb"],
                    "size_gib": r["size_gib"],
                    "sha256": r["sha256"],
                    "elapsed_sec": r["elapsed_sec"],
                }
                for r in quant_records
            ],
            "smoke_receipt": smoke_receipt,
            "uploads": uploads,
            "total_elapsed_sec": round(time.time() - t_start, 1),
        }
        return summary
    finally:
        # Clean up all temporary artifacts inside container
        for cleanup_path in (work_dir, merged_dir, quant_out_dir):
            if cleanup_path.exists():
                shutil.rmtree(cleanup_path, ignore_errors=True)
        if bf16_gguf_path.exists():
            bf16_gguf_path.unlink(missing_ok=True)


def _resolve_local_hf_token() -> str:
    """Resolve HF write token silently in-memory on the local launcher without printing it."""
    for env_key in ("HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"):
        val = os.environ.get(env_key, "").strip()
        if val:
            return val

    try:
        import huggingface_hub  # type: ignore[import-not-found]

        tok = huggingface_hub.get_token()
        if isinstance(tok, str) and tok.strip():
            return tok.strip()
    except Exception:
        pass

    candidate_paths: list[Path] = []
    hf_home = os.environ.get("HF_HOME", "").strip()
    if hf_home:
        candidate_paths.append(Path(hf_home) / "token")
    candidate_paths.append(Path.home() / ".cache" / "huggingface" / "token")

    for path in candidate_paths:
        if path.is_file():
            val = path.read_text(encoding="utf-8").strip()
            if val:
                return val

    raise RuntimeError(
        "No Hugging Face token found in HF_TOKEN, HUGGING_FACE_HUB_TOKEN, "
        "huggingface_hub.get_token(), or standard HF cache token path."
    )


@app.local_entrypoint()
def main(dry_run: bool = False) -> None:
    """Launch cloud-only Modal CPU merge + GGUF quantize + smoke-test + HF upload."""
    secrets: list[modal.Secret] = []
    if not dry_run:
        token = _resolve_local_hf_token()
        secrets.append(modal.Secret.from_dict({"HF_TOKEN": token}))

    fn = (
        merge_quantize_and_publish.with_options(secrets=secrets)
        if secrets
        else merge_quantize_and_publish
    )
    receipt = fn.remote(dry_run=dry_run)
    print("\n=== GGUF MERGE, QUANTIZE & PUBLISH RECEIPT ===")
    print(json.dumps(receipt, indent=2))
