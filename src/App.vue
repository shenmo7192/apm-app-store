<template>
  <div
    class="flex min-h-screen flex-col bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100 lg:flex-row"
  >
    <!-- 移动端侧边栏遮罩 -->
    <div
      v-if="isSidebarOpen"
      class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
      @click="isSidebarOpen = false"
    ></div>

    <aside
      class="fixed inset-y-0 left-0 z-50 w-72 transform border-r border-slate-200/70 bg-white/95 px-5 py-6 backdrop-blur transition-transform duration-300 ease-in-out dark:border-slate-800/70 dark:bg-slate-900 lg:sticky lg:top-0 lg:flex lg:h-screen lg:translate-x-0 lg:flex-col lg:border-b-0"
      :class="
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      "
    >
      <AppSidebar
        :categories="categories"
        :active-category="activeCategory"
        :category-counts="categoryCounts"
        :theme-mode="themeMode"
        :apm-available="apmAvailable"
        @toggle-theme="toggleTheme"
        @select-category="selectCategory"
        @close="isSidebarOpen = false"
        @list="handleList"
        @update="handleUpdate"
      />
    </aside>

    <main class="flex-1">
      <div
        class="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/95 px-4 py-4 backdrop-blur lg:px-10 dark:border-slate-800/70 dark:bg-slate-950/95"
      >
        <AppHeader
          :search-query="searchQuery"
          :active-category="activeCategory"
          :apps-count="filteredApps.length"
          @update-search="handleSearchInput"
          @search-focus="handleSearchFocus"
          @open-install-settings="handleOpenInstallSettings"
          @open-about="openAboutModal"
          @toggle-sidebar="isSidebarOpen = !isSidebarOpen"
        />
      </div>
      <div class="px-4 py-6 lg:px-10">
        <template v-if="activeCategory === 'home'">
          <HomeView
            :links="homeLinks"
            :lists="homeLists"
            :loading="homeLoading"
            :error="homeError"
            :store-filter="storeFilter"
            @open-detail="openDetail"
          />
        </template>
        <template v-else>
          <AppGrid
            :apps="filteredApps"
            :loading="loading"
            :store-filter="storeFilter"
            @open-detail="openDetail"
          />
        </template>
      </div>
    </main>

    <AppDetailModal
      data-app-modal="detail"
      :show="showModal"
      :app="currentApp"
      :screenshots="screenshots"
      :spark-installed="currentAppSparkInstalled"
      :apm-installed="currentAppApmInstalled"
      @close="closeDetail"
      @install="onDetailInstall"
      @remove="onDetailRemove"
      @open-preview="openScreenPreview"
      @open-app="openDownloadedApp"
      @check-install="checkAppInstalled"
    />

    <ScreenPreview
      :show="showPreview"
      :screenshots="screenshots"
      :current-screen-index="currentScreenIndex"
      @close="closeScreenPreview"
      @prev="prevScreen"
      @next="nextScreen"
    />

    <DownloadQueue
      :downloads="downloads"
      @pause="pauseDownload"
      @resume="resumeDownload"
      @cancel="cancelDownload"
      @retry="retryDownload"
      @clear-completed="clearCompletedDownloads"
      @show-detail="showDownloadDetailModalFunc"
    />

    <DownloadDetail
      :show="showDownloadDetailModal"
      :download="currentDownload"
      @close="closeDownloadDetail"
      @pause="pauseDownload"
      @resume="resumeDownload"
      @cancel="cancelDownload"
      @retry="retryDownload"
      @open-app="openDownloadedApp"
    />

    <InstalledAppsModal
      :show="showInstalledModal"
      :apps="installedApps"
      :loading="installedLoading"
      :error="installedError"
      @close="closeInstalledModal"
      @refresh="refreshInstalledApps"
      @uninstall="uninstallInstalledApp"
    />

    <UpdateAppsModal
      :show="showUpdateModal"
      :apps="upgradableApps"
      :loading="updateLoading"
      :error="updateError"
      :has-selected="hasSelectedUpgrades"
      @close="closeUpdateModal"
      @refresh="refreshUpgradableApps"
      @toggle-all="toggleAllUpgrades"
      @upgrade-selected="upgradeSelectedApps"
      @upgrade-one="upgradeSingleApp"
    />

    <UninstallConfirmModal
      :show="showUninstallModal"
      :app="uninstallTargetApp"
      @close="closeUninstallModal"
      @success="onUninstallSuccess"
    />

    <AboutModal :show="showAboutModal" @close="closeAboutModal" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from "vue";
