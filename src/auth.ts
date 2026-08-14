/**
 * Auth local — sin Firebase (sistema libre de SWAL)
 *
 * Identidad local por dispositivo: genera un UUID persistente y permite
 * un PIN/passphrase opcional. Todo vive en IndexedDB/localStorage.
 *
 * Seguridad: PBKDF2 (WebCrypto, ≥100k iteraciones, salt por usuario) —
 * ver hallazgo P0 de kimi review 2026-08-14.
 */

import { localStore } from "./store/index.js";

export interface LocalUser {
  uid: string;
  email?: string;
  displayName?: string;
  createdAt: number;
  isLocal: true;
}

export interface PasswordRecord {
  /** Salt único por usuario (base64url) */
  salt: string;
  /** Hash PBKDF2 (base64url) */
  hash: string;
  /** Iteraciones PBKDF2 */
  iterations: number;
  /** Algoritmo usado (para migraciones futuras) */
  algo: "PBKDF2-SHA256";
  /** Versión del formato (migraciones) */
  version: 1;
}

const USER_KEY = "local-user";
const SESSION_KEY = "local-session";
const PBKDF2_ITERATIONS = 150_000;

/**
 * Genera un UUID v4
 */
function generateUid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Genera salt aleatorio criptográfico (16 bytes → base64url)
 */
function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Derivación PBKDF2-SHA256 vía WebCrypto
 *
 * @param password - contraseña en claro
 * @param salt - salt base64url
 * @param iterations - iteraciones (≥100k recomendado)
 */
async function deriveKey(password: string, salt: string, iterations: number): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);

  const saltBytes = Uint8Array.from(atob(salt.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations,
    },
    keyMaterial,
    256, // 32 bytes de salida
  );

  return btoa(String.fromCharCode(...new Uint8Array(bits)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Crea el registro de password PBKDF2 (con salt nuevo)
 */
async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = generateSalt();
  const hash = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return {
    salt,
    hash,
    iterations: PBKDF2_ITERATIONS,
    algo: "PBKDF2-SHA256",
    version: 1,
  };
}

/**
 * Verifica una contraseña contra un registro PBKDF2
 */
async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  if (record.algo !== "PBKDF2-SHA256") {
    console.warn(`[auth] Algoritmo de password no soportado: ${record.algo}`);
    return false;
  }
  const derived = await deriveKey(password, record.salt, record.iterations);
  return derived === record.hash;
}

/**
 * Registro local (crea usuario del dispositivo)
 */
export async function signUp(email: string, password: string): Promise<{ user: LocalUser }> {
  const existing = await localStore.get<LocalUser>(USER_KEY, "me");
  if (existing) {
    throw new Error("El dispositivo ya tiene una cuenta local. Usa iniciar sesión.");
  }

  const user: LocalUser = {
    uid: generateUid(),
    email,
    displayName: email.split("@")[0],
    createdAt: Date.now(),
    isLocal: true,
  };

  await localStore.set(USER_KEY, "me", user);
  const record = await hashPassword(password);
  await localStore.set(USER_KEY, "password", record);
  localStorage.setItem(SESSION_KEY, user.uid);

  return { user };
}

/**
 * Inicio de sesión local (verificación PBKDF2)
 */
export async function signIn(email: string, password: string): Promise<{ user: LocalUser }> {
  const user = await localStore.get<LocalUser>(USER_KEY, "me");
  if (!user) {
    throw new Error("No existe cuenta local. Regístrate primero.");
  }
  if (user.email && user.email !== email) {
    throw new Error("Email no coincide con la cuenta local");
  }

  const record = await localStore.get<PasswordRecord>(USER_KEY, "password");
  if (!record) {
    throw new Error("No hay contraseña configurada en este dispositivo");
  }

  const ok = await verifyPassword(password, record);
  if (!ok) {
    throw new Error("Contraseña incorrecta");
  }

  localStorage.setItem(SESSION_KEY, user.uid);
  return { user };
}

/**
 * Cierre de sesión local
 */
export async function signOut(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Suscripción a cambios de auth (compat con firebase onAuthStateChange)
 */
export function onAuthStateChange(callback: (user: LocalUser | null) => void): () => void {
  const notify = async () => {
    const user = await getCurrentUser();
    callback(user);
  };
  notify();
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
}

/**
 * Usuario actual (síncrono desde sessionStorage + IndexedDB cache)
 */
export async function getCurrentUser(): Promise<LocalUser | null> {
  const uid = localStorage.getItem(SESSION_KEY);
  if (!uid) return null;
  const user = await localStore.get<LocalUser>(USER_KEY, "me");
  return user?.uid === uid ? user : null;
}

/**
 * ¿Autenticado?
 */
export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}

/**
 * Export interno para tests
 */
export { deriveKey as __deriveKeyForTests };
