#!/bin/zsh
set -e
cd "$(dirname "$0")"
python3 scripts/build.py
echo '安装包已更新：dist/ 和外置硬盘 04-发布包/取关狗（如已连接）'
read -r '?按回车关闭窗口……'
