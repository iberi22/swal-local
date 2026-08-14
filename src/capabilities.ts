/**
 * Detección de capacidades locales (Fase B1 — backend/agentic/IA local)
 *
 * Detecta qué puede correr en el dispositivo del usuario:
 * - WebGPU (navigator.gpu) → modelos locales en GPU (WebLLM, SD-WebGPU)
 * - Ollama (localhost) → modelos CPU
 * - Modo SOCIO SWAL → edge functions (backend de suscripción)
 *
 * Reutilizable en cualquier app SWAL (TS puro, sin dependencias).
 */

export interface DeviceCapabilities {
  webgpu: boolean;
  webgpuAdapter?: string;
  webllm: boolean;
  ollama: boolean;
  ollamaModels: string[];
  workerSupport: boolean;
  wasm: boolean;
  speechSynthesis: boolean;
  speechRecognition: boolean;
  indexedDB: boolean;
  memory: {
    deviceMemory?: number;
    hardwareConcurrency: number;
  };
}

/**
 * Detecta WebGPU y devuelve el adapter (si está disponible)
 */
export async function detectWebGPU(): Promise<{ available: boolean; adapter?: string }> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) return { available: false };
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { available: false };
    const info = adapter as unknown as { info?: { description?: string; device?: string } };
    const label =
      info.info?.description || info.info?.device || JSON.stringify(info.info ?? "").slice(0, 80);
    return { available: true, adapter: label };
  } catch {
    return { available: false };
  }
}

/**
 * Verifica Ollama (health + modelos disponibles)
 */
export async function detectOllama(baseUrl = "/ollama-api"): Promise<{
  available: boolean;
  models: string[];
}> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { available: false, models: [] };
    const data = await res.json();
    const models: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

/**
 * Detección completa de capacidades del dispositivo
 */
export async function detectCapabilities(
  ollamaBaseUrl = "/ollama-api",
): Promise<DeviceCapabilities> {
  const [gpu, ollama] = await Promise.all([
    detectWebGPU(),
    detectOllama(ollamaBaseUrl),
  ]);

  const nav = navigator as Navigator & {
    deviceMemory?: number;
  };

  return {
    webgpu: gpu.available,
    webgpuAdapter: gpu.adapter,
    webllm: gpu.available, // WebLLM requiere WebGPU
    ollama: ollama.available,
    ollamaModels: ollama.models,
    workerSupport: typeof Worker !== "undefined",
    wasm: typeof WebAssembly !== "undefined",
    speechSynthesis: typeof speechSynthesis !== "undefined",
    speechRecognition:
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    indexedDB: typeof indexedDB !== "undefined",
    memory: {
      deviceMemory: nav.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
    },
  };
}

/**
 * Resumen legible para UI: qué modo de IA usar
 */
export function recommendAiMode(caps: DeviceCapabilities): {
  mode: "webgpu" | "ollama" | "cloud-socio" | "none";
  label: string;
  reason: string;
} {
  if (caps.webgpu) {
    return {
      mode: "webgpu",
      label: "WebGPU — IA local en GPU",
      reason: "navigator.gpu disponible → modelos locales (WebLLM, generación de animaciones)",
    };
  }
  if (caps.ollama) {
    return {
      mode: "ollama",
      label: "Ollama — IA local en CPU",
      reason: `Ollama detectado con ${caps.ollamaModels.length} modelo(s): ${caps.ollamaModels.join(", ") || "ninguno"}`,
    };
  }
  return {
    mode: "cloud-socio",
    label: "SOCIO SWAL — IA en edge functions",
    reason: "Sin GPU ni Ollama local → usar backend de suscripción SOCIO SWAL",
  };
}
