/**
 * Tests de auth local (F-009): signUp/signIn/signOut/hash
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getCurrentUser, isAuthenticated, signIn, signOut, signUp } from "../auth";
import { __clearLocalStore } from "../store";

describe("auth local", () => {
  beforeEach(async () => {
    await __clearLocalStore();
    localStorage.clear();
  });

  it("test_signup_creates_local_user: registro local", async () => {
    const { user } = await signUp("test@example.com", "password123");
    expect(user.uid).toBeDefined();
    expect(user.email).toBe("test@example.com");
    expect(user.isLocal).toBe(true);
  });

  it("test_signup_rejects_duplicate: no duplica cuenta", async () => {
    await signUp("test@example.com", "password123");
    await expect(signUp("test@example.com", "other")).rejects.toThrow("ya tiene una cuenta");
  });

  it("test_signin_correct_password: login correcto", async () => {
    await signUp("test@example.com", "password123");
    const { user } = await signIn("test@example.com", "password123");
    expect(user.email).toBe("test@example.com");
  });

  it("test_signin_wrong_password: login falla con contraseña incorrecta", async () => {
    await signUp("test@example.com", "password123");
    await expect(signIn("test@example.com", "wrong")).rejects.toThrow("Contraseña incorrecta");
  });

  it("test_current_user_session: getCurrentUser tras login", async () => {
    await signUp("test@example.com", "password123");
    const user = await getCurrentUser();
    expect(user?.email).toBe("test@example.com");
    expect(await isAuthenticated()).toBe(true);
  });

  it("test_signout_clears_session: signOut limpia sesión", async () => {
    await signUp("test@example.com", "password123");
    await signOut();
    expect(await isAuthenticated()).toBe(false);
    expect(await getCurrentUser()).toBeNull();
  });
});
