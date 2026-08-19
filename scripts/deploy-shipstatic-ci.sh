#!/usr/bin/env bash
# GitHub Actions：部署到国内固定域名 susuc-kcb.shipstatic.com
set -euo pipefail

if [ -z "${SHIP_API_KEY:-}" ]; then
  echo "未配置 SHIP_API_KEY，跳过国内固定域名部署。"
  exit 0
fi

DOMAIN="${SHIP_DOMAIN:-susuc-kcb.shipstatic.com}"
SHIP="./node_modules/.bin/ship"

DEPLOY_ID=""
for attempt in 1 2 3 4 5 6; do
  echo "upload attempt $attempt"
  if DEPLOY_ID=$($SHIP ./dist --token "$SHIP_API_KEY" -q); then
    break
  fi
  echo "upload failed (often async delete still running); sleep 8s"
  sleep 8
done

if [ -z "${DEPLOY_ID:-}" ]; then
  echo "ShipStatic 上传失败：请到控制台删掉旧部署，或升级套餐。"
  exit 1
fi

echo "deployment=$DEPLOY_ID"
$SHIP domains set "$DOMAIN" "$DEPLOY_ID" --token "$SHIP_API_KEY" --json
echo "https://${DOMAIN%/}/"
