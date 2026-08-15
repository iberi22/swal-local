/**
 * Tests de validación de versión en importStore (wave B2 #63 — hallazgo kimi P2)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { importStore, exportStoreJSON, applyMigrations } from "../store";

describe("importStore version validation", () => {
  it("test_import_raw_data_ok: formato raw (sin meta) se acepta", async () => {
    const count = await importStore({ "settings:theme": "tikpro" });
    expect(count).toBe(1);
  });

  it("test_import_export_roundtrip: export → import roundtrip funciona", async () => {
    await importStore({ "settings:theme": "tikpro", "session:test": { id: "s1" } });
    const json = await exportStoreJSON();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBeGreaterThanOrEqual(2);
    expect(parsed.app).toBe("tiktboost");
    // Import de vuelta
    const count = await importStore(parsed);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("test_import_old_version_migrates: version vieja se migra sin error", async () => {
    const data = {
      app: "tiktboost",
      version: 1,
      exportedAt: 1700000000000,
      data: { "settings:theme": "tikpro" },
    };
    const count = await importStore(data);
    expect(count).toBe(1);
  });

  it("test_import_future_version_rejected: version futura lanza error", async () => {
    const data = {
      app: "tiktboost",
      version: 99,
      exportedAt: 1700000000000,
      data: { "settings:theme": "future" },
    };
    await expect(importStore(data)).rejects.toThrow(/MÁS NUEVA|future|99/);
  });

  it("test_apply_migrations: avanza versiones del catalogo", () => {
    const result = applyMigrations({ "k": "v" }, 0);
    expect(result.version).toBeGreaterThanOrEqual(2);
    expect(result.data).toEqual({ "k": "v" });
  });
});
