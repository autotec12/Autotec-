import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useData } from './DataContext';
import {
  activateWaitingServiceWorker,
  clearReloadAttempt,
  evaluateUpdateSafety,
  fetchRemoteVersionManifest,
  getCurrentAppVersion,
  hasDomBlockingForm,
  hasVersionChanged,
  purgeAppShellCaches,
  recordReloadAttempt,
  shouldPreventReloadLoop,
  type UpdateStatus,
} from '../lib/appUpdater';

interface AppUpdateContextType {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  isDeferred: boolean;
  status: UpdateStatus;
  statusMessage: string | null;
  isChecking: boolean;
  lastCheckedAt: string | null;
  hasWaitingWorker: boolean;
  checkForUpdates: () => Promise<{ found: boolean; remoteVersion?: string }>;
  postponeUpdate: () => void;
  reopenUpdatePrompt: () => void;
  applyUpdate: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateContextType>({
  currentVersion: 'dev-local',
  latestVersion: null,
  updateAvailable: false,
  isDeferred: false,
  status: 'idle',
  statusMessage: null,
  isChecking: false,
  lastCheckedAt: null,
  hasWaitingWorker: false,
  checkForUpdates: async () => ({ found: false }),
  postponeUpdate: () => {},
  reopenUpdatePrompt: () => {},
  applyUpdate: async () => {},
});

const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export const AppUpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeOperationsCount, activeOperationLabel, isRefreshing } = useData();

  const currentVersion = getCurrentAppVersion();
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isDeferred, setIsDeferred] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [hasWaitingWorker, setHasWaitingWorker] = useState(false);

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const applyingRef = useRef(false);
  const isDeferredRef = useRef(isDeferred);
  const latestVersionRef = useRef(latestVersion);
  const updateAvailableRef = useRef(updateAvailable);
  const activeOpsRef = useRef(activeOperationsCount);
  const activeOpLabelRef = useRef(activeOperationLabel);
  const isRefreshingRef = useRef(isRefreshing);

  useEffect(() => {
    isDeferredRef.current = isDeferred;
  }, [isDeferred]);

  useEffect(() => {
    latestVersionRef.current = latestVersion;
  }, [latestVersion]);

  useEffect(() => {
    updateAvailableRef.current = updateAvailable;
  }, [updateAvailable]);

  useEffect(() => {
    activeOpsRef.current = activeOperationsCount;
    activeOpLabelRef.current = activeOperationLabel;
    isRefreshingRef.current = isRefreshing;
  }, [activeOperationsCount, activeOperationLabel, isRefreshing]);

  const markUpdateDetected = useCallback((remoteVer?: string | null, waitingSw?: boolean) => {
    const resolvedVersion = remoteVer?.trim() || latestVersionRef.current || null;
    if (resolvedVersion) {
      setLatestVersion(resolvedVersion);
    }
    if (waitingSw) {
      setHasWaitingWorker(true);
    }

    const wasAlreadyKnown = updateAvailableRef.current;
    setUpdateAvailable(true);

    // If a newer version than the previously deferred one arrives, re-prompt once cleanly
    const isNewerThanDeferred =
      Boolean(resolvedVersion && latestVersionRef.current && resolvedVersion !== latestVersionRef.current);

    if (!wasAlreadyKnown || isNewerThanDeferred) {
      setIsDeferred(false);
      setStatus((prev) => (prev === 'applying' ? prev : 'available'));
      setStatusMessage(null);
    } else if (!isDeferredRef.current) {
      setStatus((prev) => (prev === 'idle' || prev === 'deferred' ? 'available' : prev));
    }
  }, []);

  const checkForUpdates = useCallback(async (): Promise<{ found: boolean; remoteVersion?: string }> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { found: updateAvailableRef.current };
    }

    setIsChecking(true);
    try {
      let swWaitingFound = false;
      const reg = registrationRef.current;
      if (reg) {
        try {
          await reg.update();
          if (reg.waiting) {
            swWaitingFound = true;
          }
        } catch {
          // Ignore transient SW check errors (offline / dev)
        }
      }

      const manifest = await fetchRemoteVersionManifest();
      setLastCheckedAt(new Date().toISOString());

      const manifestChanged = manifest ? hasVersionChanged(currentVersion, manifest.version) : false;

      if (manifestChanged || swWaitingFound) {
        const targetVer = manifest?.version || 'nova-versao';
        if (!shouldPreventReloadLoop(targetVer)) {
          markUpdateDetected(manifest?.version || null, swWaitingFound);
          return { found: true, remoteVersion: manifest?.version };
        }
      }

      return { found: updateAvailableRef.current, remoteVersion: manifest?.version };
    } finally {
      setIsChecking(false);
    }
  }, [currentVersion, markUpdateDetected]);

  // Register a single controlled Service Worker in production & watch lifecycle events
  useEffect(() => {
    clearReloadAttempt();

    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // In Vite development/Preview, Vite serves raw TSX modules; register SW cleanly in production builds
    if (!import.meta.env.PROD) {
      return;
    }

    let isMounted = true;
    let detachListeners: (() => void) | null = null;

    const setupServiceWorker = async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration('/');
        const reg =
          existing ||
          (await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          }));

        if (!isMounted) return;
        registrationRef.current = reg;

        if (reg.waiting && navigator.serviceWorker.controller) {
          markUpdateDetected(null, true);
        }

        const handleInstalling = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (!isMounted) return;
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              markUpdateDetected(null, true);
            }
          });
        };

        if (reg.installing) {
          handleInstalling(reg.installing);
        }

        const onUpdateFound = () => {
          handleInstalling(reg.installing);
        };

        reg.addEventListener('updatefound', onUpdateFound);
        detachListeners = () => {
          reg.removeEventListener('updatefound', onUpdateFound);
        };
      } catch (err) {
        console.warn('PWA Service Worker setup notice:', err);
      }
    };

    void setupServiceWorker();

    return () => {
      isMounted = false;
      if (detachListeners) detachListeners();
    };
  }, [markUpdateDetected]);

  // Independent version polling: startup, foreground return, online reconnect, and periodic interval
  // Intentionally NEVER coupled with Pull-to-Refresh!
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const startupTimer = setTimeout(() => {
      void checkForUpdates();
    }, 3500);

    const intervalId = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) {
        void checkForUpdates();
      }
    }, VERSION_CHECK_INTERVAL_MS);

    const handleVisibility = () => {
      if (!document.hidden) {
        void checkForUpdates();
      }
    };

    const handleOnline = () => {
      void checkForUpdates();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(startupTimer);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [checkForUpdates]);

  const executeControlledReload = useCallback(async () => {
    if (applyingRef.current) return;
    const targetVersion = latestVersionRef.current || 'sw-waiting';

    if (shouldPreventReloadLoop(targetVersion)) {
      setStatus('available');
      setStatusMessage(
        'Uma atualização foi aplicada recentemente. Se o aviso persistir, recarregue manualmente em alguns segundos.'
      );
      return;
    }

    applyingRef.current = true;
    setStatus('applying');
    setStatusMessage('Preparando instalação da nova versão...');

    try {
      recordReloadAttempt(targetVersion);
      await purgeAppShellCaches();
      await activateWaitingServiceWorker(registrationRef.current);
      window.location.reload();
    } catch {
      applyingRef.current = false;
      setStatus('available');
      setStatusMessage('Não foi possível concluir a troca de versão. Tente novamente.');
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    if (applyingRef.current) return;

    const safety = evaluateUpdateSafety({
      activeOperationsCount: activeOpsRef.current,
      activeOperationLabel: activeOpLabelRef.current,
      isRefreshing: isRefreshingRef.current,
      hasOpenFormOrDialog: hasDomBlockingForm(),
    });

    if (!safety.safe) {
      if (safety.reason === 'open_form') {
        setStatus('blocked_open_form');
        setStatusMessage(safety.message);
        return;
      }

      setStatus('waiting_operations');
      setStatusMessage(safety.message);
      return;
    }

    await executeControlledReload();
  }, [executeControlledReload]);

  // If the admin clicked "Atualizar agora" while a Firestore write was finishing,
  // complete the update automatically as soon as the write finishes (and no form is open).
  useEffect(() => {
    if (status !== 'waiting_operations') return;

    if (activeOperationsCount === 0 && !isRefreshing) {
      if (hasDomBlockingForm()) {
        setStatus('blocked_open_form');
        setStatusMessage(
          'Operação salva! Feche o formulário ou recibo aberto em tela e clique em "Atualizar agora".'
        );
        return;
      }
      void executeControlledReload();
    }
  }, [status, activeOperationsCount, isRefreshing, executeControlledReload]);

  const postponeUpdate = useCallback(() => {
    if (applyingRef.current) return;
    setIsDeferred(true);
    setStatus('deferred');
    setStatusMessage(null);
  }, []);

  const reopenUpdatePrompt = useCallback(() => {
    if (!updateAvailableRef.current) return;
    setIsDeferred(false);
    setStatus('available');
    setStatusMessage(null);
  }, []);

  return (
    <AppUpdateContext.Provider
      value={{
        currentVersion,
        latestVersion,
        updateAvailable,
        isDeferred,
        status,
        statusMessage,
        isChecking,
        lastCheckedAt,
        hasWaitingWorker,
        checkForUpdates,
        postponeUpdate,
        reopenUpdatePrompt,
        applyUpdate,
      }}
    >
      {children}
    </AppUpdateContext.Provider>
  );
};

export const useAppUpdate = () => useContext(AppUpdateContext);
