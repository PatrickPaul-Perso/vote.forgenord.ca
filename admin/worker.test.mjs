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

test("promotions show escaped saved values and UTC date pickers", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { sql } = JSON.parse(options.body);
    const results = sql.includes("FROM polls ")
      ? [{ id: "poll-1", title_fr: "Consultation <test>", slug: "test" }]
      : sql.includes("FROM poll_parameters")
        ? [{ poll_id: "poll-1", key: "promo_code", value: '<script>test</script>' },
           { poll_id: "poll-1", key: "promo_starts_at", value: "2026-10-01T12:00:00Z" },
           { poll_id: "poll-1", key: "promo_ends_at", value: "2026-10-31T23:59:59Z" }]
        : [];
    return Response.json({ success: true, result: [{ success: true, results }] });
  });
  const response = await worker.fetch(new Request("http://localhost:8788/?target=remote"), env);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Afficher ou modifier le code promotionnel/);
  assert.match(html, /value="&lt;script&gt;test&lt;\/script&gt;"/);
  assert.match(html, /type="datetime-local" step="0.001" value="2026-10-01T12:00:00"/);
  assert.match(html, /Consultation &lt;test&gt;/);
  assert.match(html, /name="poll_id" value="poll-1"/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("promotion date pickers save UTC values in one batch", async (t) => {
  const batches = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.batch) batches.push(body.batch);
    return Response.json({ success: true, result: (body.batch ?? [body]).map(() => ({ success: true, results: [] })) });
  });
  const response = await worker.fetch(new Request("http://localhost:8788/?target=remote", {
    method: "POST", headers: { origin: "http://localhost:8788" },
    body: new URLSearchParams({ target: "remote", action: "promo", poll_id: "poll-1", promo_code: "test-only", promo_starts_at: "2026-10-01T12:00", promo_ends_at: "2026-10-31T23:59:59" }),
  }), env);
  assert.equal(response.status, 200);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].map(query => query.params), [
    ["poll-1", "promo_code", "test-only"],
    ["poll-1", "promo_starts_at", "2026-10-01T12:00:00Z"],
    ["poll-1", "promo_ends_at", "2026-10-31T23:59:59Z"],
  ]);
});
