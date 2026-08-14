/**
 * Tests de transacciones atómicas + sync multi-tab (fix P1 kimi review)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __clearLocalStore, localStore } from "../store";

describe("localStore.transaction (read-modify-write atómico)", () => {
  beforeEach(async () => {
    await __clearLocalStore();
  });

  it("test_transaction_increment: incrementa contador sin lost update", async () => {
    await localStore.set("counter", "global", { n: 0 });

    // Simular 5 tabs incrementando a la vez (transacción atómica)
    await Promise.all(
      Array.from({ length: 5 }, async () => {
        await localStore.transaction<{ n: number }>("counter", "global", (cur) => ({
          n: (cur?.n ?? 0) + 1,
        }));
      }),
    );

    const result = await localStore.get<{ n: number }>("counter", "global");
    expect(result?.n).toBe(5);
  });

  it("test_transaction_create_if_missing: crea si no existe", async () => {
    const result = await localStore.transaction<{ created: boolean }>("docs", "new-doc", (cur) => ({
      created: cur === undefined,
      ts: Date.now(),
    }));
    expect(result?.created).toBe(true);
  });

  it("test_transaction_delete_on_null: devuelve null para borrar", async () => {
    await localStore.set("docs", "x", { v: 1 });
    const result = await localStore.transaction<{ v: number }>("docs", "x", () => null);
    expect(result).toBeNull();
    expect(await localStore.get("docs", "x")).toBeUndefined();
  });

  it("test_transaction_mutator_error_aborts: error en mutator aborta", async () => {
    await localStore.set("docs", "keep", { v: 1 });
    await expect(
      localStore.transaction("docs", "keep", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // El doc original sigue intacto
    expect(await localStore.get("docs", "keep")).toEqual({ v: 1 });
  });
});

describe("subscribeToStoreChanges (BroadcastChannel)", () => {
  beforeEach(async () => {
    await __clearLocalStore();
    // jsdom no implementa BroadcastChannel → mock antes de cualquier uso
    const listeners: Array<(ev: { data: unknown }) => void> = [];
    class MockBroadcastChannel {
      postMessage(data: unknown) {
        for (const l of listeners) l({ data });
      }
      addEventListener(type: string, fn: (ev: { data: unknown }) => void) {
        if (type === "message") listeners.push(fn);
      }
      removeEventListener() {}
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    // Reset del channel cacheado en el módulo
    const mod = await import("../store");
    mod.__resetStoreChannel();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("test_subscribe_receives_transaction_broadcast: recibe cambios de transacción", async () => {
    const mod = await import("../store");
    const handler = vi.fn();
    const unsubscribe = mod.subscribeToStoreChanges<{ v: number }>({
      collection: "docs",
      onchange: handler,
    });

    await mod.localStore.transaction<{ v: number }>("docs", "abc", () => ({ v: 42 }));

    // Esperar microtask del broadcast
    await new Promise((r) => setTimeout(r, 10));
    expect(handler).toHaveBeenCalledWith("abc", { v: 42 });

    unsubscribe();
  });
});
