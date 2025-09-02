#!/usr/bin/env bash
set -euo pipefail

# convert_to_ggml.sh
# Usage: ./scripts/convert_to_ggml.sh /path/to/model.safetensors /path/to/output.bin [--execute]
# Prints recommended conversion commands by default.
# Use --execute to attempt running the converter script found in your text-generation-webui or llama.cpp.
#
# NOTE: This script is a helper. It does not download or embed large files into the repo.
#       Conversion is resource intensive. Run on your local M1 machine (not CI).

SAFETENSORS="${1:-${SAFETENSORS_PATH:-$HOME/models/ib-physics/model.safetensors}}"
OUT_PATH="${2:-${OUT_PATH:-$HOME/models/ib-physics/ggml-model-q4_0.bin}}"
WEBUI_DIR="${WEBUI_DIR:-$HOME/text-generation-webui}"
LLAMA_DIR="${LLAMA_DIR:-$HOME/llama.cpp}"
EXECUTE=false
if [ "${3:-}" = "--execute" ] || [ "${EXECUTE_ENV:-}" = "1" ]; then EXECUTE=true; fi

echo "safetensors: $SAFETENSORS"
echo "out path: $OUT_PATH"
echo "text-generation-webui dir: $WEBUI_DIR"
echo "llama.cpp dir: $LLAMA_DIR"
echo "execute: $EXECUTE"

if [ "$EXECUTE" = "false" ]; then
  cat <<'EOF'
Recommended conversion steps (copy/paste):

1) Clone text-generation-webui (if not already cloned):
   git clone https://github.com/oobabooga/text-generation-webui "$WEBUI_DIR"

2) Install requirements:
   cd "$WEBUI_DIR"
   python3 -m pip install -r requirements.txt

3) Preferred: run the webui converter script.
   Example (adapt the converter script path/name found in the webui repo):
   python3 <converter-script> --safetensors "$SAFETENSORS" --out-ggml "$OUT_PATH" --quantize q4_0

   - Recommended quantization for M1 (8GB): q4_0
   - This is LONG-RUNNING and may take several minutes.

Fallback (llama.cpp tools):
   cd "$LLAMA_DIR"
   python3 tools/convert.py --safetensors "$SAFETENSORS" --out "$OUT_PATH" --quantize q4_0

To run this helper script and execute conversion (if you understand the implications), re-run with --execute:
   ./scripts/convert_to_ggml.sh "$SAFETENSORS" "$OUT_PATH" --execute
EOF
  exit 0
fi

# Execution mode: verify inputs
if [ ! -f "$SAFETENSORS" ]; then
  echo "Error: safetensors file not found at $SAFETENSORS" >&2
  exit 2
fi

# Candidate converter script locations inside text-generation-webui (may vary by version)
CONV1="$WEBUI_DIR/convert.py"
CONV2="$WEBUI_DIR/scripts/convert.py"
CONV3="$WEBUI_DIR/modules/convert.py"
CONV4="$WEBUI_DIR/convert_llama.py"

FOUND_CONV=""
for c in "$CONV1" "$CONV2" "$CONV3" "$CONV4"; do
  if [ -f "$c" ]; then
    FOUND_CONV="$c"
    break
  fi
done

if [ -n "$FOUND_CONV" ]; then
  echo "Found converter script: $FOUND_CONV"
  echo "Running converter (this is long-running and may require significant RAM)..."
  python3 "$FOUND_CONV" --safetensors "$SAFETENSORS" --out-ggml "$OUT_PATH" --quantize q4_0
  RC=$?
  if [ $RC -ne 0 ]; then
    echo "Converter exited with code $RC" >&2
    exit $RC
  fi
  echo "Conversion finished. Output: $OUT_PATH"
  exit 0
fi

# Fallback to llama.cpp converter if available
if [ -d "$LLAMA_DIR" ]; then
  LLAMA_CONV="$LLAMA_DIR/tools/convert.py"
  if [ -f "$LLAMA_CONV" ]; then
    echo "Using llama.cpp converter: $LLAMA_CONV"
    python3 "$LLAMA_CONV" --safetensors "$SAFETENSORS" --out "$OUT_PATH" --quantize q4_0
    RC=$?
    if [ $RC -ne 0 ]; then
      echo "llama.cpp converter failed with exit code $RC" >&2
      exit $RC
    fi
    echo "Conversion finished via llama.cpp. Output: $OUT_PATH"
    exit 0
  fi
fi

echo "No converter found. Inspect $WEBUI_DIR and $LLAMA_DIR and run conversion manually." >&2
exit 3