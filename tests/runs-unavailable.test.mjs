import { test, before } from "node:test";
import assert from "node:assert/strict";

let POST, flag, message;
before(async () => {
  POST = (await import("../src/app/api/geo/scan/route.ts")).POST;
  const mod = await import("../src/lib/geo/runs-availability.ts");
  flag = mod.RUNS_TEMPORARILY_UNAVAILABLE;
  message = mod.RUNS_UNAVAILABLE_MESSAGE;
});

function postReq() {
  return new Request("https://test.local/api/geo/scan", { method: "POST", body: "{}" });
}

test("kill switch is on while providers are unavailable", () => {
  assert.equal(flag, true);
});

test("POST /api/geo/scan is blocked with 503 and the unavailable notice, no auth needed", async () => {
  const res = await POST(postReq());
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.error, message);
  assert.match(body.error, /temporarily unavailable/);
});
