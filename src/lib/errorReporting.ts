export interface BuildInfo {
  version: string;
  buildTime: string;
}

export interface ErrorPayload extends BuildInfo {
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  url: string;
  userAgent: string;
  timestamp: string;
}

export const BUILD_INFO: BuildInfo = {
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
  buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'unknown'
};

const ERROR_ENDPOINT = import.meta.env?.VITE_ERROR_ENDPOINT;

let isInstalled = false;

function logError(label: string, payload: unknown): void {
  console.error(`[PDFTools] ${label}`, payload);
}

export function reportError(error: unknown, context: Record<string, unknown> = {}): ErrorPayload {
  const normalized = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'));
  const payload: ErrorPayload = {
    ...BUILD_INFO,
    message: normalized.message,
    stack: normalized.stack,
    context,
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    timestamp: new Date().toISOString()
  };

  logError('Error:', payload);

  if (
    ERROR_ENDPOINT &&
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function'
  ) {
    try {
      navigator.sendBeacon(ERROR_ENDPOINT, JSON.stringify(payload));
    } catch (beaconError) {
      logError('Error reporting failed:', beaconError);
    }
  }

  return payload;
}

export function installGlobalErrorHandlers(): void {
  if (isInstalled || typeof window === 'undefined') return;
  isInstalled = true;

  window.addEventListener('error', event => {
    if (event.error) {
      reportError(event.error, { source: 'window.error' });
    }
  });

  window.addEventListener('unhandledrejection', event => {
    reportError(event.reason, { source: 'unhandledrejection' });
  });
}
