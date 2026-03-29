<template>
  <div class="space-y-6">
    <!-- 初始加载状态 - 只有在完全没有数据时显示 -->
    <div
      v-if="loading && links.length === 0 && lists.length === 0"
      class="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400"
    >
      <i class="fas fa-spinner fa-spin text-2xl mb-3"></i>
      <span class="text-sm">正在加载首页内容…</span>
    </div>
    <div
      v-else-if="error"
      class="rounded-2xl border border-rose-200/70 bg-rose-50/60 px-6 py-4 text-center text-sm text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
    >
      {{ error }}
    </div>
    <!-- 无数据时显示欢迎信息 -->
    <div
      v-else-if="links.length === 0 && lists.length === 0"
      class="flex flex-col items-center justify-center py-20 text-center"
    >
      <img
        v-if="storeFilter === 'apm'"
        src="../assets/imgs/amber-pm-logo.png"
        alt="Amber PM"
        class="h-32 w-32 mb-6 opacity-90 object-contain"
      />
      <img
        v-else
        src="../assets/imgs/spark-store.svg"
        alt="星火应用商店"
        class="h-32 w-32 mb-6 opacity-90"
      />
      <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">
        {{ storeFilter === 'apm' ? '欢迎来到星火应用商店 (Amber PM)' : '欢迎来到星火应用商店' }}
      </h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {{ storeFilter === 'apm' ? '探索丰富的应用，发现更多精彩内容' : '探索丰富的应用，发现更多精彩内容' }}
      </p>
    </div>
    <!-- 有数据就立即展示，图片逐步加载 -->
    <div v-else>
      <!-- 左上角欢迎语 -->
      <div class="mb-4">
        <h1 class="text-xl font-bold text-slate-800 dark:text-slate-200">
          {{ storeFilter === 'apm' ? '欢迎来到星火应用商店 (Amber PM)' : '欢迎来到星火应用商店' }}
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          探索丰富的应用，发现更多精彩内容
        </p>
      </div>

      <!-- Links 区域 -->
      <div v-if="links.length > 0" class="grid gap-5 auto-fit-grid">
        <a
          v-for="link in links"
          :key="link.url + link.name"
          :href="link.type === '_blank' ? undefined : link.url"
          @click.prevent="onLinkClick(link)"
          class="group block overflow-hidden rounded-xl transition-transform duration-300 hover:scale-[1.02]"
          :title="link.more as string"
        >
          <!-- 图片区域 - 850:400 比例 -->
          <div class="relative w-full aspect-[850/400] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
            <img
              :src="computedImgUrl(link)"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              @load="onImageLoad(link.url + link.name)"
              @error="onImageError(link.url + link.name)"
              :class="{ 'opacity-0': !imageLoaded[link.url + link.name], 'opacity-100 transition-opacity duration-300': imageLoaded[link.url + link.name] }"
            />
            <!-- 图片加载占位符 -->
            <div
              v-if="!imageLoaded[link.url + link.name]"
              class="absolute inset-0 flex items-center justify-center"
            >
              <div class="h-10 w-10 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"></div>
            </div>
          </div>
          <!-- 文字信息区域 -->
          <div class="mt-3 px-1">
            <div class="text-base font-semibold text-slate-900 dark:text-white group-hover:text-brand dark:group-hover:text-brand transition-colors">
              {{ link.name }}
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {{ link.more }}
            </div>
          </div>
        </a>
      </div>

      <!-- Lists 区域 -->
      <div v-if="lists.length > 0" class="space-y-6 mt-6">
        <section v-for="section in lists" :key="section.title">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900">
              {{ section.title }}
            </h3>
          </div>
          <div class="mt-3 grid gap-4 app-grid">
            <AppCard
              v-for="app in section.apps"
              :key="app.pkgname"
              :app="app"
              @open-detail="$emit('open-detail', $event)"
            />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppCard from "./AppCard.vue";
import { APM_STORE_BASE_URL } from "../global/storeConfig";
import { reactive } from "vue";
import type { HomeLink, HomeList, App } from "../global/typedefinition";

defineProps<{
  links: HomeLink[];
  lists: HomeList[];
  loading: boolean;
  error: string;
  storeFilter?: "spark" | "apm" | "both";
}>();

defineEmits<{
  (e: "open-detail", app: App | Record<string, unknown>): void;
}>();

// 图片加载状态跟踪
const imageLoaded = reactive<Record<string, boolean>>({});

const onImageLoad = (key: string) => {
  imageLoaded[key] = true;
};

const onImageError = (key: string) => {
  imageLoaded[key] = true; // 即使加载失败也标记为完成，隐藏占位符
};

const computedImgUrl = (link: HomeLink) => {
  if (!link.imgUrl) return "";
  const arch = window.apm_store.arch || "amd64";
  const finalArch = link.origin === "spark" ? `${arch}-store` : `${arch}-apm`;
  return `${APM_STORE_BASE_URL}/${finalArch}${link.imgUrl}`;
};

const onLinkClick = (link: HomeLink) => {
  if (link.type === "_blank") {
    window.open(link.url, "_blank");
  } else {
    // open in same page: navigate to url
    window.location.href = link.url;
  }
};
</script>

<style scoped></style>

<style scoped>
/* Link 卡片网格 - 固定最小宽度 180px */
.auto-fit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

/* 小屏幕 - 最小宽度减小 */
@media (max-width: 640px) {
  .auto-fit-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
  }
}

/* 应用卡片网格 - 保持原来的样式 */
.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

@media (max-width: 640px) {
  .app-grid {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
}
</style>
