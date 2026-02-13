<template>
  <button
    type="button"
    class="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm font-medium text-slate-600 shadow-sm transition hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300"
    :aria-pressed="themeMode === 'dark'"
    @click="toggle"
  >
    <span class="flex items-center gap-2">
      <i class="fas" :class="iconClass"></i>
      <span>{{ label }}</span>
    </span>
    <span
      class="relative inline-flex h-6 w-12 items-center rounded-full bg-slate-300/80 transition dark:bg-slate-700"
    >
      <span
        :class="[
          'inline-block h-4 w-4 rounded-full bg-white shadow transition',
          togglePosition,
        ]"
      ></span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  themeMode: "light" | "dark" | "auto";
}>();

const emit = defineEmits<{
  (e: "toggle"): void;
}>();

const toggle = () => {
  emit("toggle");
};

const label = computed(() => {
  if (props.themeMode === "auto") return "跟随系统";
  if (props.themeMode === "dark") return "深色主题";
  return "浅色主题";
});

const iconClass = computed(() => {
  if (props.themeMode === "auto") return "fa-adjust text-slate-500";
  if (props.themeMode === "dark") return "fa-moon text-amber-200";
  return "fa-sun text-amber-400";
});

const togglePosition = computed(() => {
  if (props.themeMode === "auto") return "translate-x-4";
  if (props.themeMode === "dark") return "translate-x-7";
  return "translate-x-1";
});
</script>