import axios from "axios";
import pino from "pino";
import AppSidebar from "./components/AppSidebar.vue";
import AppHeader from "./components/AppHeader.vue";
import AppGrid from "./components/AppGrid.vue";
import HomeView from "./components/HomeView.vue";
import AppDetailModal from "./components/AppDetailModal.vue";
import ScreenPreview from "./components/ScreenPreview.vue";
import DownloadQueue from "./components/DownloadQueue.vue";
import DownloadDetail from "./components/DownloadDetail.vue";
import InstalledAppsModal from "./components/InstalledAppsModal.vue";
import UpdateAppsModal from "./components/UpdateAppsModal.vue";
import UninstallConfirmModal from "./components/UninstallConfirmModal.vue";
import AboutModal from "./components/AboutModal.vue";
import {
  APM_STORE_BASE_URL,
  currentApp,
  currentAppSparkInstalled,
  currentAppApmInstalled,
  currentStoreMode,
} from "./global/storeConfig";
import {
  downloads,
  removeDownloadItem,
  watchDownloadsChange,
} from "./global/downloadStatus";
import {
  handleInstall,
  handleRetry,
  handleUpgrade,
} from "./modules/processInstall";
import type {
  App,
  AppJson,
  DownloadItem,
  UpdateAppItem,
  ChannelPayload,
  CategoryInfo,
  HomeLink,
  HomeList,
} from "./global/typedefinition";
import type { Ref } from "vue";
import type { IpcRendererEvent } from "electron";
const logger = pino();

// Axios 全局配置
const axiosInstance = axios.create({
  baseURL: APM_STORE_BASE_URL,
  timeout: 5000, // 增加到 5 秒，避免网络波动导致的超时
});

const fetchWithRetry = async <T,>(
  url: string,
  retries = 3,
  delay = 1000,
): Promise<T> => {
  try {
    const response = await axiosInstance.get<T>(url);
    return response.data;
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, retries - 1, delay * 2);
    }
    throw error;
  }
};

const cacheBuster = (url: string) => `${url}?cb=${Date.now()}`;

// 响应式状态
const themeMode = ref<"light" | "dark" | "auto">("auto");
const systemIsDark = ref(
  window.matchMedia("(prefers-color-scheme: dark)").matches,
);
const isDarkTheme = computed(() => {
  if (themeMode.value === "auto") return systemIsDark.value;
  return themeMode.value === "dark";
});

const categories: Ref<Record<string, CategoryInfo>> = ref({});
const apps: Ref<App[]> = ref([]);
const activeCategory = ref("home");
const searchQuery = ref("");
const isSidebarOpen = ref(false);
const showModal = ref(false);
const showPreview = ref(false);
const currentScreenIndex = ref(0);
const screenshots = ref<string[]>([]);
const loading = ref(true);
const showDownloadDetailModal = ref(false);
const currentDownload: Ref<DownloadItem | null> = ref(null);
const showInstalledModal = ref(false);
const installedApps = ref<App[]>([]);
const installedLoading = ref(false);
const installedError = ref("");
const showUpdateModal = ref(false);
const upgradableApps = ref<(App & { selected: boolean; upgrading: boolean })[]>(
  [],
);
const updateLoading = ref(false);
const updateError = ref("");
const showUninstallModal = ref(false);
const uninstallTargetApp: Ref<App | null> = ref(null);
const showAboutModal = ref(false);
const apmAvailable = ref(false);

/** 启动参数 --no-apm => 仅 Spark；--no-spark => 仅 APM；由主进程 IPC 提供 */
const storeFilter = ref<"spark" | "apm" | "both">("both");

// 计算属性
const filteredApps = computed(() => {
  let result = [...apps.value];

  // 合并相同包名的应用 (混合模式)
  if (currentStoreMode.value === "hybrid") {
    const mergedMap = new Map<string, App>();
    for (const app of result) {
      const existing = mergedMap.get(app.pkgname);
      if (existing) {
        if (!existing.isMerged) {
          existing.isMerged = true;
          // 根据当前的 origin 分配到对应的属性
          if (existing.origin === "spark") existing.sparkApp = { ...existing };
          else if (existing.origin === "apm") existing.apmApp = { ...existing };
        }
        if (app.origin === "spark") existing.sparkApp = app;
        else if (app.origin === "apm") existing.apmApp = app;
      } else {
        mergedMap.set(app.pkgname, { ...app });
      }
    }
    result = Array.from(mergedMap.values());
  }

  // 按分类筛选
  if (activeCategory.value !== "all") {
    result = result.filter((app) => app.category === activeCategory.value);
  }

  // 按搜索关键词筛选
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    result = result.filter((app) => {
      // 兼容可能为 undefined 的情况，虽然类型定义是 string
      return (
        (app.name || "").toLowerCase().includes(q) ||
        (app.pkgname || "").toLowerCase().includes(q) ||
        (app.tags || "").toLowerCase().includes(q) ||
        (app.more || "").toLowerCase().includes(q)
      );
    });
  }

  return result;
});

const categoryCounts = computed(() => {
  // 如果有搜索关键词，显示搜索结果数量
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    const counts: Record<string, number> = { all: 0 };

    apps.value.forEach((app) => {
      // 检查应用是否匹配搜索条件
      const matches =
        (app.name || "").toLowerCase().includes(q) ||
        (app.pkgname || "").toLowerCase().includes(q) ||
        (app.tags || "").toLowerCase().includes(q) ||
        (app.more || "").toLowerCase().includes(q);

      if (matches) {
        counts.all++;
        if (!counts[app.category]) counts[app.category] = 0;
        counts[app.category]++;
      }
    });

    return counts;
  }

  // 无搜索时显示总数量
  const counts: Record<string, number> = { all: apps.value.length };
  apps.value.forEach((app) => {
    if (!counts[app.category]) counts[app.category] = 0;
    counts[app.category]++;
  });
  return counts;
});

