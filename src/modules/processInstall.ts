import pino from "pino";

import {
  APM_STORE_STATS_BASE_URL,
  currentApp,
  currentAppSparkInstalled,
  currentAppApmInstalled,
} from "../global/storeConfig";
import { APM_STORE_BASE_URL } from "../global/storeConfig";
import { downloads } from "../global/downloadStatus";

import {
  InstallLog,
  DownloadItem,
  DownloadResult,
  App,
  DownloadItemStatus,
} from "../global/typedefinition";
import axios from "axios";

let downloadIdCounter = 0;
const logger = pino({ name: "processInstall.ts" });

export const handleInstall = async (appObj?: App) => {
  const targetApp = appObj || currentApp.value;
  if (!targetApp?.pkgname) return;

  // APM 应用：在创建下载任务前检查 APM 是否可用
  if (targetApp.origin === "apm") {
    const hasApm = await window.ipcRenderer.invoke("check-apm-available");
    if (!hasApm) {
      // 发送事件到主进程显示 APM 安装对话框
      const { success, cancelled } = await window.ipcRenderer.invoke(
        "show-apm-install-dialog",
      );
      if (!success || cancelled) {
        // 用户取消或未安装成功，不继续安装应用
        return;
      }
    }
  }

  if (
    downloads.value.find(
      (d) => d.pkgname === targetApp.pkgname && d.origin === targetApp.origin,
    )
  ) {
    logger.info(
      `任务已存在，忽略重复添加: ${targetApp.pkgname} (${targetApp.origin})`,
    );
    return;
  }

  downloadIdCounter += 1;
  // 创建下载任务
  const arch = window.apm_store.arch || "amd64";
  const finalArch =
    targetApp.origin === "spark" ? `${arch}-store` : `${arch}-apm`;

  const download: DownloadItem = {
    id: downloadIdCounter,
    name: targetApp.name,
    pkgname: targetApp.pkgname,
    version: targetApp.version,
    icon: `${APM_STORE_BASE_URL}/${finalArch}/${targetApp.category}/${targetApp.pkgname}/icon.png`,
    origin: targetApp.origin,
    status: "queued",
    progress: 0,
    downloadedSize: 0,
    totalSize: 0,
    speed: 0,
    timeRemaining: 0,
    startTime: Date.now(),
    logs: [{ time: Date.now(), message: "开始下载..." }],
    source: "APM Store",
    retry: false,
    filename: targetApp.filename,
    metalinkUrl: `${finalArch}/${targetApp.category}/${targetApp.pkgname}/${targetApp.filename}.metalink`,
  };

  downloads.value.push(download);

  // Send to main process to start download
  window.ipcRenderer.send("queue-install", JSON.stringify(download));

  // Send download statistics to server
  logger.info("发送下载次数统计...");
  const axiosInstance = axios.create({
    baseURL: APM_STORE_STATS_BASE_URL,
    timeout: 5000, // 增加到 5 秒，避免网络波动导致的超时
  });
  axiosInstance
    .post(
      "/handle_post",
      {
        path: `${finalArch}/${targetApp.category}/${targetApp.pkgname}`,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
    .then((response) => {
      logger.info("下载次数统计已发送，状态:", response.data);
    });
};

export const handleRetry = (download_: DownloadItem) => {
  if (!download_?.pkgname) return;
  download_.retry = true;
  // Send to main process to start download
  window.ipcRenderer.send("queue-install", JSON.stringify(download_));
};

export const handleUpgrade = async (app: App) => {
  if (!app.pkgname) return;

  // APM 应用：在创建下载任务前检查 APM 是否可用
  if (app.origin === "apm") {
    const hasApm = await window.ipcRenderer.invoke("check-apm-available");
    if (!hasApm) {
      // 发送事件到主进程显示 APM 安装对话框
      const { success, cancelled } = await window.ipcRenderer.invoke(
        "show-apm-install-dialog",
      );
      if (!success || cancelled) {
        // 用户取消或未安装成功，不继续更新应用
        return;
      }
    }
  }

  if (
    downloads.value.find(
      (d) => d.pkgname === app.pkgname && d.origin === app.origin,
    )
  ) {
    logger.info(`任务已存在，忽略重复添加: ${app.pkgname} (${app.origin})`);
    return;
  }

  downloadIdCounter += 1;
  const arch = window.apm_store.arch || "amd64";
  const finalArch = app.origin === "spark" ? `${arch}-store` : `${arch}-apm`;

  const download: DownloadItem = {
    id: downloadIdCounter,
    name: app.name,
    pkgname: app.pkgname,
    version: app.version,
    icon: `${APM_STORE_BASE_URL}/${finalArch}/${app.category}/${app.pkgname}/icon.png`,
    status: "queued",
    progress: 0,
    downloadedSize: 0,
    totalSize: 0,
    speed: 0,
    timeRemaining: 0,
    startTime: Date.now(),
    logs: [{ time: Date.now(), message: "开始更新..." }],
    source: "APM Update",
    retry: false,
    upgradeOnly: true,
    origin: app.origin,
  };

  downloads.value.push(download);
  window.ipcRenderer.send("queue-install", JSON.stringify(download));
};

export const handleRemove = (appObj?: App) => {
  const targetApp = appObj || currentApp.value;
  if (!targetApp?.pkgname) return;
  window.ipcRenderer.send("remove-installed", {
    pkgname: targetApp.pkgname,
    origin: targetApp.origin,
  });
};

window.ipcRenderer.on("remove-complete", (_event, log: DownloadResult) => {
  if (log.success) {
    if (log.origin === "spark") {
      currentAppSparkInstalled.value = false;
    } else {
      currentAppApmInstalled.value = false;
    }
  } else {
    // We could potentially restore the value, but if remove failed, it should still be installed.
    if (log.origin === "spark") {
      currentAppSparkInstalled.value = true;
    } else {
      currentAppApmInstalled.value = true;
    }
    console.error("卸载失败:", log.message);
  }
});

window.ipcRenderer.on("install-status", (_event, log: InstallLog) => {
  const downloadObj = downloads.value.find((d) => d.id === log.id);
  if (downloadObj) downloadObj.status = log.message as DownloadItemStatus;
});

window.ipcRenderer.on(
  "install-progress",
  (_event, payload: { id: number; progress: number }) => {
    const downloadObj = downloads.value.find((d) => d.id === payload.id);
    if (downloadObj) {
      downloadObj.progress = payload.progress;
    }
  },
);

const MAX_LOG_ENTRIES = 500;

window.ipcRenderer.on("install-log", (_event, log: InstallLog) => {
  const downloadObj = downloads.value.find((d) => d.id === log.id);
  if (downloadObj) {
    downloadObj.logs.push({
      time: log.time,
      message: log.message,
    });
    if (downloadObj.logs.length > MAX_LOG_ENTRIES) {
      downloadObj.logs.splice(0, downloadObj.logs.length - MAX_LOG_ENTRIES);
    }
  }
});

window.ipcRenderer.on("install-complete", (_event, log: DownloadResult) => {
  const downloadObj = downloads.value.find((d) => d.id === log.id);
  if (downloadObj) {
    if (log.success) {
      downloadObj.status = "completed";
    } else {
      downloadObj.status = "failed";
    }
  }
});
