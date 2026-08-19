#!/usr/bin/env bash
# 推送 dist 到 cdn 分支（供 jsDelivr 镜像），避免 peaceiris 在 CI 里丢失 origin
set -euo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"

BRANCH="${CDN_BRANCH:-cdn}"
MSG="${CDN_COMMIT_MSG:-cdn: publish static build}"

if [ ! -d dist ]; then
  echo "dist/ not found"
  exit 1
fi

git config --global user.name "github-actions[bot]"
git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp -a dist/. "$work/"

cd "$work"
git init -b "$BRANCH"
git add -A
git commit -m "$MSG"
git push -f "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "HEAD:${BRANCH}"

echo "published ${BRANCH} branch"