const hasSelectedUpgrades = computed(() => {
  return upgradableApps.value.some((app) => app.selected);
});

// 方法
const syncThemePreference = () => {
  document.documentElement.classList.toggle("dark", isDarkTheme.value);
};

const initTheme = () => {
  const savedTheme = localStorage.getItem("theme");
  if (
    savedTheme === "dark" ||
    savedTheme === "light" ||
    savedTheme === "auto"
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    themeMode.value = savedTheme as any;
  } else {
    themeMode.value = "auto";
  }
  window.ipcRenderer.send(
    "set-theme-source",
    themeMode.value === "auto" ? "system" : themeMode.value,
  );
  syncThemePreference();

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      systemIsDark.value = e.matches;
    });
};

const toggleTheme = () => {
  if (themeMode.value === "auto") themeMode.value = "light";
  else if (themeMode.value === "light") themeMode.value = "dark";
  else themeMode.value = "auto";
};

const selectCategory = (category: string) => {
  activeCategory.value = category;
  isSidebarOpen.value = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (
    category === "home" &&
    homeLinks.value.length === 0 &&
    homeLists.value.length === 0
  ) {
    loadHome();
  }
};

// 从仓库获取应用详细信息的辅助函数
const fetchAppFromStore = async (
  pkgname: string,
  category: string,
  origin: "spark" | "apm",
): Promise<App | null> => {
  try {
    const arch = window.apm_store.arch || "amd64";
    const finalArch = origin === "spark" ? `${arch}-store` : `${arch}-apm`;
    const appJsonUrl = `${APM_STORE_BASE_URL}/${finalArch}/${category}/${pkgname}/app.json`;
    const response = await fetch(cacheBuster(appJsonUrl));
    if (!response.ok) return null;
    const appJson = await response.json();
    return {
      name: appJson.Name || "",
      pkgname: appJson.Pkgname || pkgname,
      version: appJson.Version || "",
      filename: appJson.Filename || "",
      torrent_address: appJson.Torrent_address || "",
      author: appJson.Author || "",
      contributor: appJson.Contributor || "",
      website: appJson.Website || "",
      update: appJson.Update || "",
      size: appJson.Size || "",
      more: appJson.More || "",
      tags: appJson.Tags || "",
      img_urls:
        typeof appJson.img_urls === "string"
          ? (JSON.parse(appJson.img_urls) as string[])
          : appJson.img_urls || [],
      icons: appJson.icons || "",
      category: category,
      origin: origin,
      currentStatus: "not-installed",
    };
  } catch (e) {
    console.warn(`Failed to fetch ${origin} app info for ${pkgname}`, e);
    return null;
  }
};

