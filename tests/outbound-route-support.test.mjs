import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, outboundEnabled } from "../src/lib/outbound/route-support.ts";

test("csvCell quotes delimiters and neutralises spreadsheet formulas", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("+1 555"), "'+1 555");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell(42), "42");
});

test("outbound routes stay dark unless both the flag and an explicit data root are set", () => {
  const saved = { e: process.env.OUTBOUND_ENABLED, r: process.env.OUTBOUND_DATA_ROOT };
  try {
    delete process.env.OUTBOUND_ENABLED; delete process.env.OUTBOUND_DATA_ROOT;
    assert.equal(outboundEnabled(), false);
    process.env.OUTBOUND_ENABLED = "true";
    assert.equal(outboundEnabled(), false, "flag without a data root stays dark");
    process.env.OUTBOUND_DATA_ROOT = "";
    assert.equal(outboundEnabled(), false);
    process.env.OUTBOUND_DATA_ROOT = "outbound-test";
    assert.equal(outboundEnabled(), true);
    process.env.OUTBOUND_ENABLED = "1";
    assert.equal(outboundEnabled(), false, "only the exact string true enables");
  } finally {
    if (saved.e === undefined) delete process.env.OUTBOUND_ENABLED; else process.env.OUTBOUND_ENABLED = saved.e;
    if (saved.r === undefined) delete process.env.OUTBOUND_DATA_ROOT; else process.env.OUTBOUND_DATA_ROOT = saved.r;
  }
});

test("audit export returns 404 on a deployment where outbound is dark", async () => {
  delete process.env.OUTBOUND_ENABLED;
  const { GET } = await import("../src/app/api/outbound/audit/route.ts");
  const res = await GET(new Request("https://test.local/api/outbound/audit", { headers: { authorization: "Bearer demo-token" } }));
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("cache-control"), "no-store");
});
