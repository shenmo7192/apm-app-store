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
  <div
    v-else-if="!loading"
    class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
  >
    <AppCard
      v-for="(app, index) in apps"
      :key="index"
      :app="app"
      @open-detail="$emit('open-detail', app)"
    />
  </div>
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
import AppCard from "./AppCard.vue";
import type { App } from "../global/typedefinition";

defineProps<{
  apps: App[];
  loading: boolean;
}>();

defineEmits<{
  (e: "open-detail", app: App): void;
}>();
</script>
