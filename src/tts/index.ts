/**
 * Local Text-to-Speech (Web Speech API) — 100% sin backend
 *
 * TikBoost local-first: reemplaza Google Cloud TTS por la Web Speech API
 * del navegador (speechSynthesis). Sin credenciales, sin red, sin costo.
 *
 * Mantiene la misma API pública que el Google TTS original para no romper
 * consumidores (queue-manager, comment-handler, paneles de configuración).
 */

// Tipos para la configuración de voz (compat con API original)
export type VoiceGender = "MALE" | "FEMALE" | "NEUTRAL";
export type VoiceType = "Wavenet" | "Neural2" | "Chirp3" | "Standard";

export interface TTSVoiceConfig {
  language: string; // BCP-47 code (e.g., "es-CO", "es-ES", "en-US")
  gender: VoiceGender;
  voiceType: VoiceType;
  voiceName?: string; // Nombre de voz específico
  speed: number; // 0-100, default 50 (100% = normal)
  pitch: number; // 0-100, default 50 (0 semitones change)
  volume: number; // 0-100, default 50 (0 dB gain)
}

export interface TTSOptions {
  voice: TTSVoiceConfig;
  audioEncoding?: "MP3" | "LINEAR16" | "OGG_OPUS";
  sampleRateHertz?: number;
}

/**
 * Resultado de textToSpeech local: envoltura tipo-Buffer para compat.
 * El audio real se reproduce vía speechSynthesis (ver speak()).
 */
export interface LocalAudioResult {
  length: number;
  text: string;
  format: string;
}

/**
 * Busca la voz local más cercana a la configuración pedida
 */
function resolveLocalVoice(config: TTSVoiceConfig): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices();

  // 1. Voz explícita
  if (config.voiceName) {
    const exact = voices.find(
      (v) => v.name.toLowerCase() === (config.voiceName as string).toLowerCase(),
    );
    if (exact) return exact;
  }

  // 2. Preferir lenguaje exacto (p.ej. es-CO)
  const langPrefix = config.language.toLowerCase();
  const langMatch = voices.find((v) => v.lang.toLowerCase() === langPrefix);
  if (langMatch) return langMatch;

  // 3. Prefijo de idioma (p.ej. es-*)
  const family = langPrefix.split("-")[0];
  const familyMatch = voices.find((v) => v.lang.toLowerCase().startsWith(family));
  if (familyMatch) return familyMatch;

  // 4. Cualquier voz
  return voices[0] ?? null;
}

/**
 * Espera a que las voces estén cargadas (fix P1 kimi review #3)
 * Algunos navegadores cargan getVoices() async y disparan voiceschanged.
 */
function waitForVoices(timeoutMs = 2000): Promise<void> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve();
  if (speechSynthesis.getVoices().length > 0) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      speechSynthesis.onvoiceschanged = null;
      resolve();
    }, timeoutMs);
    speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timer);
      speechSynthesis.onvoiceschanged = null;
      resolve();
    };
  });
}

let utteranceCounter = 0;

/**
 * Sintetiza y reproduce texto localmente. Devuelve un resultado compatible
 * con la API anterior (objeto con .length) para no romper la cadena TTS.
 *
 * Fixes kimi review #3:
 * - Espera voiceschanged antes del primer speak
 * - Heartbeat pause/resume para textos >15s (Chrome corta utterances largos)
 * - Promesa resuelve en onend (no solo al llamar speak)
 * - onerror (interrupted/canceled) avanza la cola sin fallar
 */
export async function textToSpeech(text: string, options: TTSOptions): Promise<LocalAudioResult> {
  await waitForVoices();

  const voice = resolveLocalVoice(options.voice);

  // Configurar utterance con parámetros de voz (0-100 → rango útil)
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = options.voice.language;
  utterance.rate = 0.5 + (options.voice.speed / 100) * 1.0; // 0.5x - 1.5x
  utterance.pitch = 0.5 + (options.voice.pitch / 100) * 1.0; // 0.5 - 1.5
  utterance.volume = 0.3 + (options.voice.volume / 100) * 0.7; // 0.3 - 1.0

  const myId = ++utteranceCounter;

  // Heartbeat anti-corte (Chrome mata utterances >15s):
  // pausa y reanuda cada ~10s para mantener la síntesis viva.
  const heartbeatMs = 10_000;
  const heartbeat = setInterval(() => {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    } else if (speechSynthesis.speaking) {
      speechSynthesis.pause();
      speechSynthesis.resume();
    }
  }, heartbeatMs);

  await new Promise<void>((resolve, reject) => {
    utterance.onend = () => {
      clearInterval(heartbeat);
      resolve();
    };
    utterance.onerror = (event) => {
      clearInterval(heartbeat);
      const error = (event as unknown as { error?: string }).error;
      // interrupted/canceled son no-fatales: la cola debe avanzar
      if (error === "interrupted" || error === "canceled") {
        resolve();
      } else {
        reject(new Error(`TTS error: ${error ?? "unknown"}`));
      }
    };
    // Ignorar callbacks stale de utterances previos
    utterance.onstart = () => {
      if (myId !== utteranceCounter) {
        speechSynthesis.cancel();
      }
    };
    speechSynthesis.speak(utterance);
  });

  return {
    length: text.length,
    text,
    format: options.audioEncoding || "WEB_SPEECH_LOCAL",
  };
}

/**
 * Lista voces locales disponibles en el navegador
 */
export async function listAvailableVoices(languageCode?: string) {
  if (typeof speechSynthesis === "undefined") return [];

  const voices = speechSynthesis.getVoices();
  const filtered = languageCode
    ? voices.filter((v) => v.lang.toLowerCase().startsWith(languageCode.toLowerCase()))
    : voices;

  return filtered.map((v) => ({
    name: v.name,
    languageCodes: [v.lang],
    ssmlGender:
      v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("mujer")
        ? "FEMALE"
        : v.name.toLowerCase().includes("male") || v.name.toLowerCase().includes("hombre")
          ? "MALE"
          : "NEUTRAL",
    localService: v.localService,
  }));
}

/**
 * Configuración de voz por defecto (es-CO como TikFinity)
 */
export const DEFAULT_VOICE_CONFIG: TTSVoiceConfig = {
  language: "es-CO",
  gender: "FEMALE",
  voiceType: "Standard",
  speed: 50,
  pitch: 50,
  volume: 50,
};

/**
 * Valida que el texto no exceda el límite de caracteres
 */
export function validateTextLength(text: string, maxLength = 300): boolean {
  return text.length <= maxLength;
}

/**
 * Compat: costo estimado (siempre 0 — TTS local sin costo)
 */
export function estimateCost(_charCount: number, _voiceType: VoiceType): number {
  return 0;
}

/**
 * Detiene la reproducción actual (útil al pausar streaming)
 */
export function stopSpeaking(): void {
  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.cancel();
  }
}