const openDetail = async (app: App | Record<string, unknown>) => {
  // 提取 pkgname 和 category（必须存在）
  const pkgname = (app as Record<string, unknown>).pkgname as string;
  const category =
    ((app as Record<string, unknown>).category as string) || "unknown";
  // 检查是否来自 HomeView 或 DeepLink（需要重新获取完整信息）
  const fromHomeView = (app as Record<string, unknown>)._fromHomeView === true;
  const fromDeepLink = (app as Record<string, unknown>)._fromDeepLink === true;
  const needFetchFromStore = fromHomeView || fromDeepLink;
  if (!pkgname) {
    console.warn("openDetail: 缺少 pkgname", app);
    return;
  }

  // 首先尝试从当前已经处理好（合并/筛选）的 filteredApps 中查找
  let fullApp = filteredApps.value.find((a) => a.pkgname === pkgname);
  // 如果没找到，回退到全局 apps 中查找
  if (!fullApp) {
    fullApp = apps.value.find((a) => a.pkgname === pkgname);
  }

  let finalApp: App;

  // 来自 HomeView 或 DeepLink 的应用需要重新从仓库获取完整信息
  if (needFetchFromStore) {
    // 从 Spark 和 APM 仓库获取完整的应用信息
    const [sparkApp, apmApp] = await Promise.all([
      storeFilter.value !== "apm"
        ? fetchAppFromStore(pkgname, category, "spark")
        : Promise.resolve(null),
      storeFilter.value !== "spark"
        ? fetchAppFromStore(pkgname, category, "apm")
        : Promise.resolve(null),
    ]);

    // 构建合并的应用对象
    if (sparkApp || apmApp) {
      // 如果两个仓库都有这个应用，创建合并对象
      if (sparkApp && apmApp) {
        finalApp = {
          ...sparkApp, // 默认使用 Spark 的信息作为主显示
          isMerged: true,
          sparkApp: sparkApp,
          apmApp: apmApp,
          viewingOrigin: "spark", // 默认查看 Spark 版本
        };
      } else if (sparkApp) {
        finalApp = sparkApp;
      } else {
        finalApp = apmApp!;
      }
    } else if (fullApp) {
      finalApp = fullApp;
    } else {
      // 两个仓库都没有找到，且本地也没有，构造一个最小可用的 App 对象
      finalApp = {
        name: ((app as Record<string, unknown>).name as string) || "",
        pkgname: pkgname,
        version: ((app as Record<string, unknown>).version as string) || "",
        filename: ((app as Record<string, unknown>).filename as string) || "",
        category: category,
        torrent_address: "",
        author: "",
        contributor: "",
        website: "",
        update: "",
        size: "",
        more: ((app as Record<string, unknown>).more as string) || "",
        tags: "",
        img_urls: [],
        icons: "",
        origin:
          ((app as Record<string, unknown>).origin as "spark" | "apm") || "apm",
        currentStatus: "not-installed",
      } as App;
    }
  } else {
    // 非 HomeView 来源，使用原来的逻辑
    if (fullApp) {
      finalApp = fullApp;
    } else {
      // 构造一个最小可用的 App 对象
      finalApp = {
        name: ((app as Record<string, unknown>).name as string) || "",
        pkgname: pkgname,
        version: ((app as Record<string, unknown>).version as string) || "",
        filename: ((app as Record<string, unknown>).filename as string) || "",
        category: category,
        torrent_address: "",
        author: "",
        contributor: "",
        website: "",
        update: "",
        size: "",
        more: ((app as Record<string, unknown>).more as string) || "",
        tags: "",
        img_urls: [],
        icons: "",
        origin:
          ((app as Record<string, unknown>).origin as "spark" | "apm") || "apm",
        currentStatus: "not-installed",
      } as App;
    }
  }

  // 检查 Spark/APM 安装状态，已安装的版本优先展示
  if (finalApp.isMerged && (finalApp.sparkApp || finalApp.apmApp)) {
    const [sparkInstalled, apmInstalled] = await Promise.all([
      finalApp.sparkApp
        ? (window.ipcRenderer.invoke("check-installed", {
            pkgname: finalApp.sparkApp.pkgname,
            origin: "spark",
          }) as Promise<boolean>)
        : Promise.resolve(false),
      finalApp.apmApp
        ? (window.ipcRenderer.invoke("check-installed", {
            pkgname: finalApp.apmApp.pkgname,
            origin: "apm",
          }) as Promise<boolean>)
        : Promise.resolve(false),
    ]);
    if (sparkInstalled && !apmInstalled) {
      finalApp.viewingOrigin = "spark";
    } else if (apmInstalled && !sparkInstalled) {
      finalApp.viewingOrigin = "apm";
    }
    // 若都安装或都未安装，默认展示 spark
  }

  const displayAppForScreenshots =
    finalApp.viewingOrigin !== undefined && finalApp.isMerged
      ? ((finalApp.viewingOrigin === "spark"
          ? finalApp.sparkApp
          : finalApp.apmApp) ?? finalApp)
      : finalApp;

  currentApp.value = finalApp;
  currentScreenIndex.value = 0;
  loadScreenshots(displayAppForScreenshots);
  showModal.value = true;

  currentAppSparkInstalled.value = false;
  currentAppApmInstalled.value = false;
  checkAppInstalled(finalApp);

  nextTick(() => {
    const modal = document.querySelector(
      '[data-app-modal="detail"] .modal-panel',
    );
    if (modal) modal.scrollTop = 0;
  });
};

const checkAppInstalled = (app: App) => {
  if (app.isMerged) {
    if (app.sparkApp) {
      window.ipcRenderer
        .invoke("check-installed", {
          pkgname: app.sparkApp.pkgname,
          origin: "spark",
        })
        .then((isInstalled: boolean) => {
          currentAppSparkInstalled.value = isInstalled;
        });
    }
    if (app.apmApp) {
      window.ipcRenderer
        .invoke("check-installed", {
          pkgname: app.apmApp.pkgname,
          origin: "apm",
        })
        .then((isInstalled: boolean) => {
          currentAppApmInstalled.value = isInstalled;
        });
    }
  } else {
    window.ipcRenderer
      .invoke("check-installed", { pkgname: app.pkgname, origin: app.origin })
      .then((isInstalled: boolean) => {
        if (app.origin === "spark") {
          currentAppSparkInstalled.value = isInstalled;
        } else {
          currentAppApmInstalled.value = isInstalled;
        }
      });
  }
};

const loadScreenshots = (app: App) => {
  screenshots.value = [];
  const arch = window.apm_store.arch || "amd64";
  const finalArch = app.origin === "spark" ? `${arch}-store` : `${arch}-apm`;
  for (let i = 1; i <= 5; i++) {
    const screenshotUrl = `${APM_STORE_BASE_URL}/${finalArch}/${app.category}/${app.pkgname}/screen_${i}.png`;
    screenshots.value.push(screenshotUrl);
  }
};

const closeDetail = () => {
  showModal.value = false;
  currentApp.value = null;
};

