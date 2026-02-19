import { BrowserWindow } from "electron";
import { deepLink } from "./deeplink";
import { isLoaded } from "../global";
import pino from "pino";

const logger = pino({ name: "handle-url-scheme.ts" });

const pendingActions: Array<() => void> = [];

new Promise<void>((resolve) => {
  const checkLoaded = () => {
    if (isLoaded.value) {
      resolve();
    } else {
      setTimeout(checkLoaded, 100);
    }
  };
  checkLoaded();
}).then(() => {
  while (pendingActions.length > 0) {
    const action = pendingActions.shift();
    if (action) action();
  }
});

deepLink.on("event", (query) => {
  logger.info(
    `Deep link: event "event" fired with query: ${JSON.stringify(query)}`,
  );
});

deepLink.on("action", (query) => {
  logger.info(
    `Deep link: event "action" fired with query: ${JSON.stringify(query)}`,
  );

  const action = () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;

    if (query.cmd === "update") {
      win.webContents.send("deep-link-update");
      if (win.isMinimized()) win.restore();
      win.focus();
    } else if (query.cmd === "list") {
      win.webContents.send("deep-link-installed");
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  };

  logger.info(`isLoaded: ${isLoaded.value}`);

  if (isLoaded.value) {
    action();
  } else {
    pendingActions.push(action);
  }
});

deepLink.on("install", (query) => {
  logger.info(
    `Deep link: event "install" fired with query: ${JSON.stringify(query)}`,
  );

  const action = () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;

    if (query.pkg) {
      win.webContents.send("deep-link-install", query.pkg);
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  };

  if (isLoaded.value) {
    action();
  } else {
    pendingActions.push(action);
  }
});

deepLink.on("search", (query) => {
  logger.info(
    `Deep link: event "search" fired with query: ${JSON.stringify(query)}`,
  );

  const action = () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;

    if (query.pkgname) {
      win.webContents.send("deep-link-search", { pkgname: query.pkgname });
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  };

  logger.info(`isLoaded: ${isLoaded.value}`);

  if (isLoaded.value) {
    action();
  } else {
    pendingActions.push(action);
  }
});
