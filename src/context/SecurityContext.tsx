import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth, OFFICIAL_ADMIN_EMAIL } from './AuthContext';
import {
  generateCryptographicSalt,
  derivePinHash,
  verifyPin,
  bytesToHex,
  hexToBytes,
  savePinToVault,
  getPinFromVault,
  clearPinFromVault,
  getLockoutState,
  recordFailedAttempt,
  resetLockoutState,
} from '../lib/pinSecurity';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, cleanFirestoreData } from '../lib/firebase';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos de inatividade real

interface SecurityContextType {
  isUnlocked: boolean;
  hasPinSetup: boolean | null; // null = checando, false = precisa cadastrar, true = cadastrado
  isCheckingPin: boolean;
  lockSystem: () => void;
  unlockWithPin: (pin: string) => Promise<{
    success: boolean;
    error?: string;
    lockoutSeconds?: number;
  }>;
  setupNewPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  logoutCompletely: () => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType>({
  isUnlocked: false,
  hasPinSetup: null,
  isCheckingPin: true,
  lockSystem: () => {},
  unlockWithPin: async () => ({ success: false }),
  setupNewPin: async () => ({ success: false }),
  changePin: async () => ({ success: false }),
  changePassword: async () => ({ success: false }),
  logoutCompletely: async () => {},
});

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, logout } = useAuth();

  // Helpers for tab session unlock persistence
  const isSessionUnlocked = useCallback((uid?: string): boolean => {
    try {
      const stored = (uid ? sessionStorage.getItem(`autotec_pin_session_unlocked_${uid}`) : null) ||
                     sessionStorage.getItem('autotec_pin_session_unlocked');
      const lastActivity = sessionStorage.getItem('autotec_last_activity_time');
      if (stored === 'true') {
        if (!lastActivity) {
          sessionStorage.setItem('autotec_last_activity_time', String(Date.now()));
          return true;
        }
        const lastTime = parseInt(lastActivity, 10);
        if (!isNaN(lastTime) && Date.now() - lastTime < INACTIVITY_TIMEOUT_MS) {
          sessionStorage.setItem('autotec_last_activity_time', String(Date.now()));
          return true;
        }
      }
    } catch {
      // Storage access error handling
    }
    return false;
  }, []);

  const markSessionUnlocked = useCallback((uid: string) => {
    try {
      sessionStorage.setItem(`autotec_pin_session_unlocked_${uid}`, 'true');
      sessionStorage.setItem('autotec_pin_session_unlocked', 'true');
      sessionStorage.setItem('autotec_last_activity_time', String(Date.now()));
    } catch {
      // Ignore
    }
  }, []);

  const clearSessionUnlocked = useCallback((uid?: string) => {
    try {
      if (uid) {
        sessionStorage.removeItem(`autotec_pin_session_unlocked_${uid}`);
      }
      sessionStorage.removeItem('autotec_pin_session_unlocked');
      sessionStorage.removeItem('autotec_last_activity_time');
    } catch {
      // Ignore
    }
  }, []);

  // Initialize isUnlocked synchronously from sessionStorage on reload (F5)
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      const stored = sessionStorage.getItem('autotec_pin_session_unlocked');
      const lastActivity = sessionStorage.getItem('autotec_last_activity_time');
      if (stored === 'true') {
        if (!lastActivity) return true;
        const lastTime = parseInt(lastActivity, 10);
        if (!isNaN(lastTime) && Date.now() - lastTime < INACTIVITY_TIMEOUT_MS) {
          return true;
        }
      }
    } catch {
      // Storage access error handling
    }
    return false;
  });

  const [hasPinSetup, setHasPinSetup] = useState<boolean | null>(() => {
    // If session was already unlocked, user definitely has PIN configured
    try {
      if (sessionStorage.getItem('autotec_pin_session_unlocked') === 'true') {
        return true;
      }
    } catch {}
    return null;
  });

  const [isCheckingPin, setIsCheckingPin] = useState<boolean>(() => {
    // If session is already unlocked, don't block UI with full page loader
    try {
      if (sessionStorage.getItem('autotec_pin_session_unlocked') === 'true') {
        return false;
      }
    } catch {}
    return true;
  });

  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<any>(null);
  const prevUidRef = useRef<string | null>(null);

  // 1. CARREGAR ESTADO DO PIN DO USUÁRIO CONECTADO
  useEffect(() => {
    let isMounted = true;

    async function checkPinStatus() {
      if (!user) {
        if (isMounted) {
          setIsUnlocked(false);
          setHasPinSetup(null);
          setIsCheckingPin(false);
          prevUidRef.current = null;
        }
        return;
      }

      // Se for o mesmo usuário e já estiver desbloqueado (ex: renovação de token, reconexão de rede)
      if (prevUidRef.current === user.uid && isUnlocked) {
        if (isMounted) {
          setIsCheckingPin(false);
          setHasPinSetup(true);
        }
        return;
      }

      prevUidRef.current = user.uid;

      // Se a sessão já estava marcada como desbloqueada no sessionStorage
      if (isSessionUnlocked(user.uid)) {
        if (isMounted) {
          setIsUnlocked(true);
          setHasPinSetup(true);
          setIsCheckingPin(false);
        }
      } else {
        if (isMounted) {
          setIsCheckingPin(true);
        }
      }

      try {
        // Primeiro: verificar vault local isolado (IndexedDB)
        const localVault = await getPinFromVault(user.uid);
        if (localVault && localVault.hashHex && localVault.saltHex) {
          if (isMounted) {
            setHasPinSetup(true);
            setIsCheckingPin(false);
            if (isSessionUnlocked(user.uid)) {
              setIsUnlocked(true);
            }
          }
          return;
        }

        // Segundo: verificar se há hash criptográfico sincronizado no Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.pinHashHex && data.pinSaltHex) {
            await savePinToVault(
              user.uid,
              data.pinSaltHex,
              data.pinHashHex,
              data.pinIterations || 100000
            );

            if (isMounted) {
              setHasPinSetup(true);
              setIsCheckingPin(false);
              if (isSessionUnlocked(user.uid)) {
                setIsUnlocked(true);
              }
            }
            return;
          }
        }

        // Nenhum PIN encontrado em lugar nenhum: precisa cadastrar
        if (isMounted) {
          setHasPinSetup(false);
          setIsCheckingPin(false);
        }
      } catch (err) {
        console.error('Erro ao verificar status do PIN:', err);
        if (isMounted) {
          setHasPinSetup(false);
          setIsCheckingPin(false);
        }
      }
    }

    checkPinStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.uid, isSessionUnlocked, isUnlocked]);

  // 2. FUNÇÃO DE BLOQUEIO MANUAL E AUTOMÁTICO
  const lockSystem = useCallback(() => {
    if (user?.uid) {
      clearSessionUnlocked(user.uid);
    }
    setIsUnlocked(false);
  }, [user?.uid]);

  // 3. MONITORAMENTO DE INATIVIDADE (5 MINUTOS) & VISIBILIDADE DE ABA
  useEffect(() => {
    if (!user || !isUnlocked) {
      return;
    }

    lastActivityRef.current = Date.now();
    try {
      sessionStorage.setItem('autotec_last_activity_time', String(Date.now()));
    } catch {}

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      try {
        sessionStorage.setItem('autotec_last_activity_time', String(Date.now()));
      } catch {}
    };

    // Eventos de interação real do usuário
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((ev) => window.addEventListener(ev, updateActivity, { passive: true }));

    // Verificação periódica a cada 5 segundos
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        lockSystem();
      }
    }, 5000);

    // Verificação de visibilidade (quando o usuário volta à aba do navegador ou abre o app)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const storedLastActivity = sessionStorage.getItem('autotec_last_activity_time');
        const lastTime = storedLastActivity ? parseInt(storedLastActivity, 10) : lastActivityRef.current;
        const elapsed = Date.now() - lastTime;
        if (elapsed >= INACTIVITY_TIMEOUT_MS) {
          lockSystem();
        } else {
          lastActivityRef.current = Date.now();
          try {
            sessionStorage.setItem('autotec_last_activity_time', String(Date.now()));
          } catch {}
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, updateActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, isUnlocked, lockSystem]);

  // 4. DESBLOQUEIO COM PIN DE 6 DÍGITOS
  const unlockWithPin = async (
    pin: string
  ): Promise<{ success: boolean; error?: string; lockoutSeconds?: number }> => {
    if (!user) {
      return { success: false, error: 'Usuário não autenticado.' };
    }

    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return { success: false, error: 'O PIN deve conter exatamente 6 dígitos numéricos.' };
    }

    // Verificar se está em período de bloqueio temporário (lockout)
    const lockout = await getLockoutState(user.uid);
    if (lockout && lockout.lockoutUntil > Date.now()) {
      const remainingSec = Math.ceil((lockout.lockoutUntil - Date.now()) / 1000);
      return {
        success: false,
        error: `Muitas tentativas incorretas. Aguarde ${remainingSec}s antes de tentar novamente.`,
        lockoutSeconds: remainingSec,
      };
    }

    try {
      // Obter salt e hash do IndexedDB
      let vault = await getPinFromVault(user.uid);

      if (!vault) {
        // Tentativa de obter do Firestore se não tiver no IndexedDB
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          if (d.pinHashHex && d.pinSaltHex) {
            vault = {
              uid: user.uid,
              saltHex: d.pinSaltHex,
              hashHex: d.pinHashHex,
              iterations: d.pinIterations || 100000,
              updatedAt: d.pinUpdatedAt || '',
            };
            await savePinToVault(user.uid, d.pinSaltHex, d.pinHashHex, vault.iterations);
          }
        }
      }

      if (!vault) {
        return { success: false, error: 'Nenhum PIN configurado. É necessário cadastrar um PIN.' };
      }

      const salt = hexToBytes(vault.saltHex);
      const expectedHash = hexToBytes(vault.hashHex);

      const isValid = await verifyPin(pin, salt, expectedHash, vault.iterations);

      if (isValid) {
        // Resetar contador de erros
        await resetLockoutState(user.uid);
        markSessionUnlocked(user.uid);
        setIsUnlocked(true);
        lastActivityRef.current = Date.now();
        return { success: true };
      } else {
        // Registrar tentativa com falha
        const { failedAttempts, lockoutSeconds } = await recordFailedAttempt(user.uid);

        if (lockoutSeconds > 0) {
          return {
            success: false,
            error: `PIN incorreto. Limite atingido! Aguarde ${lockoutSeconds}s.`,
            lockoutSeconds,
          };
        }

        return {
          success: false,
          error: `PIN incorreto. (${failedAttempts}ª tentativa).`,
        };
      }
    } catch (err: any) {
      console.error('Erro na validação do PIN:', err);
      return { success: false, error: 'Erro ao validar o PIN no dispositivo.' };
    }
  };

  // 5. CADASTRO INICIAL DO PIN DE 6 DÍGITOS
  const setupNewPin = async (
    pin: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'Usuário não autenticado.' };
    }

    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return { success: false, error: 'O PIN deve conter exatamente 6 dígitos numéricos.' };
    }

    try {
      const salt = generateCryptographicSalt();
      const hash = await derivePinHash(pin, salt, 100000);

      const saltHex = bytesToHex(salt);
      const hashHex = bytesToHex(hash);

      // Salvar no IndexedDB isolado do dispositivo
      await savePinToVault(user.uid, saltHex, hashHex, 100000);

      // Salvar hash e salt derivados no documento do usuário no Firestore (NUNCA O PIN EM TEXTO PLANO)
      try {
        await updateDoc(doc(db, 'users', user.uid), cleanFirestoreData({
          pinSaltHex: saltHex,
          pinHashHex: hashHex,
          pinIterations: 100000,
          hasPinConfigured: true,
          pinUpdatedAt: new Date().toISOString(),
        }));
      } catch (firestoreErr) {
        console.warn('Aviso ao sincronizar hash do PIN com Firestore:', firestoreErr);
      }

      await resetLockoutState(user.uid);
      markSessionUnlocked(user.uid);
      setHasPinSetup(true);
      setIsUnlocked(true);
      lastActivityRef.current = Date.now();

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao configurar PIN:', err);
      return { success: false, error: 'Falha ao salvar PIN de segurança.' };
    }
  };

  // 6. ALTERAÇÃO DE PIN (Requer o PIN Atual)
  const changePin = async (
    currentPin: string,
    newPin: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado.' };

    if (!newPin || newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
      return { success: false, error: 'O novo PIN deve conter exatamente 6 dígitos numéricos.' };
    }

    if (currentPin === newPin) {
      return { success: false, error: 'O novo PIN deve ser diferente do PIN atual.' };
    }

    // Validar PIN atual
    const unlockCheck = await unlockWithPin(currentPin);
    if (!unlockCheck.success) {
      return { success: false, error: 'PIN atual incorreto. Não foi possível alterar o PIN.' };
    }

    // Configurar o novo PIN
    const setupResult = await setupNewPin(newPin);
    return setupResult;
  };

  // 7. ALTERAÇÃO DE SENHA DO FIREBASE
  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!auth.currentUser || !auth.currentUser.email) {
      return { success: false, error: 'Sessão do usuário inválida.' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    try {
      // Reautenticação segura exigida pelo Firebase para alteração de credenciais sensíveis
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Atualizar a senha
      await updatePassword(auth.currentUser, newPassword);

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao alterar senha:', err);
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        return { success: false, error: 'A senha atual informada está incorreta.' };
      }
      if (code === 'auth/weak-password') {
        return { success: false, error: 'A nova senha é muito fraca. Utilize letras, números e símbolos.' };
      }
      return { success: false, error: 'Não foi possível atualizar a senha. Tente novamente mais tarde.' };
    }
  };

  // 8. ENCERRAR SESSÃO COMPLETAMENTE
  const logoutCompletely = async () => {
    if (user?.uid) {
      clearSessionUnlocked(user.uid);
    }
    setIsUnlocked(false);
    await logout();
  };

  return (
    <SecurityContext.Provider
      value={{
        isUnlocked,
        hasPinSetup,
        isCheckingPin,
        lockSystem,
        unlockWithPin,
        setupNewPin,
        changePin,
        changePassword,
        logoutCompletely,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = () => useContext(SecurityContext);
