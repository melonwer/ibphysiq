#!/usr/bin/env bash
set -euo pipefail

# start_textgen_webui.sh
# Usage:
#   ./scripts/start_textgen_webui.sh /path/to/ggml-model-q4_0.bin
# or set environment variables:
#   MODEL_PATH=/path/to/ggml-model-q4_0.bin PORT=5000 VENV=~/ib-physics-venv ./scripts/start_textgen_webui.sh

MODEL_PATH="${1:-${MODEL_PATH:-~/models/ib-physics/ggml-model-q4_0.bin}}"
PORT="${PORT:-5000}"
VENV="${VENV:-$HOME/ib-physics-venv}"
LOG_DIR="${LOG_DIR:-logs}"
LOG_FILE="${LOG_DIR}/textgen.log"
WEBUI_DIR="${WEBUI_DIR:-$HOME/text-generation-webui}"

mkdir -p "$LOG_DIR"

echo "Using model: $MODEL_PATH"
echo "Using webui dir: $WEBUI_DIR"
echo "Using venv: $VENV"
echo "Logs: $LOG_FILE"

# Activate venv if present
if [ -f "${VENV}/bin/activate" ]; then
  # shellcheck disable=SC1090
  source "${VENV}/bin/activate"
  echo "Activated venv at $VENV"
else
  echo "Warning: venv not found at $VENV. Proceeding without venv. Activate your venv manually if needed." >&2
fi

# Check model exists
if [ ! -f "$MODEL_PATH" ]; then
  echo "Error: model file not found at $MODEL_PATH" >&2
  exit 2
fi

# Check webui directory
if [ ! -d "$WEBUI_DIR" ]; then
  echo "Error: text-generation-webui not found at $WEBUI_DIR" >&2
  echo "Clone it first: git clone https://github.com/oobabooga/text-generation-webui $WEBUI_DIR" >&2
  exit 3
fi

cd "$WEBUI_DIR"

echo "Starting text-generation-webui with model $MODEL_PATH on port $PORT"
# Start the server in background, appending logs
# Adjust server start command if webui uses different entrypoint (server.py / webui.py / app.py)
nohup python3 server.py --model "$MODEL_PATH" --listen --api --port "$PORT" >> "$LOG_FILE" 2>&1 &
PID=$!
echo "Launched text-generation-webui (PID $PID). Logs are being written to $LOG_FILE"

echo "To stop the server: kill $PID"
echo "Set export LOCAL_TGI_URL=\"http://localhost:$PORT\" in your shell to point this repo at the local server."

exit 0