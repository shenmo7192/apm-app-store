/**
 * Deep link handler for Electron app.
 * Author: juxnpxblo@github
 */
import { app } from "electron";
import pino from "pino";

const logger = pino({ 'name': 'deeplink.ts' });
type Query = Record<string, string>;
export type Listener = (query: Query) => void;

class ListenersMap {
  private map: Map<string, Set<Listener>> = new Map();

  add(action: string, listener: Listener) {
    if (!this.map.has(action)) {
      this.map.set(action, new Set());
    }
    this.map.get(action)!.add(listener);

    return this.map.get(action)!.size;
  }

  remove(action: string, listener: Listener) {
    const listeners = this.map.get(action);
    if (!listeners) return 0;

    listeners.delete(listener);

    if (listeners.size === 0) {
      this.map.delete(action);
      return 0;
    }

    return listeners.size;
  }

  emit(action: string, query: Query) {
    const actionListeners = this.map.get(action);
    if (!actionListeners) return 0;

    actionListeners.forEach((listener) => listener(query));

    return actionListeners.size;
  }
}

const protocols = ["apmstore"];
const listeners = new ListenersMap();

export const deepLink = {
  on: (event: string, listener: Listener) => {
    const count = listeners.add(event, listener);
    logger.info(
      `Deep link: listener added for event ${event}. Total event listeners: ${count}`
    );
  },
  off: (event: string, listener: Listener) => {
    const count = listeners.remove(event, listener);
    logger.info(
      `Deep link: listener removed for event ${event}. Total event listeners: ${count}`
    );
  },
  once: (event: string, listener: Listener) => {
    const onceListener: Listener = (query) => {
      deepLink.off(event, onceListener);
      listener(query);
    };
    deepLink.on(event, onceListener);
  },
};

export function handleCommandLine(commandLine: string[]) {
  const target = commandLine.find((arg) =>
    protocols.some((protocol) => arg.startsWith(protocol + "://"))
  );
  if (!target) return;

  logger.info(`Deep link: protocol link got: ${target}`);

  try {
    const url = new URL(target);

    const action = url.hostname;
    logger.info(`Deep link: action found: ${action}`);

    const query: Query = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    logger.info(`Deep link: query found: ${JSON.stringify(query)}`);

    const emitCount = listeners.emit(action, query);
    logger.info(`Deep link: emitted for ${emitCount} listeners`);
  } catch (error) {
    logger.error(`Deep link: error parsing URL: ${error}`);
  }
}

app.on("second-instance", (_e, commandLine) => {
  handleCommandLine(commandLine);
});
