#!/bin/bash
# 启动断行 API（不编译 —— 这个仓库没有构建步骤）
set -e
cd "$(dirname "$0")"

if [ ! -d "api/node_modules" ]; then
  echo "[1/2] 安装 API 依赖..."
  (cd api && npm install)
else
  echo "[1/2] API 依赖已就绪"
fi

echo "[2/2] 启动 API：http://localhost:${PORT:-3000}"
exec node api/server.js
