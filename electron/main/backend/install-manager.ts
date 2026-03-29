import { BrowserWindow, dialog, ipcMain, WebContents } from "electron";
import { spawn, ChildProcess, exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import pino from "pino";

import { ChannelPayload } from "../../typedefinition";
import axios from "axios";

const logger = pino({ name: "install-manager" });

type InstallTask = {
  id: number;
  pkgname: string;
  execCommand: string;
  execParams: string[];
  download_process: ChildProcess | null;
  install_process: ChildProcess | null;
  webContents: WebContents | null;
  downloadDir?: string;
  metalinkUrl?: string;
  filename?: string;
  origin: "spark" | "apm";
  cancelled?: boolean;
};

const SHELL_CALLER_PATH = "/opt/spark-store/extras/shell-caller.sh";

export const tasks = new Map<number, InstallTask>();

let idle = true; // Indicates if the installation manager is idle

const checkSuperUserCommand = async (): Promise<string> => {
  let superUserCmd = "";
  const execAsync = promisify(exec);
  if (process.getuid && process.getuid() !== 0) {
    const { stdout, stderr } = await execAsync("which /usr/bin/pkexec");
    if (stderr) {
      logger.error("没有找到 pkexec 命令");
      return;
    }
    logger.info(`找到提升权限命令: ${stdout.trim()}`);
    superUserCmd = stdout.trim();

    if (superUserCmd.length === 0) {
      logger.error("没有找到提升权限的命令 pkexec!");
    }
  }
  return superUserCmd;
};

const runCommandCapture = async (execCommand: string, execParams: string[]) => {
  return await new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(execCommand, execParams, {
        shell: false,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (err) => {
        resolve({ code: -1, stdout, stderr: err.message });
      });

      child.on("close", (code) => {
        resolve({ code: typeof code === "number" ? code : -1, stdout, stderr });
      });
    },
  );
};

/** 检测本机是否已安装 apm 命令 */
const checkApmAvailable = async (): Promise<boolean> => {
  const { code, stdout } = await runCommandCapture("which", ["apm"]);
  const found = code === 0 && stdout.trim().length > 0;
  if (!found) logger.info("未检测到 apm 命令");
  return found;
};

/** 提权执行 shell-caller aptss install apm 安装 APM，安装后需用户重启电脑 */
const runInstallApm = async (superUserCmd: string): Promise<boolean> => {
  const execCommand = superUserCmd || SHELL_CALLER_PATH;
  const execParams = superUserCmd
    ? [SHELL_CALLER_PATH, "aptss", "install", "apm"]
    : [SHELL_CALLER_PATH, "aptss", "install", "apm"];
  logger.info(`执行安装 APM: ${execCommand} ${execParams.join(" ")}`);
  const { code, stdout, stderr } = await runCommandCapture(
    execCommand,
    execParams,
  );
  if (code !== 0) {
    logger.error({ code, stdout, stderr }, "安装 APM 失败");
    return false;
  }
  logger.info("安装 APM 完成");
  return true;
};

const parseUpgradableList = (output: string) => {
  const apps: Array<{
    pkgname: string;
    newVersion: string;
    currentVersion: string;
    raw: string;
  }> = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("Listing")) continue;
    if (trimmed.startsWith("[INFO]")) continue;
    if (trimmed.includes("=") && !trimmed.includes("/")) continue;

    if (!trimmed.includes("/")) continue;

    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 2) continue;
    const pkgToken = tokens[0];
    const pkgname = pkgToken.split("/")[0];
    const newVersion = tokens[1] || "";
    const currentMatch = trimmed.match(
      /\[(?:upgradable from|from):\s*([^\]\s]+)\]/i,
    );
    const currentToken = tokens[5] || "";
    const currentVersion =
      currentMatch?.[1] || currentToken.replace("[", "").replace("]", "");

    if (!pkgname) continue;
    apps.push({ pkgname, newVersion, currentVersion, raw: trimmed });
  }
  return apps;
};

