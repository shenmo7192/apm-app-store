#!/bin/bash

# 检查是否提供了至少一个参数
if [[ $# -eq 0 ]]; then
    echo "错误：未提供命令参数。用法: $0 apm <子命令> [参数...]"
    exit 1
fi

# 严格验证第一个参数必须是 "apm"
if [[ "$1" != "apm" ]]; then
    echo "拒绝执行：仅允许执行 'apm' 命令。收到的第一个参数: '$1'"
    exit 1
fi

# 检查 apm 命令是否存在
if ! command -v apm &>/dev/null; then
    echo "apm 命令未找到，请确保已安装 APM 环境"
    exit 127
fi

# 执行 apm 命令（跳过第一个参数 "apm"）
output=$(/usr/bin/apm "${@:2}" 2>&1)
exit_code=$?

echo "$output"

exit $exit_code