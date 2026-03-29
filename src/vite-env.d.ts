/* eslint-disable */
/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import("electron").IpcRenderer;
  apm_store: {
    arch: string;
  };
}

// IPC channel type definitions
declare interface IpcChannels {
  "get-app-version": () => string;
}

declare const __APP_VERSION__: string;

// vue-virtual-scroller type declarations
declare module "vue-virtual-scroller" {
  import { DefineComponent } from "vue";

  export const RecycleScroller: DefineComponent<{
    items: any[];
    itemSize: number;
    keyField?: string;
    direction?: "vertical" | "horizontal";
    buffer?: number;
  }>;

  export const DynamicScroller: DefineComponent<{
    items: any[];
    minItemSize: number;
    keyField?: string;
    direction?: "vertical" | "horizontal";
    buffer?: number;
  }>;

  export const DynamicScrollerItem: DefineComponent<{}>;
}
