// fbevents.js drains this queue when it loads and installs callMethod for later events.
type PixelCommand = ((...args: string[]) => void) & {
  queue: string[][];
  callMethod?: (...args: string[]) => void;
  push: (...args: string[]) => void;
  disablePushState: boolean;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: PixelCommand;
    _fbq?: PixelCommand;
  }
}

const initialized = new Set<string>();

function preparePixel() {
  if (window.fbq) return window.fbq;
  const command: PixelCommand = (...args) => {
    if (command.callMethod) command.callMethod(...args);
    else command.queue.push(args);
  };
  command.queue = [];
  command.push = command;
  command.disablePushState = true;
  command.loaded = true;
  command.version = "2.0";
  window.fbq = command;
  window._fbq ??= command;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  return command;
}

export function initializeFormPixel(id: string) {
  if (!/^\d{5,30}$/.test(id)) return;
  try {
    const fbq = preparePixel();
    if (!initialized.has(id)) {
      fbq("set", "autoConfig", "false", id);
      fbq("init", id);
      initialized.add(id);
    }
    return fbq;
  } catch {
    // The form must still work when a browser extension blocks marketing scripts.
  }
}

export function trackFormPixel(id: string, name: string, custom = false) {
  try {
    initializeFormPixel(id)?.(
      custom ? "trackSingleCustom" : "trackSingle",
      id,
      name,
    );
  } catch {
    // Marketing is independent from CRM capture.
  }
}
