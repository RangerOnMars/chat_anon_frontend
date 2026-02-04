#!/usr/bin/env bash
# 设置证书目录后启动 HTTPS 开发服务器。修改 CERT_DIR 可更换证书路径。
CERT_DIR="/etc/letsencrypt/live/anontokyo.ltd"
export SSL_CERT_DIR="${CERT_DIR}"
exec npm run dev
