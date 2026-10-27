#!/usr/bin/env bash
set -euo pipefail
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sdk="${WASI_SDK_PATH:?Set WASI_SDK_PATH to wasi-sdk-25.0-x86_64-linux}"
cd "$task_root/vendor/quux"
"$sdk/bin/clang++" -std=c++14 -O2 -fno-exceptions -fno-rtti -DALLMOVES_USE_EXCEPTIONS=0 -mexec-model=reactor \
  -Wl,--export=choose_move -Wl,--export=choose_move_level -Wl,--export=choose_setup -Wl,--export=coach_position -Wl,--export=guide_position -Wl,--export=malloc -Wl,--export=free \
  -Wl,--initial-memory=16777216 -Wl,--max-memory=536870912 \
  bridge.cc AllMoves.cc AIMove.cc AIStaticEval.cc PlanetNames.cc mprintf.cc \
  PieceCollection.cc StarSystem.cc GameState.cc SingleAction.cc WholeMove.cc ApplyMove.cc \
  -o quux.wasm
