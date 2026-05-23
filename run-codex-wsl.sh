#!/usr/bin/env bash
set -euo pipefail

pause_on_error() {
  local code=$?
  if [[ "$code" -ne 0 ]]; then
    echo
    echo "Codex launcher failed with exit code $code."
    read -r -p "Press Enter to close this window..."
  fi
  exit "$code"
}
trap pause_on_error EXIT

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
codex_dir="$script_dir/codex-rs"

cd "$codex_dir"

if [[ ! -x ./target/debug/codex ]]; then
  echo "Codex binary was not found. Building it once..."
  cargo build --bin codex
fi

trap - EXIT
exec ./target/debug/codex "$@"
