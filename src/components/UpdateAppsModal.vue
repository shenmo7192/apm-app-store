<template>
  <div class="modal-backdrop" :style="{ display: show ? 'flex' : 'none' }" role="dialog" aria-hidden="false">
    <div class="modal update-modal">
      <div class="modal-header">
        <div class="modal-title-section">
          <div class="modal-title">软件更新</div>
          <div class="modal-subtitle">可更新的 APM 应用</div>
        </div>
        <div class="modal-actions">
          <button class="action-btn" :disabled="loading" @click="$emit('refresh')">
            <i class="fas fa-sync-alt"></i> 刷新
          </button>
          <button class="action-btn secondary" :disabled="loading || apps.length === 0" @click="$emit('toggle-all')">
            <i class="fas fa-check-square"></i> 全选/全不选
          </button>
          <button class="apm-btn" :disabled="loading || !hasSelected" @click="$emit('upgrade-selected')">
            <i class="fas fa-upload"></i> 更新选中
          </button>
          <button class="close-modal" @click="$emit('close')" aria-label="关闭">×</button>
        </div>
      </div>

      <div class="update-content">
        <div v-if="loading" class="update-empty">正在检查可更新应用…</div>
        <div v-else-if="error" class="update-empty error">{{ error }}</div>
        <div v-else-if="apps.length === 0" class="update-empty">暂无可更新应用</div>
        <div v-else class="update-list">
          <label v-for="app in apps" :key="app.pkgname" class="update-item">
            <input type="checkbox" v-model="app.selected" :disabled="app.upgrading" />
            <div class="update-info">
              <div class="update-name">{{ app.pkgname }}</div>
              <div class="update-meta">
                <span>当前 {{ app.currentVersion || '-' }}</span>
                <span class="dot">·</span>
                <span>更新至 {{ app.newVersion || '-' }}</span>
              </div>
            </div>
            <div class="update-actions">
              <button class="action-btn secondary" :disabled="app.upgrading" @click.prevent="$emit('upgrade-one', app)">
                <i class="fas fa-arrow-up"></i>
                {{ app.upgrading ? '更新中…' : '更新' }}
              </button>
            </div>
          </label>
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
  },
  hasSelected: {
    type: Boolean,
    default: false
  }
});

defineEmits(['close', 'refresh', 'toggle-all', 'upgrade-selected', 'upgrade-one']);
</script>

<style scoped>
.update-modal {
  width: min(920px, calc(100% - 40px));
}

.update-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.update-empty {
  padding: 32px;
  text-align: center;
  color: var(--muted);
  background: var(--glass);
  border-radius: var(--radius);
}

.update-empty.error {
  color: #ef4444;
}

.update-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.update-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--glass);
  box-shadow: var(--shadow);
}

.update-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}

.update-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.update-name {
  font-weight: 600;
  font-size: 15px;
}

.update-meta {
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

.update-actions {
  display: flex;
  align-items: center;
}
</style>
