import test from "node:test";
import assert from "node:assert/strict";
import { limitedBody } from "../src/lib/request.ts";
test("form body size is bounded by bytes without trusting Content-Length", async () => {
  assert.equal(
    await limitedBody(
      new Request("https://example.com", { method: "POST", body: "éé" }),
      3,
    ),
    null,
  );
  assert.equal(
    await limitedBody(
      new Request("https://example.com", { method: "POST", body: "éé" }),
      4,
    ),
    "éé",
  );
});
