/**
 * AUTOTEC Rastreamento Veicular
 * Módulo Criptográfico de Segurança para PIN de 6 Dígitos
 *
 * Utiliza a Web Crypto API (SubtleCrypto) nativa:
 * - Algoritmo de derivação de chaves PBKDF2 com HMAC-SHA256
 * - 100.000 iterações (conforme recomendações NIST / OWASP)
 * - Salt criptograficamente aleatório de 16 bytes (128 bits) gerado por crypto.getRandomValues
 * - Armazenamento estruturado no IndexedDB (isolado e persistente, sem uso de localStorage)
 * - NUNCA armazena PIN em texto plano
 */

const DB_NAME = 'autotec_secure_vault_db';
const DB_VERSION = 1;
const STORE_NAME = 'pin_vault';
const LOCKOUT_STORE = 'lockout_state';
const PBKDF2_ITERATIONS = 100000;

export interface PinVaultRecord {
  uid: string;
  saltHex: string;
  hashHex: string;
  iterations: number;
  updatedAt: string;
}

export interface LockoutRecord {
  uid: string;
  failedAttempts: number;
  lockoutUntil: number; // timestamp ms
  lastAttemptAt: number;
}

// ==========================================
// UTILITÁRIOS CRIPTOGRÁFICOS (Web Crypto API)
// ==========================================

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Gera um salt criptograficamente seguro de 16 bytes (128 bits)
 */
export function generateCryptographicSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  window.crypto.getRandomValues(salt);
  return salt;
}

/**
 * Deriva um hash criptográfico seguro a partir do PIN usando PBKDF2-HMAC-SHA256
 */
export async function derivePinHash(
  pin: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const pinBytes = enc.encode(pin);

  // Importar PIN como chave de derivação inicial
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    pinBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derivar 256 bits (32 bytes) com HMAC-SHA256 e 100.000 iterações
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  return new Uint8Array(derivedBits);
}

/**
 * Comparação em tempo constante para mitigar timing attacks
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Valida o PIN candidato contra o hash e salt armazenados
 */
export async function verifyPin(
  pin: string,
  salt: Uint8Array,
  expectedHash: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<boolean> {
  if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    return false;
  }
  try {
    const candidateHash = await derivePinHash(pin, salt, iterations);
    return constantTimeEqual(candidateHash, expectedHash);
  } catch (error) {
    console.error('Erro na verificação criptográfica do PIN:', error);
    return false;
  }
}

// ==========================================
// ARMAZENAMENTO SEGURO ISOLADO (IndexedDB)
// ==========================================

function openVaultDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB não suportado neste navegador.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(LOCKOUT_STORE)) {
        db.createObjectStore(LOCKOUT_STORE, { keyPath: 'uid' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva o hash e salt derivados no IndexedDB do dispositivo
 */
export async function savePinToVault(
  uid: string,
  saltHex: string,
  hashHex: string,
  iterations = PBKDF2_ITERATIONS
): Promise<void> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: PinVaultRecord = {
      uid,
      saltHex,
      hashHex,
      iterations,
      updatedAt: new Date().toISOString(),
    };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Recupera os parâmetros criptográficos do PIN no IndexedDB
 */
export async function getPinFromVault(uid: string): Promise<PinVaultRecord | null> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(uid);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove o registro de PIN do dispositivo
 */
export async function clearPinFromVault(uid: string): Promise<void> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(uid);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ==========================================
// CONTROLE DE TENTATIVAS INCORRETAS (Lockout)
// ==========================================

export async function getLockoutState(uid: string): Promise<LockoutRecord | null> {
  try {
    const db = await openVaultDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCKOUT_STORE, 'readonly');
      const store = tx.objectStore(LOCKOUT_STORE);
      const req = store.get(uid);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function recordFailedAttempt(uid: string): Promise<{
  failedAttempts: number;
  lockoutSeconds: number;
}> {
  const db = await openVaultDatabase();
  const current = (await getLockoutState(uid)) || {
    uid,
    failedAttempts: 0,
    lockoutUntil: 0,
    lastAttemptAt: Date.now(),
  };

  const newAttempts = current.failedAttempts + 1;
  let lockoutSeconds = 0;

  // Política de atraso progressivo e bloqueio temporário
  if (newAttempts === 3) {
    lockoutSeconds = 15; // 15 segundos após 3 erros
  } else if (newAttempts === 4) {
    lockoutSeconds = 30; // 30 segundos após 4 erros
  } else if (newAttempts >= 5) {
    lockoutSeconds = 120; // 2 minutos após 5 erros
  }

  const lockoutUntil = lockoutSeconds > 0 ? Date.now() + lockoutSeconds * 1000 : 0;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOCKOUT_STORE, 'readwrite');
    const store = tx.objectStore(LOCKOUT_STORE);
    const req = store.put({
      uid,
      failedAttempts: newAttempts,
      lockoutUntil,
      lastAttemptAt: Date.now(),
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return { failedAttempts: newAttempts, lockoutSeconds };
}

export async function resetLockoutState(uid: string): Promise<void> {
  try {
    const db = await openVaultDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LOCKOUT_STORE, 'readwrite');
      const store = tx.objectStore(LOCKOUT_STORE);
      const req = store.delete(uid);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Erro ao resetar estado de lockout:', err);
  }
}
