<template>
  <div class="space-y-8">
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
    <!-- 有数据就立即展示，图片逐步加载 -->
    <div v-else>
      <!-- Links 区域 -->
      <div v-if="links.length > 0" class="grid gap-4 auto-fit-grid">
        <a
          v-for="link in links"
          :key="link.url + link.name"
          :href="link.type === '_blank' ? undefined : link.url"
          @click.prevent="onLinkClick(link)"
          class="flex flex-col items-start gap-2 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm transition hover:shadow-lg dark:border-slate-800/70 dark:bg-slate-900/90"
          :title="link.more as string"
        >
          <div class="h-20 w-full flex items-center justify-center bg-slate-100/50 dark:bg-slate-800/50 rounded-xl overflow-hidden">
            <img
              :src="computedImgUrl(link)"
              class="h-full w-full object-contain"
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
              <div class="h-8 w-8 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"></div>
            </div>
          </div>
          <div class="text-base font-semibold text-slate-900 dark:text-white">
            {{ link.name }}
          </div>
          <div class="text-sm text-slate-500 dark:text-slate-400">
            {{ link.more }}
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
          <div class="mt-3 grid gap-4 auto-fit-grid">
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
.auto-fit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

/* slight gap tuning for small screens */
@media (max-width: 640px) {
  .auto-fit-grid {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
}
</style>
