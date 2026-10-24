@echo off
rem 启动断行 API（不编译 —— 这个仓库没有构建步骤）
cd /d "%~dp0"

if not exist api\node_modules (
  echo [1/2] 安装 API 依赖...
  pushd api
  call npm install
  popd
) else (
  echo [1/2] API 依赖已就绪
)

echo [2/2] 启动 API：http://localhost:3000
node api\server.js
