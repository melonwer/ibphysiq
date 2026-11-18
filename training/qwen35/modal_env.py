"""Shared Modal cloud GPU environment for SixthPhysics Qwen/Qwen3.5-9B runs."""

from pathlib import Path
import modal

APP_PREFIX = "sixthphysics-qwen35"
BASE_MODEL_ID = "Qwen/Qwen3.5-9B"
VOLUME_NAME = "sixthphysics-qwen35-vol"
VOLUME_MOUNT = "/vol"
HF_CACHE_DIR = f"{VOLUME_MOUNT}/hf_cache"
RUNS_REMOTE_DIR = f"{VOLUME_MOUNT}/runs"
DATA_REMOTE_DIR = f"{VOLUME_MOUNT}/data"
WORKSPACE_REMOTE_DIR = "/workspace/sixthphysics"

LOCAL_PACKAGE_DIR = Path(__file__).resolve().parent
_CANDIDATE_REPO_ROOT = LOCAL_PACKAGE_DIR.parent.parent
REPO_ROOT = (
    _CANDIDATE_REPO_ROOT
    if (_CANDIDATE_REPO_ROOT / "package.json").exists()
    else Path(WORKSPACE_REMOTE_DIR)
)

vol = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


def build_qwen35_image() -> modal.Image:
    """Build self-contained Modal image with Python 3.11 ML stack + Node.js 22 + repo TS harness."""
    img = (
        modal.Image.debian_slim(python_version="3.11")
        .apt_install("git", "ffmpeg")
        .uv_pip_install(
            "vllm==0.34.0",
            "transformers>=5.16.1,<5.23.0",
            "accelerate>=1.11.0",
            "peft==0.21.3",
            "trl==1.18.1",
            "datasets",
            "bitsandbytes==0.50.2",
            "safetensors",
            "sentencepiece",
            "huggingface_hub[hf_transfer]",
            "pillow",
            "flash-linear-attention==0.6.0",
        )
        .apt_install("curl", "ca-certificates", "gnupg")
        .run_commands(
            "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - "
            "&& apt-get install -y nodejs "
            "&& node --version && npm --version"
        )
    )

    pkg_json = REPO_ROOT / "package.json"
    pkg_lock = REPO_ROOT / "package-lock.json"
    if pkg_json.exists() and pkg_lock.exists():
        img = (
            img.add_local_file(
                str(pkg_json),
                remote_path=f"{WORKSPACE_REMOTE_DIR}/package.json",
                copy=True,
            )
            .add_local_file(
                str(pkg_lock),
                remote_path=f"{WORKSPACE_REMOTE_DIR}/package-lock.json",
                copy=True,
            )
            .run_commands(
                f"cd {WORKSPACE_REMOTE_DIR} "
                "&& PUPPETEER_SKIP_DOWNLOAD=1 npm ci --no-audit --no-fund "
                "&& npm install -g tsx "
                "&& npx tsx --version"
            )
        )

    img = img.env(
        {
            "HF_HOME": HF_CACHE_DIR,
            "HUGGINGFACE_HUB_CACHE": f"{HF_CACHE_DIR}/hub",
            "HF_HUB_ENABLE_HF_TRANSFER": "1",
            "TOKENIZERS_PARALLELISM": "false",
            "PYTHONPATH": "/root",
            "SIXTHPHYSICS_WORKSPACE": WORKSPACE_REMOTE_DIR,
        }
    )

    tsconfig = REPO_ROOT / "tsconfig.json"
    if tsconfig.exists():
        img = img.add_local_file(
            str(tsconfig),
            remote_path=f"{WORKSPACE_REMOTE_DIR}/tsconfig.json",
            copy=True,
        )

    types_dir = REPO_ROOT / "types"
    if types_dir.exists():
        img = img.add_local_dir(
            str(types_dir),
            remote_path=f"{WORKSPACE_REMOTE_DIR}/types",
            copy=True,
        )

    lib_dir = REPO_ROOT / "lib"
    if lib_dir.exists():
        img = img.add_local_dir(
            str(lib_dir),
            remote_path=f"{WORKSPACE_REMOTE_DIR}/lib",
            copy=True,
            ignore=[
                "**/__tests__/**",
                "*.test.ts",
                "*.test.tsx",
                "**/sixthphysics-web/**",
                "**/review/**",
            ],
        )

    bench_scripts_dir = REPO_ROOT / "scripts" / "benchmark"
    if bench_scripts_dir.exists():
        img = img.add_local_dir(
            str(bench_scripts_dir),
            remote_path=f"{WORKSPACE_REMOTE_DIR}/scripts/benchmark",
            copy=True,
        )

    if LOCAL_PACKAGE_DIR.exists() and str(LOCAL_PACKAGE_DIR) != "/root/qwen35":
        img = img.add_local_dir(
            str(LOCAL_PACKAGE_DIR),
            remote_path="/root/qwen35",
            copy=True,
            ignore=["__pycache__", "*.pyc"],
        )

    return img


qwen35_image = build_qwen35_image()
