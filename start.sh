#!/bin/bash
SESSION_NAME="dcard_auto"

# 如果 session 已存在，直接 attach
if tmux has-session -t $SESSION_NAME 2>/dev/null; then
    echo "✅ Session '$SESSION_NAME' 已存在，正在連接..."
    tmux attach -t $SESSION_NAME
    exit 0
fi

# 建立新 session，第一個 window 跑後端
tmux new-session -d -s $SESSION_NAME -n backend
tmux send-keys -t $SESSION_NAME:backend "cd ~/Dcard_auto/backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8001" Enter

# 第二個 window 跑前端
tmux new-window -t $SESSION_NAME -n frontend
tmux send-keys -t $SESSION_NAME:frontend "cd ~/Dcard_auto/frontend && npm run dev" Enter

# 切回後端 window
tmux select-window -t $SESSION_NAME:backend

echo "✅ Dcard Auto 已啟動"
echo "   後端: http://localhost:8001/docs"
echo "   前端: http://localhost:3001"
echo "📎 用 'tmux attach -t $SESSION_NAME' 查看"

tmux attach -t $SESSION_NAME