const openScreenPreview = (index: number) => {
  currentScreenIndex.value = index;
  showPreview.value = true;
};

const closeScreenPreview = () => {
  showPreview.value = false;
};

// Home data
const homeLinks = ref<HomeLink[]>([]);
const homeLists = ref<HomeList[]>([]);
const homeLoading = ref(false);
const homeError = ref("");

const loadHome = async () => {
  homeLoading.value = true;
  homeError.value = "";
  homeLinks.value = [];
  homeLists.value = [];
  try {
    const arch = window.apm_store.arch || "amd64";
    const modes: Array<"spark" | "apm"> =
      storeFilter.value === "both" ? ["spark", "apm"] : [storeFilter.value];

    for (const mode of modes) {
      const finalArch = mode === "spark" ? `${arch}-store` : `${arch}-apm`;
      const base = `${APM_STORE_BASE_URL}/${finalArch}/home`;

      // homelinks.json
      try {
        const res = await fetch(cacheBuster(`${base}/homelinks.json`));
        if (res.ok) {
          const links = await res.json();
          const taggedLinks = links.map((l: HomeLink) => ({
            ...l,
            origin: mode,
          }));
          homeLinks.value.push(...taggedLinks);
        }
      } catch (e) {
        console.warn(`Failed to load ${mode} homelinks.json`, e);
      }

      // homelist.json
      try {
        const res2 = await fetch(cacheBuster(`${base}/homelist.json`));
        if (res2.ok) {
          const lists = await res2.json();
          for (const item of lists) {
            if (item.type === "appList" && item.jsonUrl) {
              try {
                const url = `${APM_STORE_BASE_URL}/${finalArch}${item.jsonUrl}`;
                const r = await fetch(cacheBuster(url));
                if (r.ok) {
                  const appsJson = await r.json();
                  const rawApps = appsJson || [];
                  const apps = await Promise.all(
                    rawApps.map(async (a: Record<string, string>) => {
                      const baseApp = {
                        name: a.Name || a.name || a.Pkgname || a.PkgName || "",
                        pkgname: a.Pkgname || a.pkgname || "",
                        category: a.Category || a.category || "unknown",
                        more: a.More || a.more || "",
                        version: a.Version || "",
                        filename: a.Filename || a.filename || "",
                        origin: mode as "spark" | "apm",
                      };

                      try {
                        const realAppUrl = `${APM_STORE_BASE_URL}/${finalArch}/${baseApp.category}/${baseApp.pkgname}/app.json`;
                        const realRes = await fetch(cacheBuster(realAppUrl));
                        if (realRes.ok) {
                          const realApp = await realRes.json();
                          if (realApp.Filename)
                            baseApp.filename = realApp.Filename;
                          if (realApp.More) baseApp.more = realApp.More;
                          if (realApp.Name) baseApp.name = realApp.Name;
                        }
                      } catch (e) {
                        console.warn(
                          `Failed to fetch real app.json for ${baseApp.pkgname}`,
                          e,
                        );
                      }
                      return baseApp;
                    }),
                  );
                  homeLists.value.push({
                    title: `${item.name || "推荐"} (${mode === "spark" ? "星火" : "APM"})`,
                    apps,
                  });
                }
              } catch (e) {
                console.warn("Failed to load home list", item, e);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to load ${mode} homelist.json`, e);
      }
    }
  } catch (error: unknown) {
    homeError.value = (error as Error)?.message || "加载首页失败";
  } finally {
    homeLoading.value = false;
  }
};

const prevScreen = () => {
  if (currentScreenIndex.value > 0) {
    currentScreenIndex.value--;
  }
};

const nextScreen = () => {
  if (currentScreenIndex.value < screenshots.value.length - 1) {
    currentScreenIndex.value++;
  }
};

const handleUpdate = async () => {
  try {
    const result = await window.ipcRenderer.invoke("run-update-tool");
    if (!result || !result.success) {
      logger.warn(`启动更新工具失败: ${result?.message || "未知错误"}`);
    }
  } catch (error) {
    logger.error(`调用更新工具时出错: ${error}`);
  }
};

const handleOpenInstallSettings = async () => {
  try {
    const result = await window.ipcRenderer.invoke("open-install-settings");
    if (!result || !result.success) {
      logger.warn(`启动安装设置失败: ${result?.message || "未知错误"}`);
    }
  } catch (error) {
    logger.error(`调用安装设置时出错: ${error}`);
  }
};

const handleList = () => {
  openInstalledModal();
};

const openUpdateModal = () => {
  showUpdateModal.value = true;
  refreshUpgradableApps();
};

const closeUpdateModal = () => {
  showUpdateModal.value = false;
};

const refreshUpgradableApps = async () => {
  updateLoading.value = true;
  updateError.value = "";
  try {
    const result = await window.ipcRenderer.invoke("list-upgradable");
    if (!result?.success) {
      upgradableApps.value = [];
      updateError.value = result?.message || "检查更新失败";
      return;
    }

    upgradableApps.value = (result.apps || []).map(
      (app: Record<string, string>) => ({
        ...app,
        // Map properties if needed or assume main matches App interface except field names might differ
        // For now assuming result.apps returns objects compatible with App for core fields,
        // but let's normalize just in case if main returns different structure.
        name: app.name || app.Name || "",
        pkgname: app.pkgname || app.Pkgname || "",
        version: app.newVersion || app.version || "",
        category: app.category || "unknown",
        selected: false,
        upgrading: false,
      }),
    );
  } catch (error: unknown) {
    upgradableApps.value = [];
    updateError.value = (error as Error)?.message || "检查更新失败";
  } finally {
    updateLoading.value = false;
  }
};

const toggleAllUpgrades = () => {
  const shouldSelectAll =
    !hasSelectedUpgrades.value ||
    upgradableApps.value.some((app) => !app.selected);
  upgradableApps.value = upgradableApps.value.map((app) => ({
    ...app,
    selected: shouldSelectAll ? true : false,
  }));
};

const upgradeSingleApp = async (app: UpdateAppItem) => {
  if (!app?.pkgname) return;
  const target = apps.value.find((a) => a.pkgname === app.pkgname);
  if (target) {
    await handleUpgrade(target);
  } else {
    // If we can't find it in the list (e.g. category not loaded?), use the info we have
    // But handleUpgrade expects App. Let's try to construct minimal App
    let minimalApp: App = {
      name: app.pkgname,
      pkgname: app.pkgname,
      version: app.newVersion || "",
      category: "unknown",
      tags: "",
      more: "",
      filename: "",
      torrent_address: "",
      author: "",
      contributor: "",
      website: "",
      update: "",
      size: "",
      img_urls: [],
      icons: "",
      origin: "apm", // Default to APM if unknown, or try to guess
      currentStatus: "installed",
    };
    await handleUpgrade(minimalApp);
  }
};

const upgradeSelectedApps = async () => {
  const selectedApps = upgradableApps.value.filter((app) => app.selected);
  for (const app of selectedApps) {
    await upgradeSingleApp(app);
  }
};

const openInstalledModal = () => {
  showInstalledModal.value = true;
  refreshInstalledApps();
};

const closeInstalledModal = () => {
  showInstalledModal.value = false;
};

const refreshInstalledApps = async () => {
  installedLoading.value = true;
  installedError.value = "";
  try {
    const result = await window.ipcRenderer.invoke("list-installed");
    if (!result?.success) {
      installedApps.value = [];
      installedError.value = result?.message || "读取已安装应用失败";
      return;
    }

    installedApps.value = [];
    for (const app of result.apps) {
      let appInfo = apps.value.find((a) => a.pkgname === app.pkgname);
      if (appInfo) {
        appInfo.flags = app.flags;
        appInfo.arch = app.arch;
        appInfo.currentStatus = "installed";
        appInfo.isDependency = app.isDependency;
      } else {
        // 如果在当前应用列表中找不到该应用，创建一个最小的 App 对象
        appInfo = {
          name: app.name || app.pkgname,
          pkgname: app.pkgname,
          version: app.version,
          category: "unknown",
          tags: "",
          more: "",
          filename: "",
          torrent_address: "",
          author: "",
          contributor: "",
          website: "",
          update: "",
          size: "",
          img_urls: [],
          icons: app.icon || "",
          origin: app.origin || (app.arch?.includes("apm") ? "apm" : "spark"),
          currentStatus: "installed",
          arch: app.arch,
          flags: app.flags,
          isDependency: app.isDependency,
        };
      }
      installedApps.value.push(appInfo);
    }
  } catch (error: unknown) {
    installedApps.value = [];
    installedError.value = (error as Error)?.message || "读取已安装应用失败";
  } finally {
    installedLoading.value = false;
  }
};

const requestUninstall = (app: App) => {
  uninstallTargetApp.value = app;
  showUninstallModal.value = true;
  removeDownloadItem(app.pkgname);
};

const onDetailRemove = (app: App) => {
  requestUninstall(app);
};

const onDetailInstall = async (app: App) => {
  await handleInstall(app);
};

const closeUninstallModal = () => {
  showUninstallModal.value = false;
  uninstallTargetApp.value = null;
};

const onUninstallSuccess = () => {
  // 刷新已安装列表（如果在显示）
  if (showInstalledModal.value) {
    refreshInstalledApps();
  }
  // 更新当前详情页状态（如果在显示）
  if (showModal.value && currentApp.value) {
    checkAppInstalled(currentApp.value);
  }
};

const installCompleteCallback = (pkgname?: string) => {
  if (currentApp.value && (!pkgname || currentApp.value.pkgname === pkgname)) {
    checkAppInstalled(currentApp.value);
  }
};

watchDownloadsChange(installCompleteCallback);

const uninstallInstalledApp = (app: App) => {
  requestUninstall(app);
};

const openAboutModal = () => {
  showAboutModal.value = true;
};

const closeAboutModal = () => {
  showAboutModal.value = false;
};

// TODO: 目前 APM 商店不能暂停下载
const pauseDownload = (id: DownloadItem) => {
  const download = downloads.value.find((d) => d.id === id.id);
  if (download && download.status === "installing") {
    // 'installing' matches type definition, previously 'downloading'
    download.status = "paused";
    download.logs.push({
      time: Date.now(),
      message: "下载已暂停",
    });
  }
};

// TODO: 同理，暂未实现
const resumeDownload = (id: DownloadItem) => {
  const download = downloads.value.find((d) => d.id === id.id);
  if (download && download.status === "paused") {
    download.status = "installing"; // previously 'downloading'
    download.logs.push({
      time: Date.now(),
      message: "继续下载...",
    });
    // simulateDownload(download); // removed or undefined?
  }
};

const cancelDownload = (id: DownloadItem) => {
  const index = downloads.value.findIndex((d) => d.id === id.id);
  if (index !== -1) {
    const download = downloads.value[index];
    // 发送到主进程取消
    window.ipcRenderer.send("cancel-install", download.id);

    download.status = "failed";
    download.logs.push({
      time: Date.now(),
      message: "下载已取消",
    });
    // 保留在队列中以便用户可以重试或查看日志
  }
};

const retryDownload = (id: DownloadItem) => {
  const download = downloads.value.find((d) => d.id === id.id);
  if (download && download.status === "failed") {
    download.status = "queued";
    download.progress = 0;
    download.downloadedSize = 0;
    download.logs.push({
      time: Date.now(),
      message: "重新开始下载...",
    });
    handleRetry(download);
  }
};

const clearCompletedDownloads = () => {
  downloads.value = downloads.value.filter((d) => d.status !== "completed");
};

const showDownloadDetailModalFunc = (download: DownloadItem) => {
  currentDownload.value = download;
  showDownloadDetailModal.value = true;
};

const closeDownloadDetail = () => {
  showDownloadDetailModal.value = false;
  currentDownload.value = null;
};

const openDownloadedApp = (pkgname: string, origin?: "spark" | "apm") => {
  // const encodedPkg = encodeURIComponent(download.pkgname);
  // openApmStoreUrl(`apmstore://launch?pkg=${encodedPkg}`, {
  //   fallbackText: `打开应用: ${download.pkgname}`
  // });
  window.ipcRenderer.invoke("launch-app", { pkgname, origin });
};

const loadCategories = async () => {
  try {
    const arch = window.apm_store.arch || "amd64";
    const modes: Array<"spark" | "apm"> =
      storeFilter.value === "both" ? ["spark", "apm"] : [storeFilter.value];

    const categoryData: Record<string, { zh: string; origins: string[] }> = {};

    for (const mode of modes) {
      const finalArch = mode === "spark" ? `${arch}-store` : `${arch}-apm`;
      const path = `/${finalArch}/categories.json`;

      try {
        const response = await axiosInstance.get(cacheBuster(path));
        const data = response.data;
        Object.keys(data).forEach((key) => {
          if (categoryData[key]) {
            if (!categoryData[key].origins.includes(mode)) {
              categoryData[key].origins.push(mode);
            }
          } else {
            categoryData[key] = {
              zh: data[key].zh || data[key],
              origins: [mode],
            };
          }
        });
      } catch (e) {
        logger.error(`读取 ${mode} categories.json 失败: ${e}`);
      }
    }
    categories.value = categoryData;
  } catch (error) {
    logger.error(`读取 categories 失败: ${error}`);
  }
};

const loadApps = async (onFirstBatch?: () => void) => {
  try {
    logger.info("开始加载应用数据（全并发带重试）...");

    const categoriesList = Object.keys(categories.value || {});
    let firstBatchCallDone = false;
    const arch = window.apm_store.arch || "amd64";

    // 并发加载所有分类，每个分类自带重试机制
    await Promise.all(
      categoriesList.map(async (category) => {
        const catInfo = categories.value[category];
        if (!catInfo) return;
        const origins = (catInfo.origins ||
          (catInfo.origin ? [catInfo.origin] : [])) as string[];

        await Promise.all(
          origins.map(async (mode) => {
            try {
              const finalArch =
                mode === "spark" ? `${arch}-store` : `${arch}-apm`;

              const path = `/${finalArch}/${category}/applist.json`;

              logger.info(`加载分类: ${category} (来源: ${mode})`);
              const categoryApps = await fetchWithRetry<AppJson[]>(
                cacheBuster(path),
              );

              const normalizedApps = (categoryApps || []).map((appJson) => ({
                name: appJson.Name,
                pkgname: appJson.Pkgname,
                version: appJson.Version,
                filename: appJson.Filename,
                torrent_address: appJson.Torrent_address,
                author: appJson.Author,
                contributor: appJson.Contributor,
                website: appJson.Website,
                update: appJson.Update,
                size: appJson.Size,
                more: appJson.More,
                tags: appJson.Tags,
                img_urls:
                  typeof appJson.img_urls === "string"
                    ? (JSON.parse(appJson.img_urls) as string[])
                    : appJson.img_urls,
                icons: appJson.icons,
                category: category,
                origin: mode as "spark" | "apm",
                currentStatus: "not-installed" as const,
              }));

              // 增量式更新，让用户尽快看到部分数据
              apps.value.push(...normalizedApps);

              // 只要有一个分类加载成功，就可以考虑关闭整体 loading（如果是首批逻辑）
              if (!firstBatchCallDone && typeof onFirstBatch === "function") {
                firstBatchCallDone = true;
                onFirstBatch();
              }
            } catch (error) {
              logger.warn(
                `加载分类 ${category} 来源 ${mode} 最终失败: ${error}`,
              );
            }
          }),
        );
      }),
    );

    // 确保即使全部失败也结束 loading
    if (!firstBatchCallDone && typeof onFirstBatch === "function") {
      onFirstBatch();
    }
  } catch (error) {
    logger.error(`加载应用数据流程异常: ${error}`);
  }
};

const handleSearchInput = (value: string) => {
  searchQuery.value = value;
};

const handleSearchFocus = () => {
  if (activeCategory.value === "home") activeCategory.value = "all";
};

// 生命周期钩子
onMounted(async () => {
  initTheme();

  // 从主进程获取启动参数（--no-apm / --no-spark），再加载数据
  storeFilter.value = await window.ipcRenderer.invoke("get-store-filter");

  // 检查 apm 是否可用
  if (storeFilter.value !== "spark") {
    apmAvailable.value = await window.ipcRenderer.invoke("check-apm-available");
  }

  await loadCategories();

  // 分类目录加载后，并行加载主页数据和所有应用列表
  // 使用非阻塞方式加载，让UI先展示出来
  loading.value = true;
  homeLoading.value = true;

  // 启动加载任务，但不等待它们完成
  Promise.all([
    loadHome(),
    new Promise<void>((resolve) => {
      loadApps(() => {
        loading.value = false;
        resolve();
      });
    }),
  ]).then(() => {
    // 所有数据加载完成后的回调（可选）
    logger.info("所有应用数据加载完成");
  });

  // 设置键盘导航
  document.addEventListener("keydown", (e) => {
    if (showPreview.value) {
      if (e.key === "Escape") closeScreenPreview();
      if (e.key === "ArrowLeft") prevScreen();
      if (e.key === "ArrowRight") nextScreen();
    }
    if (showModal.value && e.key === "Escape") {
      closeDetail();
    }
  });

  // Deep link Handlers
  window.ipcRenderer.on("deep-link-update", () => {
    if (loading.value) {
      const stop = watch(loading, (val) => {
        if (!val) {
          openUpdateModal();
          stop();
        }
      });
    } else {
      openUpdateModal();
    }
  });

  window.ipcRenderer.on("deep-link-installed", () => {
    if (loading.value) {
      const stop = watch(loading, (val) => {
        if (!val) {
          openInstalledModal();
          stop();
        }
      });
    } else {
      openInstalledModal();
    }
  });

  window.ipcRenderer.on(
    "deep-link-install",
    (_event: IpcRendererEvent, pkgname: string) => {
      const tryOpen = () => {
        const target = apps.value.find((a) => a.pkgname === pkgname);
        if (target) {
          openDetail(target);
        } else {
          logger.warn(`Deep link: app ${pkgname} not found`);
        }
      };

      if (loading.value) {
        const stop = watch(loading, (val) => {
          if (!val) {
            tryOpen();
            stop();
          }
        });
      } else {
        tryOpen();
      }
    },
  );

  window.ipcRenderer.on(
    "deep-link-search",
    (_event: IpcRendererEvent, data: { pkgname: string }) => {
      // 根据包名直接打开应用详情
      const tryOpen = () => {
        // 先切换到"全部应用"分类
        activeCategory.value = "all";
        // 使用类似 HomeView 的方式打开应用，从两个仓库获取完整信息
        const target = apps.value.find((a) => a.pkgname === data.pkgname);
        if (target) {
          openDetail({ ...target, _fromDeepLink: true });
        } else {
          // 如果找不到应用，回退到搜索模式
          searchQuery.value = data.pkgname;
          logger.warn(`Deep link: app ${data.pkgname} not found, fallback to search`);
        }
      };

      if (loading.value) {
        const stop = watch(loading, (val) => {
          if (!val) {
            tryOpen();
            stop();
          }
        });
      } else {
        tryOpen();
      }
    },
  );

  window.ipcRenderer.on(
    "remove-complete",
    (_event: IpcRendererEvent, payload: ChannelPayload) => {
      const pkgname = currentApp.value?.pkgname;
      if (payload.success && pkgname) {
        removeDownloadItem(pkgname);
      }
    },
  );

  window.ipcRenderer.send("renderer-ready", { status: true });
  logger.info("Renderer process is ready!");
});

// 观察器
watch(themeMode, (newVal) => {
  localStorage.setItem("theme", newVal);
  window.ipcRenderer.send(
    "set-theme-source",
    newVal === "auto" ? "system" : newVal,
  );
});

watch(isDarkTheme, () => {
  syncThemePreference();
});
</script>
