#!/usr/bin/env sh
. "$(dirname -- "$0")/_/hook.sh"

deno check src/
deno run -A npm:lint-staged
deno lint src/
deno fmt --check src/