// Listen for download requests from renderer process
ipcMain.on("queue-install", async (event, download_json) => {
  const download =
    typeof download_json === "string"
      ? JSON.parse(download_json)
      : download_json;
  const { id, pkgname, metalinkUrl, filename, upgradeOnly, origin } =
    download || {};

  if (!id || !pkgname) {
    logger.warn("passed arguments missing id or pkgname");
    return;
  }

  logger.info(`收到下载任务: ${id}, 软件包名称: ${pkgname}, 来源: ${origin}`);

  const webContents = event.sender;

  // 避免重复添加同一任务（检查 pkgname + origin），但允许重试下载
  if (!download.retry) {
    const existingTask = Array.from(tasks.values()).find(
      (t) => t.pkgname === pkgname && t.origin === origin,
    );
    if (existingTask) {
      webContents.send("install-log", {
        id,
        time: Date.now(),
        message: `任务 ${pkgname} (${origin}) 已在列表中，忽略重复添加`,
      });
      webContents.send("install-complete", {
        id,
        success: false,
        time: Date.now(),
        exitCode: -1,
        message: JSON.stringify({
          message: `任务 ${pkgname} (${origin}) 已在列表中，忽略重复添加`,
          stdout: "",
          stderr: "",
        }),
      });
      return;
    }
  }
  const superUserCmd = await checkSuperUserCommand();
  let execCommand = "";
  const execParams = [];
  const downloadDir = `/tmp/spark-store/download/${pkgname}`;

  // APM 应用：若本机没有 apm 命令，弹窗提示并可选提权安装 APM（安装后需重启电脑）
  if (origin === "apm") {
    const hasApm = await checkApmAvailable();
    if (!hasApm) {
      const win = BrowserWindow.fromWebContents(webContents);
      const { response } = await dialog.showMessageBox(win ?? undefined, {
        type: "question",
        title: "需要安装 APM",
        message: "此应用需要使用 APM 安装。",
        detail:
          "APM是星火应用商店的容器包管理器，安装APM后方可安装此应用，是否确认安装？",
        buttons: ["确认", "取消"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response !== 0) {
        webContents.send("install-complete", {
          id,
          success: false,
          time: Date.now(),
          exitCode: -1,
          message: JSON.stringify({
            message: "用户取消安装 APM，无法继续安装此应用",
            stdout: "",
            stderr: "",
          }),
        });
        return;
      }
      const installApmOk = await runInstallApm(superUserCmd);
      if (!installApmOk) {
        webContents.send("install-complete", {
          id,
          success: false,
          time: Date.now(),
          exitCode: -1,
          message: JSON.stringify({
            message: "安装 APM 失败，请检查网络或权限后重试",
            stdout: "",
            stderr: "",
          }),
        });
        return;
      } else {
        // 安装APM成功，提示用户已安装成功，需要重启后方可展示应用
        await dialog.showMessageBox(win ?? undefined, {
          type: "info",
          title: "APM 安装成功",
          message: "恭喜您，APM 已成功安装",
          detail:
            "恭喜您，APM 已成功安装！您的应用已在安装中～\n首次安装APM后，需要重启电脑后方可在启动器展示应用。您可在应用安装完毕后择机重启电脑\n若您需要立即使用应用，可在应用安装后先在应用商店中打开您的应用。",
          buttons: ["确定"],
          defaultId: 0,
        });
      }
    }
  }

  if (origin === "spark") {
    // Spark Store logic
    if (upgradeOnly) {
      execCommand = "pkexec";
      execParams.push("spark-update-tool", pkgname);
    } else {
      execCommand = superUserCmd || SHELL_CALLER_PATH;
      if (superUserCmd) execParams.push(SHELL_CALLER_PATH);

      if (metalinkUrl && filename) {
        execParams.push(
          "ssinstall",
          `${downloadDir}/${filename}`,
          "--delete-after-install",
        );
      } else {
        execParams.push("aptss", "install", "-y", pkgname);
      }
    }
  } else {
    // APM Store logic
    execCommand = superUserCmd || SHELL_CALLER_PATH;
    if (superUserCmd) {
      execParams.push(SHELL_CALLER_PATH);
    }
    execParams.push("apm");

    if (metalinkUrl && filename) {
      execParams.push("ssinstall", `${downloadDir}/${filename}`);
    } else {
      execParams.push("install", "-y", pkgname);
    }
  }

  const task: InstallTask = {
    id,
    pkgname,
    execCommand,
    execParams,
    download_process: null,
    install_process: null,
    webContents,
    downloadDir,
    metalinkUrl,
    filename,
    origin: origin || "apm",
  };
  tasks.set(id, task);
  if (idle) processNextInQueue();
});

// Cancel Handler
ipcMain.on("cancel-install", (event, id) => {
  if (tasks.has(id)) {
    const task = tasks.get(id);
    if (task) {
      task.cancelled = true;
      task.download_process?.kill();
      task.install_process?.kill();
      logger.info(`已取消任务: ${id}`);

      // 删除下载目录
      if (task.downloadDir && fs.existsSync(task.downloadDir)) {
        try {
          fs.rmSync(task.downloadDir, { recursive: true, force: true });
          logger.info(`已删除下载目录: ${task.downloadDir}`);
        } catch (err) {
          logger.error(`删除下载目录失败 ${task.downloadDir}: ${err}`);
        }
      }

      // 主动发送完成（失败）事件，close 回调会因 cancelled 标志跳过
      task.webContents?.send("install-complete", {
        id,
        success: false,
        time: Date.now(),
        exitCode: -1,
        message: JSON.stringify({
          message: "用户取消",
          stdout: "",
          stderr: "",
        }),
      });

      tasks.delete(id);
      idle = true;
      if (tasks.size > 0) processNextInQueue();
    }
  }
});

async function processNextInQueue() {
  if (!idle) return;

  // Always take the first task to ensure sequence
  const task = Array.from(tasks.values())[0];
  if (!task) {
    idle = true;
    return;
  }

  // 如果任务已被取消，跳过并处理下一个
  if (task.cancelled) {
    tasks.delete(task.id);
    idle = true;
    if (tasks.size > 0) {
      processNextInQueue();
    }
    return;
  }

  idle = false;
  const { webContents, id, downloadDir } = task;

  const sendLog = (msg: string) => {
    webContents?.send("install-log", { id, time: Date.now(), message: msg });
  };
  const sendStatus = (status: string) => {
    webContents?.send("install-status", {
      id,
      time: Date.now(),
      message: status,
    });
  };

  try {
    // 1. Metalink & Aria2c Phase
    if (task.metalinkUrl) {
      try {
        if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true });
        }
      } catch (err) {
        logger.error(`无法创建目录 ${downloadDir}: ${err}`);
        throw err;
      }

      const metalinkPath = path.join(downloadDir, `${task.filename}.metalink`);

      sendLog(`正在获取 Metalink 文件: ${task.metalinkUrl}`);

      const response = await axios.get(task.metalinkUrl, {
        baseURL: "https://erotica.spark-app.store",
        responseType: "stream",
      });

      const writer = fs.createWriteStream(metalinkPath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      sendLog("Metalink 文件下载完成");

      // 清理下载目录中的旧文件（保留 .metalink 文件），防止 aria2c 因同名文件卡住
      const existingFiles = fs.readdirSync(downloadDir);
      for (const file of existingFiles) {
        if (file.endsWith(".metalink")) continue;
        const filePath = path.join(downloadDir, file);
        try {
          fs.unlinkSync(filePath);
          sendLog(`已清理旧文件: ${file}`);
        } catch (err) {
          logger.warn(`清理文件失败 ${filePath}: ${err}`);
        }
      }

      // Aria2c
      const aria2Args = [
        `--dir=${downloadDir}`,
        "--allow-overwrite=true",
        "--summary-interval=1",
        "--connect-timeout=10",
        "--timeout=15",
        "--max-tries=3",
        "--retry-wait=5",
        "--max-concurrent-downloads=4",
        "--min-split-size=1M",
        "--lowest-speed-limit=1K",
        "--auto-file-renaming=false",
        "-M",
        metalinkPath,
      ];

      sendStatus("downloading");

      // 下载重试逻辑：每次超时时间递增，最多3次
      const timeoutList = [3000, 5000, 15000]; // 第一次3秒，第二次5秒，第三次15秒
      let retryCount = 0;
      let downloadSuccess = false;

      while (retryCount < timeoutList.length && !downloadSuccess) {
        const currentTimeout = timeoutList[retryCount];

        if (retryCount > 0) {
          sendLog(`第 ${retryCount} 次重试下载...`);
          webContents?.send("install-progress", { id, progress: 0 });
          // 重试前也清理旧文件
          const retryFiles = fs.readdirSync(downloadDir);
          for (const file of retryFiles) {
            if (file.endsWith(".metalink")) continue;
            const filePath = path.join(downloadDir, file);
            try {
              fs.unlinkSync(filePath);
            } catch (cleanErr) {
              logger.warn(`重试清理文件失败 ${filePath}: ${cleanErr}`);
            }
          }
        }

        try {
          await new Promise<void>((resolve, reject) => {
            sendLog(`启动下载: aria2c ${aria2Args.join(" ")}`);
            const child = spawn("aria2c", aria2Args);
            task.download_process = child;

            let lastProgressTime = Date.now();
            let lastProgress = 0;
            const progressCheckInterval = 1000; // 每1秒检查一次

            // 设置超时检测定时器
            const timeoutChecker = setInterval(() => {
              const now = Date.now();
              // 只在进度为0时检查超时
              if (
                lastProgress === 0 &&
                now - lastProgressTime > currentTimeout
              ) {
                clearInterval(timeoutChecker);
                child.kill();
                reject(new Error(`下载卡在0%超过 ${currentTimeout / 1000} 秒`));
              }
            }, progressCheckInterval);

            child.stdout.on("data", (data) => {
              const str = data.toString();
              // Match ( 12%) or (12%)
              const match = str.match(/[0-9]+(\.[0-9]+)?%/g);
              if (match) {
                const p = parseFloat(match.at(-1)) / 100;
                if (p > lastProgress) {
                  lastProgress = p;
                  lastProgressTime = Date.now();
                }
                webContents?.send("install-progress", { id, progress: p });
              }
            });
            child.stderr.on("data", (d) => sendLog(`aria2c: ${d}`));

            child.on("close", (code) => {
              clearInterval(timeoutChecker);
              if (task.cancelled) {
                reject(new Error("下载已取消"));
                return;
              }
              if (code === 0) {
                webContents?.send("install-progress", { id, progress: 1 });
                resolve();
              } else {
                reject(new Error(`Aria2c exited with code ${code}`));
              }
            });
            child.on("error", (err) => {
              clearInterval(timeoutChecker);
              reject(err);
            });
          });
          // 下载成功后检查是否已取消
          if (task.cancelled) {
            throw new Error("下载已取消");
          }
          downloadSuccess = true;
        } catch (err) {
          retryCount++;
          if (retryCount >= timeoutList.length) {
            throw new Error(
              `下载失败，已重试 ${timeoutList.length} 次: ${err}`,
            );
          }
          sendLog(`下载失败，准备重试 (${retryCount}/${timeoutList.length})`);
          // 等待2秒后重试
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    // 进入安装阶段前检查是否已取消
    if (task.cancelled) {
      throw new Error("安装已取消");
    }

    // 2. Install Phase
    sendStatus("installing");

    const cmdString = `${task.execCommand} ${task.execParams.join(" ")}`;
    sendLog(`执行安装: ${cmdString}`);
    logger.info(`启动安装: ${cmdString}`);

    const result = await new Promise<{
      code: number;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(task.execCommand, task.execParams, {
        shell: false,
        env: process.env,
      });
      task.install_process = child;

      let stdout = "";
      let stderr = "";
      let logBuffer = "";
      let logBufferTimer: NodeJS.Timeout | null = null;
      const LOG_FLUSH_MS = 100;

      const flushLogBuffer = () => {
        if (logBuffer.length > 0) {
          sendLog(logBuffer);
          logBuffer = "";
        }
        logBufferTimer = null;
      };

      const bufferedSendLog = (message: string) => {
        logBuffer += message;
        if (!logBufferTimer) {
          logBufferTimer = setTimeout(flushLogBuffer, LOG_FLUSH_MS);
        }
      };

      child.stdout.on("data", (d) => {
        const s = d.toString();
        stdout += s;
        bufferedSendLog(s);
      });

      child.stderr.on("data", (d) => {
        const s = d.toString();
        stderr += s;
        bufferedSendLog(s);
      });

      child.on("close", (code) => {
        if (logBufferTimer) {
          clearTimeout(logBufferTimer);
          flushLogBuffer();
        }
        if (task.cancelled) {
          reject(new Error("安装已取消"));
          return;
        }
        resolve({ code: code ?? -1, stdout, stderr });
      });
      child.on("error", (err) => {
        reject(err);
      });
    });

    // Completion
    const success = result.code === 0;
    const msgObj = {
      message: success ? "安装完成" : `安装失败，退出码 ${result.code}`,
      stdout: result.stdout,
      stderr: result.stderr,
    };

    if (success) logger.info(msgObj);
    else logger.error(msgObj);

    webContents?.send("install-complete", {
      id,
      success,
      time: Date.now(),
      exitCode: result.code,
      message: JSON.stringify(msgObj),
    });
  } catch (error) {
    logger.error(`Task ${id} failed: ${error}`);
    webContents?.send("install-complete", {
      id,
      success: false,
      time: Date.now(),
      exitCode: -1,
      message: JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        stdout: "",
        stderr: "",
      }),
    });
  } finally {
    // 如果已被 cancel handler 清理，跳过重复清理
    if (!task.cancelled) {
      tasks.delete(id);
      idle = true;
      if (tasks.size > 0) {
        processNextInQueue();
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
ipcMain.handle("check-installed", async (_event, payload: any) => {
  const pkgname = typeof payload === "string" ? payload : payload.pkgname;
  const origin = typeof payload === "string" ? "spark" : payload.origin;

  if (!pkgname) {
    logger.warn("check-installed missing pkgname");
    return false;
  }

  logger.info(`检查应用是否已安装: ${pkgname} (来源: ${origin})`);

  let isInstalled = false;

  if (origin === "apm") {
    const { code, stdout } = await runCommandCapture("apm", [
      "list",
      "--installed",
    ]);
    if (code === 0) {
      const cleanStdout = stdout.replace(
        // eslint-disable-next-line no-control-regex
        /\x1b\[[0-9;]*m/g,
        "",
      );
      const lines = cleanStdout.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          !trimmed ||
          trimmed.startsWith("Listing") ||
          trimmed.startsWith("[INFO]") ||
          trimmed.startsWith("警告")
        )
          continue;
        if (trimmed.includes("/")) {
          const installedPkg = trimmed.split("/")[0].trim();
          if (installedPkg === pkgname) {
            isInstalled = true;
            logger.info(`应用已安装 (APM检测): ${pkgname}`);
            break;
          }
        }
      }
    }
    return isInstalled;
  }

  const checkScript = "/opt/spark-store/extras/check-is-installed";

  // 首先尝试使用内置脚本
  if (fs.existsSync(checkScript)) {
    const child = spawn(checkScript, [pkgname], {
      shell: false,
      env: process.env,
    });

    await new Promise<void>((resolve) => {
      child.on("error", (err) => {
        logger.error(`check-installed 脚本执行失败: ${err?.message || err}`);
        resolve();
      });

      child.on("close", (code) => {
        if (code === 0) {
          isInstalled = true;
          logger.info(`应用已安装 (脚本检测): ${pkgname}`);
        }
        resolve();
      });
    });

    if (isInstalled) return true;
  }

  return isInstalled;
});

ipcMain.on("remove-installed", async (_event, payload) => {
  const webContents = _event.sender;
  const pkgname = typeof payload === "string" ? payload : payload.pkgname;
  const origin = typeof payload === "string" ? "spark" : payload.origin;

  if (!pkgname) {
    logger.warn("remove-installed missing pkgname");
    return;
  }
  logger.info(`卸载已安装应用: ${pkgname} (来源: ${origin})`);

  let execCommand = "";
  const execParams = [];

  const superUserCmd = await checkSuperUserCommand();
  execCommand = superUserCmd || SHELL_CALLER_PATH;
  if (superUserCmd) execParams.push(SHELL_CALLER_PATH);

  if (origin === "spark") {
    execParams.push("aptss", "remove", pkgname);
  } else {
    execParams.push("apm", "autoremove", "-y", pkgname);
  }

  const child = spawn(execCommand, execParams, {
    shell: false,
    env: process.env,
  });
  let output = "";

  child.stdout.on("data", (data) => {
    const chunk = data.toString();
    output += chunk;
    webContents.send("remove-progress", chunk);
  });

  child.on("close", (code) => {
    const success = code === 0;
    // 拼接json消息
    const messageJSONObj = {
      message: success ? "卸载完成" : `卸载失败，退出码 ${code}`,
      stdout: output,
      stderr: "",
    };

    if (success) {
      logger.info(messageJSONObj);
    } else {
      logger.error(messageJSONObj);
    }

    webContents.send("remove-complete", {
      id: 0,
      success: success,
      time: Date.now(),
      exitCode: code,
      message: JSON.stringify(messageJSONObj),
      origin: origin,
    } satisfies ChannelPayload);
  });
});

ipcMain.handle("list-installed", async () => {
  const apmBasePath = "/var/lib/apm/apm/files/ace-env/var/lib/apm";

  try {
    // 使用 apm list --installed 获取所有已安装应用
    const { code, stdout } = await runCommandCapture("apm", [
      "list",
      "--installed",
    ]);

    if (code !== 0) {
      logger.warn(`Failed to list installed packages: ${stdout}`);
      return {
        success: false,
        message: "Failed to list installed packages",
        apps: [],
      };
    }

    const installedApps: Array<{
      pkgname: string;
      name: string;
      version: string;
      arch: string;
      flags: string;
      origin: "spark" | "apm";
      icon?: string;
      isDependency: boolean;
    }> = [];

    const cleanStdout = stdout.replace(
      // eslint-disable-next-line no-control-regex
      /\x1b\[[0-9;]*m/g,
      "",
    );
    const lines = cleanStdout.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith("Listing") ||
        trimmed.startsWith("[INFO]") ||
        trimmed.startsWith("警告")
      )
        continue;

      // 解析格式: pkgname/repo,section version arch [flags] 或 pkgname/repo version arch [flags]
      // 注意: repo后面可能有逗号和section，也可能没有
      const match = trimmed.match(
        /^(\S+)\/\S+(?:,\S+)?\s+(\S+)\s+(\S+)\s+\[(.+)\]$/,
      );
      if (!match) {
        logger.debug(`Failed to parse line: ${trimmed}`);
        continue;
      }

      const [, pkgname, version, arch, flags] = match;

      // 从桌面文件获取应用名称和图标
      let appName = pkgname;
      let icon = "";
      const pkgPath = path.join(apmBasePath, pkgname);
      const entriesPath = path.join(pkgPath, "entries", "applications");
      const hasEntries = fs.existsSync(entriesPath);

      if (hasEntries) {
        try {
          const desktopFiles = fs.readdirSync(entriesPath);
          logger.debug(
            `Found desktop files for ${pkgname}: ${desktopFiles.join(", ")}`,
          );
          for (const file of desktopFiles) {
            if (file.endsWith(".desktop")) {
              const desktopPath = path.join(entriesPath, file);
              logger.debug(`Reading desktop file: ${desktopPath}`);
              const content = fs.readFileSync(desktopPath, "utf-8");
              const nameMatch = content.match(/^Name=(.+)$/m);
              const iconMatch = content.match(/^Icon=(.+)$/m);
              if (nameMatch) appName = nameMatch[1].trim();
              if (iconMatch) icon = iconMatch[1].trim();
              logger.debug(
                `Parsed desktop file for ${pkgname}: name=${appName}, icon=${icon}`,
              );
              break;
            }
          }
        } catch (e) {
          logger.warn(`Failed to read desktop file for ${pkgname}: ${e}`);
        }
      } else {
        logger.debug(`No entries path for ${pkgname}: ${entriesPath}`);
      }

      installedApps.push({
        pkgname,
        name: appName,
        version,
        arch,
        flags,
        origin: "apm",
        icon: icon || undefined,
        isDependency: !hasEntries,
      });
    }

    installedApps.sort((a, b) => {
      const getOrder = (app: { pkgname: string; isDependency: boolean }) => {
        if (app.isDependency) return 2;
        if (app.pkgname.startsWith("amber-pm")) return 1;
        return 0;
      };

      const aOrder = getOrder(a);
      const bOrder = getOrder(b);

      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.pkgname.localeCompare(b.pkgname);
    });

    logger.info(`Found ${installedApps.length} installed APM apps`);
    return { success: true, apps: installedApps };
  } catch (error) {
    logger.error(
      `list-installed failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      apps: [],
    };
  }
});

ipcMain.handle("list-upgradable", async () => {
  const { code, stdout, stderr } = await runCommandCapture("apm", [
    "list",
    "--upgradable",
  ]);
  if (code !== 0) {
    logger.error(`list-upgradable failed: ${stderr || stdout}`);
    return {
      success: false,
      message: stderr || stdout || `list-upgradable failed with code ${code}`,
      apps: [],
    };
  }

  const apps = parseUpgradableList(stdout);
  return { success: true, apps };
});

ipcMain.handle("check-apm-available", async () => {
  return await checkApmAvailable();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
ipcMain.handle("uninstall-installed", async (_event, payload: any) => {
  const pkgname = typeof payload === "string" ? payload : payload.pkgname;
  const origin = typeof payload === "string" ? "spark" : payload.origin;

  if (!pkgname) {
    logger.warn("uninstall-installed missing pkgname");
    return { success: false, message: "missing pkgname" };
  }

  const superUserCmd = await checkSuperUserCommand();
  const execCommand = superUserCmd || SHELL_CALLER_PATH;
  const execParams = superUserCmd ? [SHELL_CALLER_PATH] : [];

  if (origin === "apm") {
    execParams.push("apm", "remove", "-y", pkgname);
  } else {
    execParams.push("aptss", "remove", "-y", pkgname);
  }

  const { code, stdout, stderr } = await runCommandCapture(
    execCommand,
    execParams,
  );
  const success = code === 0;

  if (success) {
    logger.info(`卸载完成: ${pkgname}`);
  } else {
    logger.error(`卸载失败: ${pkgname} ${stderr || stdout}`);
  }

  return {
    success,
    message: success
      ? "卸载完成"
      : stderr || stdout || `卸载失败，退出码 ${code}`,
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
ipcMain.handle("launch-app", async (_event, payload: any) => {
  const pkgname = typeof payload === "string" ? payload : payload.pkgname;
  const origin = typeof payload === "string" ? "spark" : payload.origin;

  if (!pkgname) {
    logger.warn("No pkgname provided for launch-app");
  }

  let execCommand = "/opt/spark-store/extras/app-launcher";
  let execParams = ["start", pkgname];

  if (origin === "apm") {
    execCommand = "apm";
    execParams = ["launch", pkgname];
  }

  logger.info(
    `Launching app: ${pkgname} with command: ${execCommand} ${execParams.join(" ")}`,
  );

  spawn(execCommand, execParams, {
    shell: false,
    env: process.env,
    detached: true,
    stdio: "ignore",
  }).unref();
});
