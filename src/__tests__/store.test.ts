/**
 * Tests del store local IndexedDB (F-002)
 * Cubre localStore + secureStore: set/get/remove/list con API estilo Firestore.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { __clearLocalStore, localStore, secureStore } from "../store";

describe("localStore (IndexedDB)", () => {
  beforeEach(async () => {
    // Limpiar datos entre tests (sin borrar la DB — evita bloqueos de conexión)
    await __clearLocalStore();
  });

  it("test_set_get_roundtrip: guarda y lee un documento", async () => {
    await localStore.set("streamingSessions", "u1/s1", { status: "live", viewers: 42 });
    const doc = await localStore.get<{ status: string; viewers: number }>(
      "streamingSessions",
      "u1/s1",
    );
    expect(doc).toEqual({ status: "live", viewers: 42 });
  });

  it("test_get_missing_returns_undefined: documento inexistente → undefined", async () => {
    const doc = await localStore.get("nope", "no-existe");
    expect(doc).toBeUndefined();
  });

  it("test_remove_deletes_doc: elimina un documento", async () => {
    await localStore.set("overlays", "u1/ov1", { name: "Test" });
    await localStore.remove("overlays", "u1/ov1");
    const doc = await localStore.get("overlays", "u1/ov1");
    expect(doc).toBeUndefined();
  });

  it("test_list_collection_prefix: lista solo docs de la colección", async () => {
    await localStore.set("overlays", "u1/ov1", { name: "A" });
    await localStore.set("overlays", "u1/ov2", { name: "B" });
    await localStore.set("streamingSessions", "u1/s1", { status: "live" });

    const overlays = await localStore.list<{ name: string }>("overlays");
    expect(overlays).toHaveLength(2);
    // docId puede ser compuesto (userId/docId) — el ID devuelto conserva el docId completo
    expect(overlays.map((o) => o.id).sort()).toEqual(["u1/ov1", "u1/ov2"]);
    expect(overlays[0].data.name).toBeDefined();
  });

  it("test_secure_store_roundtrip: tokens en secureStore", async () => {
    await secureStore.set("tiktok-credentials", { clientKey: "k", clientSecret: "s" });
    const creds = await secureStore.get<{ clientKey: string; clientSecret: string }>(
      "tiktok-credentials",
    );
    expect(creds?.clientKey).toBe("k");
    await secureStore.remove("tiktok-credentials");
    expect(await secureStore.get("tiktok-credentials")).toBeUndefined();
  });
});
