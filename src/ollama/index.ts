/**
 * OllamaClient — modelo local (patrón shelf)
 *
 * TikBoost usa un modelo LLM local vía Ollama (localhost:11434),
 * proxeado por Vite en `/ollama-api` para evitar CORS.
 * Sin backend cloud, sin API keys, 100% local.
 */

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  format?: "json" | string;
}

export interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

const DEFAULT_MODEL = "llama3.2";
const DEFAULT_BASE_URL = "/ollama-api"; // vite proxy → http://localhost:11434

/**
 * Endpoint configurable (fix P1 kimi review #5)
 * - Default: /ollama-api (proxy Vite → localhost:11434)
 * - El usuario puede configurar otra URL (ej. IP de otra máquina en LAN)
 */
export function getBaseUrl(): string {
  return localStorage.getItem("tiktboost-ollama-url") ?? DEFAULT_BASE_URL;
}

export function setBaseUrl(url: string): void {
  if (!url || url.trim() === "") {
    localStorage.removeItem("tiktboost-ollama-url");
  } else {
    localStorage.setItem("tiktboost-ollama-url", url.trim().replace(/\/+$/, ""));
  }
}

/**
 * Nombre del modelo por defecto configurable en settings
 */
export function getDefaultModel(): string {
  return localStorage.getItem("tiktboost-ollama-model") ?? DEFAULT_MODEL;
}

export function setDefaultModel(model: string): void {
  localStorage.setItem("tiktboost-ollama-model", model);
}

/**
 * Verifica que Ollama esté corriendo y devuelve el modelo activo
 */
export async function checkOllamaHealth(): Promise<{
  available: boolean;
  models: string[];
  activeModel?: string;
  baseUrl: string;
}> {
  const baseUrl = getBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { available: false, models: [], baseUrl };
    const data = await res.json();
    const models: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
    return { available: true, models, baseUrl };
  } catch {
    return { available: false, models: [], baseUrl };
  }
}

/**
 * Chat simple contra el modelo local
 */
export async function chat(
  messages: OllamaMessage[],
  options: OllamaChatOptions = {},
): Promise<string> {
  const model = options.model ?? getDefaultModel();
  const baseUrl = getBaseUrl();

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 512,
      },
      ...(options.format ? { format: options.format } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Ollama error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as OllamaChatResponse;
  return data.message?.content ?? "";
}

/**
 * Helper: chat con un solo prompt de usuario
 */
export async function prompt(prompt: string, options: OllamaChatOptions = {}): Promise<string> {
  return chat([{ role: "user", content: prompt }], options);
}

/**
 * Completa JSON de forma estructurada (formato JSON de Ollama)
 */
export async function chatJSON<T>(
  messages: OllamaMessage[],
  options: OllamaChatOptions = {},
): Promise<T> {
  const content = await chat(messages, { ...options, format: "json" });
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`Ollama devolvió JSON inválido: ${content.slice(0, 200)}`);
  }
}
