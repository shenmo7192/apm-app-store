<template>
  <!-- 搜索结果为空 -->
  <div
    v-if="!loading && apps.length === 0"
    class="flex flex-col items-center justify-center py-20 text-center"
  >
    <div
      class="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
    >
      <i class="fas fa-search text-3xl text-slate-400 dark:text-slate-500"></i>
    </div>
    <h3 class="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
      未找到应用
    </h3>
    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
      试试其他关键词，或检查拼写是否正确
    </p>
  </div>

  <!-- 应用数量较少时，使用普通网格 -->
  <div
    v-else-if="!loading && apps.length <= 50"
    class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
  >
    <AppCard
      v-for="(app, index) in apps"
      :key="index"
      :app="app"
      :show-origin="storeFilter === 'both'"
      @open-detail="$emit('open-detail', app)"
    />
  </div>

  <!-- 应用数量较多时，使用虚拟滚动 -->
  <RecycleScroller
    v-else-if="!loading"
    class="scroller"
    :items="gridRows"
    :item-size="itemHeight"
    key-field="id"
    v-slot="{ item }"
  >
    <div class="grid-row grid gap-x-4 gap-y-8" :class="gridColumnsClass">
      <AppCard
        v-for="app in item.apps"
        :key="app.pkgname"
        :app="app"
        :show-origin="storeFilter === 'both'"
        @open-detail="$emit('open-detail', app)"
      />
    </div>
  </RecycleScroller>

  <!-- 加载骨架屏 -->
  <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    <div
      v-for="n in 8"
      :key="n"
      class="flex gap-3 rounded-xl border border-slate-200/60 bg-white/80 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/50"
    >
      <div
        class="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"
      ></div>
      <div class="flex flex-1 flex-col gap-1.5">
        <div
          class="h-4 w-2/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800"
        ></div>
        <div
          class="h-3 w-1/2 animate-pulse rounded-full bg-slate-200/80 dark:bg-slate-800/80"
        ></div>
        <div
          class="h-3 w-3/4 animate-pulse rounded-full bg-slate-200/60 dark:bg-slate-800/60"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import AppCard from "./AppCard.vue";
import type { App } from "../global/typedefinition";

const props = defineProps<{
  apps: App[];
  loading: boolean;
  storeFilter?: "spark" | "apm" | "both";
}>();

defineEmits<{
  (e: "open-detail", app: App): void;
}>();

// 当前列数
const columns = ref(4);

// 根据窗口宽度更新列数
const updateColumns = () => {
  const width = window.innerWidth;
  if (width >= 1536) columns.value = 4;
  else if (width >= 1280) columns.value = 3;
  else if (width >= 640) columns.value = 2;
  else columns.value = 1;
};

onMounted(() => {
  updateColumns();
  window.addEventListener("resize", updateColumns);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateColumns);
});

// 网格列数类名
const gridColumnsClass = computed(() => {
  const map: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };
  return map[columns.value] || "grid-cols-4";
});

// 每个应用卡片的高度（包括 gap）
// 卡片实际高度约 96px + 垂直间距 32px (gap-y-8)
const itemHeight = 128;

// 将应用列表分组为行
const gridRows = computed(() => {
  const rows: { id: number; apps: App[] }[] = [];

  for (let i = 0; i < props.apps.length; i += columns.value) {
    rows.push({
      id: i,
      apps: props.apps.slice(i, i + columns.value),
    });
  }

  return rows;
});
</script>

<style scoped>
.scroller {
  height: calc(100vh - 140px); /* 调整高度 */
  overflow-y: auto;
  padding: 0; /* 移除内边距 */
  margin: -24px -16px; /* 抵消父容器的 px-4 py-6 */
}

@media (min-width: 1024px) {
  .scroller {
    margin: -24px -40px; /* 抵消父容器的 lg:px-10 */
  }
}

.grid-row {
  padding: 12px 16px;
  box-sizing: border-box;
  min-height: 128px; /* 确保最小高度 */
}

/* 确保 RecycleScroller 的样式正确 */
:deep(.vue-recycle-scroller) {
  position: relative;
}

:deep(.vue-recycle-scroller__item-wrapper) {
  flex: 1;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
}

:deep(.vue-recycle-scroller__item-view) {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  box-sizing: border-box;
}
</style>
