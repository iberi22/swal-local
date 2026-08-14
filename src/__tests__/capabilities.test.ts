/**
 * Tests de detección de capacidades (Fase B1)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { detectWebGPU, detectOllama, detectCapabilities, recommendAiMode } from "../capabilities";

describe("capabilities (WebGPU/Ollama/modo socio)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("test_detect_webgpu_unavailable: sin navigator.gpu → false", async () => {
    const result = await detectWebGPU();
    expect(result.available).toBe(false); // jsdom no tiene WebGPU
  });

  it("test_detect_webgpu_available: con gpu mockeado → true + adapter", async () => {
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: async () => ({ info: { description: "AMD Radeon (Mock)" } }),
      },
    });
    const result = await detectWebGPU();
    expect(result.available).toBe(true);
    expect(result.adapter).toContain("AMD");
  });

  it("test_detect_ollama_unavailable: fetch falla → false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await detectOllama("/ollama-api");
    expect(result.available).toBe(false);
  });

  it("test_detect_ollama_available: fetch ok → modelos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "llama3.2" }, { name: "qwen2.5" }] }),
    }));
    const result = await detectOllama("/ollama-api");
    expect(result.available).toBe(true);
    expect(result.models).toContain("llama3.2");
  });

  it("test_recommend_webgpu_first: webgpu gana sobre ollama", () => {
    const caps = {
      webgpu: true, ollama: true, ollamaModels: ["llama3.2"],
    } as Parameters<typeof recommendAiMode>[0];
    expect(recommendAiMode(caps).mode).toBe("webgpu");
  });

  it("test_recommend_ollama: sin webgpu pero con ollama", () => {
    const caps = {
      webgpu: false, ollama: true, ollamaModels: ["llama3.2"],
    } as Parameters<typeof recommendAiMode>[0];
    expect(recommendAiMode(caps).mode).toBe("ollama");
  });

  it("test_recommend_socio: sin gpu ni ollama → cloud-socio", () => {
    const caps = {
      webgpu: false, ollama: false, ollamaModels: [],
    } as Parameters<typeof recommendAiMode>[0];
    expect(recommendAiMode(caps).mode).toBe("cloud-socio");
  });

  it("test_detect_capabilities_full: detección completa no falla", async () => {
    const caps = await detectCapabilities("/ollama-api");
    expect(typeof caps.webgpu).toBe("boolean");
    expect(typeof caps.indexedDB).toBe("boolean");
    expect(caps.memory.hardwareConcurrency).toBeGreaterThanOrEqual(0);
  });
});
