#!/bin/sh

# 获取参数或环境变量
HOST="${1:-${DEPLOY_HOST}}"
APP_NAME="${2:-${NAME}}"
APP_TAG="${3:-${TAG}}"
WXWORK_BOT_KEY="${WXWORK_BOT_KEY}"

# 检查 WXWORK_BOT_KEY
if [ -z "$WXWORK_BOT_KEY" ]; then
  echo "WXWORK_BOT_KEY is empty"
  exit 1
fi

# 构建 JSON 消息（使用反引号兼容 busybox）
DATA="{\"msgtype\": \"markdown\", \"markdown\": {\"content\": \"### Deploy ${APP_NAME} done\\n>**tag:** <font color=\\\"red\\\">${APP_TAG}</font>\\n>**host:** <font color=\\\"red\\\">${HOST}</font>\\n\"}}"

# 发送请求
curl -s -X POST "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${WXWORK_BOT_KEY}" \
  -H "Content-Type: application/json" \
  -d "$DATA"
