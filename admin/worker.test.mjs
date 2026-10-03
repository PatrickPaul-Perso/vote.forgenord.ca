import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.ts";
const env = {
  DB: {},
  CLOUDFLARE_API_TOKEN: "private-test-token",
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  FORGENORD_D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
};
test("remote forms preserve the explicit target and never expose credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ success: true, result: [{ success: true, results: [] }] }),
  );
  const response = await worker.fetch(
    new Request("http://localhost:8788/?target=remote"),
    env,
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /modifient immédiatement/);
  assert.match(html, /name="target" value="remote"/);
  assert.match(html, /action="\?target=remote"/);
  assert.ok(!html.includes(env.CLOUDFLARE_API_TOKEN));
  assert.ok(!html.includes(env.CLOUDFLARE_ACCOUNT_ID));
});
test("a remote POST without matching target cannot write", async (t) => {
  const queries = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    queries.push(JSON.parse(options.body).sql);
    return Response.json({
      success: true,
      result: [{ success: true, results: [] }],
    });
  });
  const response = await worker.fetch(
    new Request("http://localhost:8788/?target=remote", {
      method: "POST",
      headers: { origin: "http://localhost:8788" },
      body: "action=poll&status=published",
    }),
    env,
  );
  assert.equal(response.status, 400);
  assert.ok(queries.every((sql) => sql.startsWith("SELECT")));
});
test("missing remote credentials and untrusted origins do not make remote calls", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw Error("should not call");
  });
  assert.equal(
    (
      await worker.fetch(new Request("http://localhost:8788/?target=remote"), {
        DB: {},
      })
    ).status,
    503,
  );
  assert.equal(
    (await worker.fetch(new Request("http://evil.example/?target=remote"), env))
      .status,
    403,
  );
  assert.equal(calls, 0);
});
