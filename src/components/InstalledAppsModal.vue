<template>
  <div class="modal-backdrop" :style="{ display: show ? 'flex' : 'none' }" role="dialog" aria-hidden="false">
    <div class="modal installed-modal">
      <div class="modal-header">
        <div class="modal-title-section">
          <div class="modal-title">已安装应用</div>
          <div class="modal-subtitle">来自本机 APM 安装列表</div>
        </div>
        <div class="modal-actions">
          <button class="apm-btn" :disabled="loading" @click="$emit('refresh')">
            <i class="fas fa-sync-alt"></i> 刷新
          </button>
          <button class="close-modal" @click="$emit('close')" aria-label="关闭">×</button>
        </div>
      </div>

      <div class="installed-content">
        <div v-if="loading" class="installed-empty">正在读取已安装应用…</div>
        <div v-else-if="error" class="installed-empty error">{{ error }}</div>
        <div v-else-if="apps.length === 0" class="installed-empty">暂无已安装应用</div>
        <div v-else class="installed-list">
          <div v-for="app in apps" :key="app.pkgname" class="installed-item">
            <div class="installed-info">
              <div class="installed-name">{{ app.pkgname }}</div>
              <div class="installed-meta">
                <span>{{ app.version }}</span>
                <span class="dot">·</span>
                <span>{{ app.arch }}</span>
                <span v-if="app.flags" class="dot">·</span>
                <span v-if="app.flags">{{ app.flags }}</span>
              </div>
            </div>
            <div class="installed-actions">
              <button class="apm-btn secondary danger" :disabled="app.removing" @click="$emit('uninstall', app)">
                <i class="fas fa-trash"></i>
                {{ app.removing ? '卸载中…' : '卸载' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

defineProps({
  show: {
    type: Boolean,
    required: true
  },
  apps: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
});

defineEmits(['close', 'refresh', 'uninstall']);
</script>

<style scoped>
.installed-modal {
  width: min(900px, calc(100% - 40px));
}

.installed-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.installed-empty {
  padding: 32px;
  text-align: center;
  color: var(--muted);
  background: var(--glass);
  border-radius: var(--radius);
}

.installed-empty.error {
  color: #ef4444;
}

.installed-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.installed-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-radius: var(--radius);
  background: var(--glass);
  box-shadow: var(--shadow);
}

.installed-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.installed-name {
  font-weight: 600;
  font-size: 16px;
}

.installed-meta {
  color: var(--muted);
  font-size: 13px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.dot {
  opacity: 0.6;
}

.installed-actions {
  display: flex;
  gap: 8px;
}

.apm-btn.danger {
  background: #ef4444;
  border-color: rgba(239, 68, 68, 0.2);
}

.apm-btn.danger:hover {
  background: #dc2626;
}
</style>
