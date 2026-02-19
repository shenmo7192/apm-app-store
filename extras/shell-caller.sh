#!/bin/bash

# 检查是否提供了至少一个参数
if [[ $# -eq 0 ]]; then
    echo "错误：未提供命令参数。用法: $0 [aptss|ssinstall] <子命令> [参数...]"
    exit 1
fi

# 获取第一个参数
first_arg="$1"

# 根据第一个参数决定执行哪个命令
if [[ "$first_arg" == "ssinstall" ]]; then
    # 执行 ssinstall 命令（跳过第一个参数）
    /usr/bin/ssinstall "${@:2}" 2>&1
    exit_code=$?
elif [[ "$first_arg" == "aptss" ]]; then
    # 检查是否为 remove 子命令（第二个参数）
    if [[ "$2" == "remove" ]]; then
        # 获取要卸载的软件包名称（第三个参数及以后）
        packages="${@:3}"
        

            # 检查可用的对话框程序
            if command -v garma &> /dev/null; then
                # 使用 garma 询问确认
                garma --question \
                    --title="确认卸载" \
                    --text="正在准备卸载: $packages\n若这是您下达的卸载指令，请选择确认继续卸载" \
                    --ok-label="确认卸载" \
                    --cancel-label="取消" \
                    --width=400
                
                if [[ $? -eq 0 ]]; then
                    # 用户确认，执行卸载
                    /usr/bin/aptss "${@:2}" -y 2>&1
                    exit_code=$?
                else
                    # 用户取消
                    echo "操作已取消"
                    exit 0
                fi
            elif command -v zenity &> /dev/null; then
                # 使用 zenity 询问确认
                zenity --question \
                    --title="确认卸载" \
                    --text="正在准备卸载: $packages\n\n若这是您下达的卸载指令，请选择确认继续卸载" \
                    --ok-label="确认卸载" \
                    --cancel-label="取消" \
                    --width=400
                
                if [[ $? -eq 0 ]]; then
                    # 用户确认，执行卸载
                    /usr/bin/aptss "${@:2}" -y 2>&1
                    exit_code=$?
                else
                    # 用户取消
                    echo "操作已取消"
                    exit 0
                fi
            else
                # 既没有 garma 也没有 zenity，拒绝卸载
                echo "错误：未找到 garma 或 zenity，无法显示确认对话框。卸载操作已拒绝。"
                exit 1
            fi
        
    else
        # 非 remove 命令，直接执行
        /usr/bin/aptss "${@:2}" 2>&1
        exit_code=$?
    fi
else
    # 其他情况，拒绝执行
    echo "拒绝执行：仅允许执行 'aptss' 或 'ssinstall' 命令。收到的第一个参数: '$first_arg'"
    exit 1
fi

exit $exit_code