/**
 * Transcripción de audio local — Web Speech API (SpeechRecognition)
 *
 * TikBoost local-first: reemplaza OpenAI Whisper por la Web Speech API
 * del navegador (SpeechRecognition). Sin API keys, sin red.
 *
 * Nota: SpeechRecognition está disponible en Chrome/Edge (webkitSpeechRecognition).
 * En navegadores sin soporte, se lanza un error claro.
 */

import { now, type Timestamp } from "../timestamp";
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionEvent,
  SpeechRecognitionLike,
} from "./types";

/**
 * Transcript segment with timing
 */
export interface TranscriptSegment {
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Transcribed text */
  text: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Full transcription result
 */
export interface TranscriptionResult {
  /** Stream session ID */
  sessionId: string;
  /** Full transcript text */
  fullText: string;
  /** Segmented transcript with timestamps */
  segments: TranscriptSegment[];
  /** Language detected */
  language: string;
  /** Duration in seconds */
  duration: number;
  /** Processing timestamp */
  processedAt: Timestamp;
}

/**
 * ¿El navegador soporta reconocimiento de voz?
 */
export function isSpeechRecognitionAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

/**
 * Obtiene el constructor de SpeechRecognition (con fallback webkit)
 */
function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SpeechRecognitionConstructor | null;
}

/**
 * Transcribe audio en tiempo real (micrófono) usando la Web Speech API.
 *
 * Devuelve una promesa que resuelve al finalizar (auto-stop por silencio).
 */
export async function transcribeAudioLive(options?: {
  language?: string;
  maxDurationSeconds?: number;
  onPartial?: (text: string) => void;
}): Promise<TranscriptionResult> {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    throw new Error("SpeechRecognition no disponible en este navegador (usa Chrome/Edge)");
  }

  const recognition: SpeechRecognitionLike = new Ctor();
  const lang = options?.language ?? "es-CO";
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;

  const segments: TranscriptSegment[] = [];
  let finalText = "";
  let lastStart = 0;

  return new Promise<TranscriptionResult>((resolve, reject) => {
    const sessionId = `local-${Date.now()}`;
    const startTime = Date.now();
    let stopped = false;

    const finish = (error?: Error) => {
      if (stopped) return;
      stopped = true;
      recognition.stop();
      if (error) {
        reject(error);
        return;
      }
      const duration = (Date.now() - startTime) / 1000;
      resolve({
        sessionId,
        fullText: finalText.trim(),
        segments,
        language: lang,
        duration,
        processedAt: now(),
      });
    };

    // Auto-stop por duración máxima
    if (options?.maxDurationSeconds) {
      setTimeout(() => finish(), options.maxDurationSeconds * 1000);
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript;
          finalText += text + " ";
          const confidence = result[0].confidence ?? 0.8;
          segments.push({
            startTime: lastStart,
            endTime: (Date.now() - startTime) / 1000,
            text: text.trim(),
            confidence,
          });
          lastStart = (Date.now() - startTime) / 1000;
        } else {
          interim += result[0].transcript;
        }
      }
      options?.onPartial?.(finalText + interim);
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        finish();
      } else {
        finish(new Error(`SpeechRecognition error: ${event.error}`));
      }
    };

    recognition.onend = () => finish();

    recognition.start();
  });
}

/**
 * Compat: transcribe desde archivo de audio.
 *
 * La Web Speech API no procesa archivos directamente; esta función
 * lanza un error claro señalando que la transcripción es en vivo.
 */
export async function transcribeAudio(
  audioFilePath: string,
  language?: string,
): Promise<TranscriptionResult> {
  console.warn(
    "[transcription] transcripción de archivos requiere motor local (whisper.cpp/Ollama). Usa transcribeAudioLive() para micrófono en vivo.",
    audioFilePath,
  );
  throw new Error(
    "Transcripción de archivos no soportada en modo local-first. Usa transcripción en vivo (micrófono).",
  );
}

/**
 * Compat: transcripción por chunks (no aplica en modo local)
 */
export async function transcribeChunk(
  _audioChunkUrl: string,
  _previousContext?: string,
): Promise<TranscriptSegment> {
  throw new Error("Transcripción por chunks no aplica en modo local-first");
}

/**
 * Search transcript for specific keywords or phrases
 *
 * @param transcript - Full transcription result
 * @param query - Search query
 * @returns Matching segments
 */
export function searchTranscript(
  transcript: TranscriptionResult,
  query: string,
): TranscriptSegment[] {
  const queryLower = query.toLowerCase();
  return transcript.segments.filter((segment) => segment.text.toLowerCase().includes(queryLower));
}

/**
 * Get transcript excerpt around specific timestamp
 *
 * @param transcript - Full transcription result
 * @param timestamp - Time in seconds
 * @param contextWindow - Seconds before/after (default 30s)
 * @returns Transcript excerpt
 */
export function getTranscriptExcerpt(
  transcript: TranscriptionResult,
  timestamp: number,
  contextWindow: number = 30,
): string {
  const startTime = Math.max(0, timestamp - contextWindow);
  const endTime = timestamp + contextWindow;

  const relevantSegments = transcript.segments.filter(
    (seg) => seg.startTime >= startTime && seg.endTime <= endTime,
  );

  return relevantSegments.map((seg) => seg.text).join(" ");
}

/**
 * Calculate transcript statistics
 *
 * @param transcript - Full transcription result
 * @returns Statistics
 */
export function getTranscriptStats(transcript: TranscriptionResult) {
  const wordCount = transcript.fullText.split(/\s+/).filter(Boolean).length;
  const avgConfidence =
    transcript.segments.length > 0
      ? transcript.segments.reduce((sum, seg) => sum + seg.confidence, 0) /
        transcript.segments.length
      : 0;

  const wordsPerMinute = transcript.duration > 0 ? (wordCount / transcript.duration) * 60 : 0;

  return {
    wordCount,
    segmentCount: transcript.segments.length,
    avgConfidence,
    wordsPerMinute,
    duration: transcript.duration,
    language: transcript.language,
  };
}

/**
 * Extract session ID from audio file path
 *
 * @param path - File path or URL
 * @returns Session ID
 */
function extractSessionId(path: string): string {
  // Extract from path like: /streams/{sessionId}/audio.mp3
  const match = path.match(/streams\/([^/]+)/);
  return match ? match[1] : "unknown";
}

export { extractSessionId };
