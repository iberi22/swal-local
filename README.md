# SWAL Local

Lógica local-first reutilizable del ecosistema SWAL. TS puro, zero-dependency runtime.
Funciona en React, Svelte o vanilla — extraído de tiktboost (2026-08-14).

## Módulos

| Módulo | Path | Qué es |
|--------|------|--------|
| `store` | `src/store/index.ts` | IndexedDB transaccional: set/get/remove/list + transaction() atómico + BroadcastChannel multi-tab + export/import JSON + MIGRATIONS[] versionadas |
| `auth` | `src/auth.ts` | Auth local PBKDF2-SHA256 (WebCrypto, 150k iter, salt por usuario, PasswordRecord versionado) |
| `tts` | `src/tts/index.ts` | Text-to-Speech Web Speech API: waitForVoices, heartbeat anti-corte 10s, onend/onerror robusto |
| `stt` | `src/stt/index.ts` | SpeechRecognition en vivo: transcripción con segmentos + confidence, tipos propios |
| `ollama` | `src/ollama/index.ts` | Cliente Ollama local: chat/chatJSON/prompt/health con endpoint configurable |

## Uso

```ts
import { localStore, transaction } from "@iberi22/swal-local";
import { hashPassword, verifyPassword } from "@iberi22/swal-local/auth";
import { textToSpeech } from "@iberi22/swal-local/tts";
import { transcribeAudioLive } from "@iberi22/swal-local/stt";
import { chat, checkOllamaHealth } from "@iberi22/swal-local/ollama";
```

## Verificación

```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest (16 tests)
npm run build       # tsc → dist/
```

## Origen

Extraído de `tiktboost/apps/web/src/lib/` (migración local-first 2026-08-14).
Ver `tiktboost/docs/ARCHITECTURE-ALIGNMENT.md` para la alineación con la arquitectura unificada.
