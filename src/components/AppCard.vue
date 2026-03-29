<template>
  <div
    @click="openDetail"
    class="group flex cursor-pointer gap-3 rounded-xl border border-slate-200/70 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/60"
  >
    <div
      class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-slate-100 to-slate-200 shadow-inner dark:from-slate-800 dark:to-slate-700"
    >
      <img
        ref="iconImg"
        :src="loadedIcon"
        alt="icon"
        class="h-full w-full object-cover transition-opacity duration-300"
        :class="isLoaded ? 'opacity-100' : 'opacity-0'"
      />
    </div>
    <div class="flex flex-1 flex-col gap-1 overflow-hidden">
      <div class="flex items-center gap-2">
        <div
          class="truncate text-base font-semibold text-slate-900 dark:text-white"
        >
          {{ app.name || "" }}
        </div>
        <!-- 来源标识：支持同时显示多个 -->
        <div class="flex shrink-0 gap-1">
          <span
            v-if="showSparkBadge"
            class="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
          >
            Spark
          </span>
          <span
            v-if="showApmBadge"
            class="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          >
            APM
          </span>
        </div>
      </div>
      <div class="text-sm text-slate-500 dark:text-slate-400 leading-tight">
        {{ app.pkgname || "" }} · {{ app.version || "" }}
      </div>
      <div
        class="truncate text-xs text-slate-500 dark:text-slate-400 leading-tight"
      >
        {{ description || "\u00A0" }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { APM_STORE_BASE_URL } from "../global/storeConfig";
import type { App } from "../global/typedefinition";

const props = defineProps<{
  app: App;
  // 从外部传入的 Spark/APM 可用性信息
  sparkAvailable?: boolean;
  apmAvailable?: boolean;
}>();

const emit = defineEmits<{
  (e: "open-detail", app: App): void;
}>();

const iconImg = ref<HTMLImageElement | null>(null);
const isLoaded = ref(false);
const loadedIcon = ref(
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3C/svg%3E',
);

// 是否显示 Spark 标识
const showSparkBadge = computed(() => {
  // 如果明确指定了 sparkAvailable，使用它
  if (props.sparkAvailable !== undefined) return props.sparkAvailable;
  // 否则根据 app 的 origin 或 isMerged 判断
  return props.app.origin === "spark" || props.app.isMerged === true;
});

// 是否显示 APM 标识
const showApmBadge = computed(() => {
  // 如果明确指定了 apmAvailable，使用它
  if (props.apmAvailable !== undefined) return props.apmAvailable;
  // 否则根据 app 的 origin 或 isMerged 判断
  return props.app.origin === "apm" || props.app.isMerged === true;
});

const iconPath = computed(() => {
  const arch = window.apm_store.arch || "amd64";
  const finalArch =
    props.app.origin === "spark" ? `${arch}-store` : `${arch}-apm`;
  return `${APM_STORE_BASE_URL}/${finalArch}/${props.app.category}/${props.app.pkgname}/icon.png`;
});

const description = computed(() => {
  const more = props.app.more || "";
  return more.substring(0, 80) + (more.length > 80 ? "..." : "");
});

const openDetail = () => {
  emit("open-detail", props.app);
};

let observer: IntersectionObserver | null = null;

onMounted(() => {
  // 创建 Intersection Observer
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isLoaded.value) {
          // 图片进入视口，开始加载
          const img = new Image();
          img.onload = () => {
            loadedIcon.value = iconPath.value;
            isLoaded.value = true;
            if (observer) observer.unobserve(entry.target);
          };
          img.onerror = () => {
            // 加载失败时使用默认图标
            loadedIcon.value =
              'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23e0e0e0" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%23999" font-size="14"%3ENo Icon%3C/text%3E%3C/svg%3E';
            isLoaded.value = true;
            if (observer) observer.unobserve(entry.target);
          };
          img.src = iconPath.value;
        }
      });
    },
    {
      rootMargin: "50px", // 提前50px开始加载
      threshold: 0.01,
    },
  );

  // 观察图标元素
  if (iconImg.value) {
    observer.observe(iconImg.value);
  }
});

// 当 app 变更时重置懒加载状态并重新观察
watch(iconPath, () => {
  loadedIcon.value =
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3C/svg%3E';
  isLoaded.value = false;
  if (observer && iconImg.value) {
    observer.unobserve(iconImg.value);
    observer.observe(iconImg.value);
  }
});

onBeforeUnmount(() => {
  // 清理 observer
  if (observer && iconImg.value) {
    observer.unobserve(iconImg.value);
  }
});
</script>
