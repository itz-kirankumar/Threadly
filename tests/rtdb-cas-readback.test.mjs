import { test } from "node:test";
import assert from "node:assert/strict";

// Independent readback verification on the RTDB ETag compare-and-put: the
// write is confirmed by a FRESH GET after the conditional PUT, never by the
// PUT response alone or any cached state.

process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9"; // unroutable; fetch is stubbed below
const { rtdbCasPut } = await import("../src/lib/outbound/rtdb-store.ts");

function stubFetch(sequence) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    const next = sequence[calls.length - 1];
    if (!next) throw new Error(`unexpected fetch #${calls.length}`);
    return next();
  };
  return calls;
}
const jsonRes = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

test("without verifyReadback the CAS is one GET + one PUT (unchanged behavior)", async () => {
  const calls = stubFetch([
    () => jsonRes(200, null, { ETag: "e1" }),
    () => jsonRes(200, { ok: true }),
  ]);
  const wrote = await rtdbCasPut("outbound-test/t1/x", (c) => c === null, { v: 1 });
  assert.equal(wrote, true);
  assert.deepEqual(calls.map((c) => c.method), ["GET", "PUT"]);
});

test("matching independent readback confirms the write", async () => {
  const calls = stubFetch([
    () => jsonRes(200, null, { ETag: "e1" }),
    () => jsonRes(200, { ok: true }),
    () => jsonRes(200, { v: 1 }),
  ]);
  const wrote = await rtdbCasPut("outbound-test/t1/x", (c) => c === null, { v: 1 }, {
    verifyReadback: (stored) => stored?.v === 1,
  });
  assert.equal(wrote, true);
  assert.deepEqual(calls.map((c) => c.method), ["GET", "PUT", "GET"]);
});

test("mismatching readback throws loudly after the CAS landed", async () => {
  stubFetch([
    () => jsonRes(200, null, { ETag: "e1" }),
    () => jsonRes(200, { ok: true }),
    () => jsonRes(200, null), // server dropped the record (e.g. all-null payload)
  ]);
  await assert.rejects(
    () => rtdbCasPut("outbound-test/t1/x", (c) => c === null, { v: 1 }, { verifyReadback: (s) => s !== null }),
    /cas_readback_mismatch/
  );
});

test("failed readback request throws instead of silently trusting the PUT", async () => {
  stubFetch([
    () => jsonRes(200, null, { ETag: "e1" }),
    () => jsonRes(200, { ok: true }),
    () => jsonRes(500, {}),
  ]);
  await assert.rejects(
    () => rtdbCasPut("outbound-test/t1/x", (c) => c === null, { v: 1 }, { verifyReadback: (s) => s !== null }),
    /cas_readback_failed:500/
  );
});
