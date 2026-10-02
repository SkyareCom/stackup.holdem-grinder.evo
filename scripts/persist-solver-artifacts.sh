#!/usr/bin/env bash
set -euo pipefail

# Persist generated solver banks without losing work when another bot updates
# main between fetch and push. Call after the workflow has created its local
# commit; pass only the primary generated bank files as arguments.
bank_files=("$@")
commit_message="$(git log -1 --pretty=%B)"
max_attempts="${STACKUP_PUSH_RETRIES:-6}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

for file in "${bank_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing generated bank: $file" >&2
    exit 2
  fi
  mkdir -p "$tmp_dir/$(dirname "$file")"
  cp "$file" "$tmp_dir/$file"
done

for attempt in $(seq 1 "$max_attempts"); do
  echo "Persist attempt $attempt/$max_attempts"
  git fetch origin main
  git reset --hard origin/main

  for file in "${bank_files[@]}"; do
    mkdir -p "$(dirname "$file")"
    cp "$tmp_dir/$file" "$file"
  done

  node scripts/audit-scenario-coverage.mjs
  node scripts/plan-solved-spot-growth.mjs
  node scripts/route-solve-queue.mjs

  git add "${bank_files[@]}" \
    data/solver/coverage.json \
    data/solver/growth-plan.json \
    data/solver/generation-queue.json \
    data/solver/solve-route-plan.json

  if git diff --cached --quiet; then
    echo "Generated bank and derived coverage already persisted."
    exit 0
  fi

  git commit -m "$commit_message"
  if git push origin HEAD:main; then
    echo "Persisted generated bank on attempt $attempt."
    exit 0
  fi

  echo "Concurrent main update detected; retrying on latest main." >&2
done

echo "Unable to persist generated bank after $max_attempts attempts." >&2
exit 1
