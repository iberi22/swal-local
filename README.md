# @iberi22/swal-local

[![CI](https://github.com/iberi22/swal-local/actions/workflows/ci.yml/badge.svg)](https://github.com/iberi22/swal-local/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](tsconfig.json)
[![Tests](https://img.shields.io/badge/Tests-16%20passing-brightgreen.svg)](#verification)

Zero-dependency TypeScript library for local-first application logic. Works with React, Svelte, Vue, or vanilla JS — no framework lock-in.

## Modules

| Module | Import | Description |
|--------|--------|-------------|
| **store** | `@iberi22/swal-local` | Transactional IndexedDB with atomic transactions, BroadcastChannel multi-tab sync, JSON export/import, and versioned migrations |
| **auth** | `@iberi22/swal-local/auth` | Local authentication via PBKDF2-SHA256 (WebCrypto, 150k iterations, per-user salt, versioned PasswordRecord) |
| **tts** | `@iberi22/swal-local/tts` | Text-to-Speech via Web Speech API with voice loading, anti-cutoff heartbeat (10s), and robust onend/onerror handlers |
| **stt** | `@iberi22/swal-local/stt` | Live SpeechRecognition with segment transcription, confidence scores, and typed interfaces |
| **ollama** | `@iberi22/swal-local/ollama` | Ollama local LLM client: chat, chatJSON, prompt completion, and health check with configurable endpoint |

## Quickstart

```bash
npm install @iberi22/swal-local
```

```typescript
// Transactional storage
import { localStore, transaction } from "@iberi22/swal-local";

await transaction(localStore, async (tx) => {
  tx.put("user", { id: 1, name: "Alice" });
  tx.put("settings", { theme: "dark" });
});

// Authentication
import { hashPassword, verifyPassword } from "@iberi22/swal-local/auth";
const record = await hashPassword("my-secret-password");
const valid = await verifyPassword(record, "my-secret-password");

// Speech synthesis
import { textToSpeech } from "@iberi22/swal-local/tts";
await textToSpeech("Hello from the SWAL ecosystem");

// Speech recognition
import { transcribeAudioLive } from "@iberi22/swal-local/stt";
const stream = await transcribeAudioLive();
stream.onResult((text, confidence) => console.log(text));

// Ollama integration
import { chat, checkOllamaHealth } from "@iberi22/swal-local/ollama";
const healthy = await checkOllamaHealth("http://localhost:11434");
const response = await chat({ model: "llama3", prompt: "Explain local-first" });
```

## Tech Stack

`TypeScript 5.x` · `IndexedDB` · `WebCrypto` · `Web Speech API` · `WebSockets` (Ollama) · `Vitest` · `Zero dependencies`

## Why Zero-Dependency

Every module uses browser-native APIs (IndexedDB, WebCrypto, SpeechSynthesis) instead of external packages. This means:
- **Smaller bundles** — no node_modules to ship
- **Easier audits** — every dependency is your own code
- **Offline-first** — works without network access (except Ollama client)

## Adoption

swal-local is new and not yet a dependency of any published app.

- [TikTokBoost](https://github.com/iberi22/tiktboost) currently carries a vendored copy under `packages/swal-local`; it will switch to the published package.
- Shelf, Gara-G and Hosteler-IA (Fize) have their own copies of the same logic (storage, PBKDF2 auth, voice, Ollama client) and are planned to migrate.

## Releasing

1. Bump `version` in `package.json` (semver) and commit to `master`.
2. Push a matching tag: `git tag v0.1.0 && git push origin v0.1.0`.
3. The `Release` workflow checks that the tag matches the version, runs typecheck, tests and build, and publishes to npm with provenance. It needs the `NPM_TOKEN` repository secret.

## Verification

```bash
npm run typecheck   # tsc --noEmit (0 errors)
npm run test        # vitest (16 tests passing)
npm run build       # tsc → dist/
```

## Origin

Extracted from `tiktboost/apps/web/src/lib/` (local-first migration 2026-08-14).
See `tiktboost/docs/ARCHITECTURE-ALIGNMENT.md` for alignment with the unified architecture.

## Security

Please refer to the [Security Policy](SECURITY.md) for information on supported versions and how to report a vulnerability.

## License

MIT — see [LICENSE](LICENSE) for details.
