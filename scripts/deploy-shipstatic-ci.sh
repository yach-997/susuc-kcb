#!/usr/bin/env bash
# GitHub Actions：部署到国内固定域名 susuc-kcb.shipstatic.com
set -euo pipefail

if [ -z "${SHIP_API_KEY:-}" ]; then
  echo "未配置 SHIP_API_KEY，跳过国内固定域名部署。"
  exit 0
fi

DOMAIN="${SHIP_DOMAIN:-susuc-kcb.shipstatic.com}"
SHIP="./node_modules/.bin/ship"
UPLOAD_TIMEOUT="${SHIP_UPLOAD_TIMEOUT:-90}"

ship_upload_id() {
  local out code id
  set +e
  out=$(timeout "$UPLOAD_TIMEOUT" "$SHIP" deployments upload ./dist --token "$SHIP_API_KEY" -q 2>&1)
  code=$?
  set -e
  if [ -n "$out" ]; then
    echo "$out"
  fi
  if [ "$code" -eq 124 ]; then
    echo "upload timed out after ${UPLOAD_TIMEOUT}s" >&2
    return 1
  fi
  if [ "$code" -ne 0 ]; then
    echo "upload failed (exit $code)" >&2
    return 1
  fi
  id=$(printf '%s' "$out" | tr -d '\r\n[:space:]')
  if [ -z "$id" ]; then
    echo "upload returned empty deployment id" >&2
    return 1
  fi
  printf '%s' "$id"
}

echo "ship ping:"
timeout 15 "$SHIP" ping --token "$SHIP_API_KEY" || true

DEPLOY_ID=""
for attempt in 1 2 3; do
  echo "upload attempt $attempt"
  if DEPLOY_ID=$(ship_upload_id); then
    break
  fi
  DEPLOY_ID=""
  sleep 5
done

if [ -z "${DEPLOY_ID:-}" ]; then
  echo "ShipStatic 上传失败：GitHub 国外节点上传可能超时，可本地 build 后手动 ship 部署。"
  exit 1
fi

echo "deployment=$DEPLOY_ID"
timeout 30 "$SHIP" domains set "$DOMAIN" "$DEPLOY_ID" --token "$SHIP_API_KEY" --json
echo "https://${DOMAIN%/}/"
