#!/bin/bash

# 检查是否提供了至少一个参数
if [[ $# -eq 0 ]]; then
    echo "错误：未提供命令参数。用法: $0 aptss <子命令> [参数...]"
    exit 1
fi

# 严格验证第一个参数必须是 "aptss"
if [[ "$1" != "aptss" ]]; then
    echo "拒绝执行：仅允许执行 'aptss' 命令。收到的第一个参数: '$1'"
    exit 1
fi

# 执行 aptss 命令（跳过第一个参数 "aptss"）
/usr/bin/aptss "${@:2}" 2>&1
exit_code=$?

exit $exit_code