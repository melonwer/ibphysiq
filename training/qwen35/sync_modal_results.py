#!/usr/bin/env python3
"""Sync live progress, round metrics, champion adapter, and reports from Modal Volume.

Usage:
    python3 training/qwen35/sync_modal_results.py
    python3 training/qwen35/sync_modal_results.py --include-rollouts
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

# Strictly 0% local GPU usage on laptop battery
os.environ["CUDA_VISIBLE_DEVICES"] = ""

try:
    import modal
    from modal.volume import FileEntryType
except ImportError:
    _venv_py = Path("/home/d4ydy/.venvs/default/bin/python3")
    if _venv_py.exists() and Path(sys.executable).resolve() != _venv_py.resolve():
        os.execv(str(_venv_py), [str(_venv_py), *sys.argv])
    raise

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
VOLUME_NAME = "sixthphysics-qwen35-vol"
REMOTE_RUN_ROOT = "runs/autonomous"
LOCAL_OUT_DIR = REPO_ROOT / "dataset" / "qwen35-9b-runs"
DOCS_DIR = REPO_ROOT / "docs"
MODAL_BIN = Path("/home/d4ydy/.venvs/default/bin/modal")


def _read_volume_bytes(vol: modal.Volume, remote_path: str) -> bytes:
    chunks: list[bytes] = []
    for chunk in vol.read_file(remote_path):
        chunks.append(chunk)
    return b"".join(chunks)


def _list_modal_apps() -> list[dict[str, Any]]:
    modal_cmd = str(MODAL_BIN) if MODAL_BIN.exists() else "modal"
    try:
        proc = subprocess.run(
            [modal_cmd, "app", "list", "--json"],
            capture_output=True,
            text=True,
            check=False,
            timeout=20,
            env={**os.environ, "CUDA_VISIBLE_DEVICES": ""},
        )
        if proc.returncode == 0 and proc.stdout.strip():
            apps = json.loads(proc.stdout)
            if isinstance(apps, list):
                return [
                    a
                    for a in apps
                    if isinstance(a, dict)
                    and "sixthphysics-qwen35" in str(a.get("description", ""))
                ]
    except Exception:
        pass
    return []


def _format_pct(val: Any) -> str:
    if isinstance(val, (int, float)):
        return f"{100.0 * float(val):.2f}%"
    return "—"


def sync_results(include_rollouts: bool = True) -> int:
    print("=== SixthPhysics Modal Cloud Sync (0% Local GPU) ===")
    apps = _list_modal_apps()
    if apps:
        print("\nModal Apps matching 'sixthphysics-qwen35*':")
        for a in apps[:8]:
            print(
                f"  - {a.get('app_id')} | {a.get('description')} | "
                f"state={a.get('state')} | tasks={a.get('tasks')} | created={a.get('created_at')}"
            )
    else:
        print("\nNo matching Modal apps returned by `modal app list`.")

    vol = modal.Volume.from_name(VOLUME_NAME, create_if_missing=False)
    LOCAL_OUT_DIR.mkdir(parents=True, exist_ok=True)

    # List remote artifacts via control-plane metadata first
    try:
        entries = list(vol.listdir(REMOTE_RUN_ROOT, recursive=True))
    except Exception as exc:
        print(f"\nRemote directory '{REMOTE_RUN_ROOT}' not yet populated on '{VOLUME_NAME}': {exc}")
        return 0

    file_entries = [e for e in entries if e.type == FileEntryType.FILE]
    print(f"\nRemote volume '{VOLUME_NAME}/{REMOTE_RUN_ROOT}' contains {len(file_entries)} file(s):")
    for e in file_entries[:30]:
        sz_kb = (getattr(e, "size", 0) or 0) / 1024.0
        print(f"  - {e.path} ({sz_kb:.1f} KiB)")
    if len(file_entries) > 30:
        print(f"  ... and {len(file_entries) - 30} more file(s)")

    files_synced = 0
    bytes_synced = 0
    download_blocked_err: str | None = None

    for entry in file_entries:
        rel_from_vol = entry.path.lstrip("/")
        if not rel_from_vol.startswith(REMOTE_RUN_ROOT + "/"):
            rel_sub = Path(rel_from_vol).name
        else:
            rel_sub = rel_from_vol[len(REMOTE_RUN_ROOT) + 1 :]

        if "/checkpoint-" in f"/{rel_sub}":
            continue
        if not include_rollouts and ("/rollouts/" in f"/{rel_sub}" or rel_sub.endswith("_rollouts.jsonl")):
            continue

        local_target = LOCAL_OUT_DIR / rel_sub
        if (
            local_target.exists()
            and local_target.suffix in {".safetensors", ".bin"}
            and not rel_sub.startswith("champion-adapter/")
            and getattr(entry, "size", None) == local_target.stat().st_size
        ):
            continue

        try:
            data = _read_volume_bytes(vol, rel_from_vol)
        except Exception as exc:
            download_blocked_err = str(exc)
            break

        local_target.parent.mkdir(parents=True, exist_ok=True)
        local_target.write_bytes(data)
        files_synced += 1
        bytes_synced += len(data)

    if download_blocked_err is not None:
        print(
            f"\n[Note] Direct object-storage download (`clobber.modal-storage.com:443`) was blocked or "
            f"unreachable on the current network ({download_blocked_err}).\n"
            f"All remote files remain safely persisted on Modal Volume '{VOLUME_NAME}'. "
            f"Re-run `python3 training/qwen35/sync_modal_results.py` on an unrestricted network (e.g. home WiFi) "
            f"to pull all artifacts locally."
        )
        return 0

    print(
        f"\nDownloaded {files_synced} file(s) ({bytes_synced / (1024 * 1024):.2f} MiB) "
        f"into {LOCAL_OUT_DIR.relative_to(REPO_ROOT)}/"
    )

    model_card_src = LOCAL_OUT_DIR / "MODEL_CARD.md"
    if model_card_src.exists():
        DOCS_DIR.mkdir(parents=True, exist_ok=True)
        dst = DOCS_DIR / "QWEN35_MODEL_CARD.md"
        dst.write_bytes(model_card_src.read_bytes())
        print(f"Published model card -> {dst.relative_to(REPO_ROOT)}")

    ucas_report_src = LOCAL_OUT_DIR / "UCAS_AND_BENCHMARK_REPORT.md"
    if ucas_report_src.exists():
        DOCS_DIR.mkdir(parents=True, exist_ok=True)
        dst = DOCS_DIR / "UCAS_AND_BENCHMARK_REPORT.md"
        dst.write_bytes(ucas_report_src.read_bytes())
        print(f"Published benchmark report -> {dst.relative_to(REPO_ROOT)}")

    status_path = LOCAL_OUT_DIR / "LIVE_STATUS.json"
    if status_path.exists():
        status = json.loads(status_path.read_text(encoding="utf-8"))
        print("\n--- Live Pipeline Status ---")
        print(f"  Run ID          : {status.get('run_id', 'unknown')}")
        print(f"  Current Stage   : {status.get('current_stage', 'unknown')}")
        print(f"  Elapsed         : {status.get('elapsed_sec', 0):.1f}s")
        print(f"  Updated At (UTC): {status.get('updated_at', 'unknown')}")
        completed = status.get("completed_stages", [])
        if completed:
            print(f"  Completed Stages: {', '.join(completed)}")
        headlines = status.get("round_headlines", {})
        if isinstance(headlines, dict) and headlines:
            print("\n  Completed Evaluation Headlines:")
            for label, metrics in headlines.items():
                if not isinstance(metrics, dict):
                    continue
                print(
                    f"    * {label:34s} | "
                    f"Step1={_format_pct(metrics.get('step1SolverPassRate'))} | "
                    f"Gate={_format_pct(metrics.get('step2AuthorGatePassRate'))} | "
                    f"Syllabus={_format_pct(metrics.get('syllabusAlignmentRate'))} | "
                    f"E2E={_format_pct(metrics.get('endToEndVerifiedRate'))}"
                )
        if status.get("champion_round"):
            print(f"\n  Champion Selected: {status['champion_round']}")
        if status.get("errors"):
            print(f"\n  Errors recorded  : {status['errors']}")

    final_summary = LOCAL_OUT_DIR / "FINAL_SUMMARY.json"
    if final_summary.exists():
        print(f"\nPipeline COMPLETE! Full summary at {final_summary.relative_to(REPO_ROOT)}")

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check live Modal H100 Qwen3.5-9B status and sync results to local repo."
    )
    parser.add_argument(
        "--skip-rollouts",
        action="store_true",
        help="Skip downloading raw per-item rollout JSONL files.",
    )
    parser.add_argument(
        "--include-rollouts",
        action="store_true",
        help="Include raw per-item rollout JSONL files (enabled by default).",
    )
    args = parser.parse_args()
    raise SystemExit(sync_results(include_rollouts=not args.skip_rollouts))


if __name__ == "__main__":
    main()
