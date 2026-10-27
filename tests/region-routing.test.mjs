import { test } from "node:test";
import assert from "node:assert/strict";

const { routeProviderForRegion } = await import("../src/lib/billing/region-routing.ts");

const both = { dodoOperational: true, razorpayOperational: true };

test("India billing country routes to Razorpay only", () => {
  assert.deepEqual(routeProviderForRegion({ billingCountry: "IN", ...both }), { ok: true, provider: "razorpay", region: "IN" });
  assert.deepEqual(routeProviderForRegion({ billingCountry: "in", ...both }), { ok: true, provider: "razorpay", region: "IN" });
});

test("non-India billing country routes to Dodo only", () => {
  assert.deepEqual(routeProviderForRegion({ billingCountry: "US", ...both }), { ok: true, provider: "dodo", region: "OTHER" });
  assert.deepEqual(routeProviderForRegion({ billingCountry: "gb", ...both }), { ok: true, provider: "dodo", region: "OTHER" });
});

test("missing or malformed country fails closed", () => {
  assert.deepEqual(routeProviderForRegion({ billingCountry: null, ...both }), { ok: false, reason: "missing_country" });
  assert.deepEqual(routeProviderForRegion({ billingCountry: "", ...both }), { ok: false, reason: "missing_country" });
  assert.deepEqual(routeProviderForRegion({ billingCountry: "India", ...both }), { ok: false, reason: "missing_country" });
});

test("unavailable owning provider fails closed, never cross-routes", () => {
  assert.deepEqual(routeProviderForRegion({ billingCountry: "IN", dodoOperational: true, razorpayOperational: false }), { ok: false, reason: "provider_unavailable" });
  assert.deepEqual(routeProviderForRegion({ billingCountry: "US", dodoOperational: false, razorpayOperational: true }), { ok: false, reason: "provider_unavailable" });
});
