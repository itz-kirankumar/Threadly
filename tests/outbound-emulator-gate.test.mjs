import { test } from "node:test";
import assert from "node:assert/strict";

// The local emulator path in admin-store must (a) stay inert without the
// emulator env var and (b) initialize against the emulator host only when
// that var is explicitly set. Vercel production/preview never sets it.

test("admin database refuses when neither admin creds nor emulator host are set", async () => {
  delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const mod = await import("../src/lib/geo/admin-store.ts?case=negative");
  await assert.rejects(() => mod.getAdminDatabase(), /not configured/i);
});

test("admin database initializes against the emulator only when FIREBASE_DATABASE_EMULATOR_HOST is set", async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:9000";
  process.env.FIREBASE_PROJECT_ID = "demo-threadly";
  const mod = await import("../src/lib/geo/admin-store.ts?case=emulator");
  const db = await mod.getAdminDatabase();
  assert.ok(db, "expected an admin database bound to the emulator");
  assert.match(db.app.options.databaseURL, /localhost:9000/);
  delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
});
