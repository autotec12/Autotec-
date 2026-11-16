export type UpdateStatus =
  | 'idle'
  | 'available'
  | 'deferred'
  | 'waiting_operations'
  | 'blocked_open_form'
  | 'applying';

export interface VersionManifest {
  version: string;
  builtAt?: string;
}

export interface UpdateSafetyInput {
  activeOperationsCount: number;
  activeOperationLabel?: string | null;
  isRefreshing: boolean;
  hasOpenFormOrDialog: boolean;
}

export type UpdateSafetyResult =
  | { safe: true }
  | {
      safe: false;
      reason: 'active_operation' | 'refreshing_data' | 'open_form';
      message: string;
    };

export const RELOAD_LOOP_GUARD_KEY = 'autotec_sw_reload_guard';
export const RELOAD_LOOP_WINDOW_MS = 30_000;

export function getCurrentAppVersion(): string {
  try {
    if (typeof __APP_BUILD_VERSION__ === 'string' && __APP_BUILD_VERSION__.trim()) {
      return __APP_BUILD_VERSION__.trim();
    }
  } catch {
    // Fallback when executed outside Vite define transform (e.g. Node tsx unit tests)
  }
  return 'dev-local';
}

export function hasVersionChanged(
  currentVersion: string | null | undefined,
  remoteVersion: string | null | undefined
): boolean {
  const cur = (currentVersion || '').trim();
  const rem = (remoteVersion || '').trim();
  if (!cur || !rem) return false;
  return cur !== rem;
}

export function evaluateUpdateSafety(input: UpdateSafetyInput): UpdateSafetyResult {
  if (input.activeOperationsCount > 0) {
    const label = input.activeOperationLabel
      ? ` (${input.activeOperationLabel})`
      : '';
    return {
      safe: false,
      reason: 'active_operation',
      message: `Aguardando a conclusão da operação financeira no Firestore${label} antes de atualizar o aplicativo.`,
    };
  }

  if (input.isRefreshing) {
    return {
      safe: false,
      reason: 'refreshing_data',
      message: 'Aguardando a conclusão da atualização de dados em andamento antes de instalar a nova versão.',
    };
  }

  if (input.hasOpenFormOrDialog) {
    return {
      safe: false,
      reason: 'open_form',
      message:
        'Há um lançamento, recibo ou formulário aberto em tela. Conclua, salve ou feche a janela atual antes de clicar em "Atualizar agora" para não perder dados.',
    };
  }

  return { safe: true };
}

export function hasDomBlockingForm(doc?: Document | null): boolean {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!targetDoc) return false;

  const openOverlays = targetDoc.querySelectorAll(
    '.fixed.inset-0:not([data-app-updater-ui="true"]), [role="dialog"]:not([data-app-updater-ui="true"]), [aria-modal="true"]:not([data-app-updater-ui="true"])'
  );
  if (openOverlays.length > 0) {
    return true;
  }

  const dirtyForms = targetDoc.querySelectorAll('[data-dirty-form="true"]');
  return dirtyForms.length > 0;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function shouldPreventReloadLoop(
  targetVersion: string,
  storage?: StorageLike | null,
  nowMs: number = Date.now()
): boolean {
  const store = storage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!store || !targetVersion) return false;

  try {
    const raw = store.getItem(RELOAD_LOOP_GUARD_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { version?: string; timestamp?: number; count?: number };
    if (
      parsed.version === targetVersion &&
      typeof parsed.timestamp === 'number' &&
      nowMs - parsed.timestamp < RELOAD_LOOP_WINDOW_MS &&
      (parsed.count || 0) >= 1
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function recordReloadAttempt(
  targetVersion: string,
  storage?: StorageLike | null,
  nowMs: number = Date.now()
): void {
  const store = storage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!store || !targetVersion) return;

  try {
    store.setItem(
      RELOAD_LOOP_GUARD_KEY,
      JSON.stringify({
        version: targetVersion,
        timestamp: nowMs,
        count: 1,
      })
    );
  } catch {
    // Ignore storage errors
  }
}

export function clearReloadAttempt(storage?: StorageLike | null): void {
  const store = storage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!store) return;
  try {
    store.removeItem(RELOAD_LOOP_GUARD_KEY);
  } catch {
    // Ignore
  }
}

export async function purgeAppShellCaches(cacheStorage?: CacheStorage | null): Promise<number> {
  const cs = cacheStorage ?? (typeof caches !== 'undefined' ? caches : null);
  if (!cs) return 0;

  try {
    const keys = await cs.keys();
    const appKeys = keys.filter((key) => key.startsWith('autotec-finance-'));
    await Promise.all(appKeys.map((key) => cs.delete(key)));
    return appKeys.length;
  } catch {
    return 0;
  }
}

export async function fetchRemoteVersionManifest(
  fetcher: typeof fetch = fetch
): Promise<VersionManifest | null> {
  try {
    const res = await fetcher(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const data = (await res.json()) as Partial<VersionManifest>;
    if (typeof data?.version === 'string' && data.version.trim()) {
      return {
        version: data.version.trim(),
        builtAt: typeof data.builtAt === 'string' ? data.builtAt : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function activateWaitingServiceWorker(
  registration: ServiceWorkerRegistration | null,
  swContainer?: ServiceWorkerContainer | null,
  timeoutMs: number = 2000
): Promise<'controller_changed' | 'no_waiting' | 'timeout'> {
  const waiting = registration?.waiting;
  if (!waiting) {
    return 'no_waiting';
  }

  const container =
    swContainer ?? (typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null);

  if (!container) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return 'no_waiting';
  }

  return new Promise<'controller_changed' | 'timeout'>((resolve) => {
    let settled = false;
    const finish = (outcome: 'controller_changed' | 'timeout') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      container.removeEventListener('controllerchange', handleControllerChange);
      resolve(outcome);
    };

    const handleControllerChange = () => finish('controller_changed');
    container.addEventListener('controllerchange', handleControllerChange);

    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}
