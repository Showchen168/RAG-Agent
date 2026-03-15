#!/bin/bash
# 雙擊啟動 NexusMind Dev Server + 自動開啟瀏覽器
cd "$(dirname "$0")/.."

# 1. 殺掉舊的 dev server
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

# 2. 啟動 dev server（背景執行）
npm run dev &
DEV_PID=$!

# 3. 等待 server 就緒
echo "⏳ 等待 dev server 啟動..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "" http://localhost:3000 2>/dev/null; then
    echo "✅ Dev server 已啟動 (PID: $DEV_PID)"
    open http://localhost:3000
    break
  fi
  sleep 1
done

# 4. 保持前景運行（按 Ctrl+C 停止）
wait $DEV_PID
