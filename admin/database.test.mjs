import test from "node:test";
import assert from "node:assert/strict";
import { AdminDatabase, remoteReady } from "./database.ts";
const env = {
  DB: {},
  CLOUDFLARE_API_TOKEN: "test-only-token",
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  FORGENORD_D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
};
test("remote access requires a token, account and non-placeholder database", () => {
  assert.ok(remoteReady(env));
  assert.throws(
    () => new AdminDatabase({ ...env, CLOUDFLARE_API_TOKEN: "" }, "remote"),
  );
  assert.equal(
    remoteReady({
      ...env,
      FORGENORD_D1_DATABASE_ID: "00000000-0000-4000-8000-000000000000",
    }),
    false,
  );
});
test("remote queries and batches keep parameters separate and use the selected account", async () => {
  const calls = [];
  const db = new AdminDatabase(env, "remote", async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const queries = JSON.parse(options.body).batch ?? [
      JSON.parse(options.body),
    ];
    return Response.json({
      success: true,
      result: queries.map(() => ({ success: true, results: [{ id: "row" }] })),
    });
  });
  assert.deepEqual(
    await db
      .prepare("SELECT id FROM polls WHERE slug=?")
      .bind("x' OR 1=1")
      .first(),
    { id: "row" },
  );
  assert.match(calls[0].url, /accounts\/a{32}\/d1\/database\/11111111/);
  assert.equal(
    calls[0].options.headers.Authorization,
    "Bearer test-only-token",
  );
  assert.deepEqual(calls[0].body.params, ["x' OR 1=1"]);
  await db.batch([
    db
      .prepare("UPDATE poll_parameters SET value=? WHERE key=?")
      .bind("value", "promo_code"),
    db
      .prepare("UPDATE poll_parameters SET value=? WHERE key=?")
      .bind(null, "promo_ends_at"),
  ]);
  assert.equal(calls[1].body.batch.length, 2);
});
test("remote API failure never falls back to local writes", async () => {
  let local = false;
  const db = new AdminDatabase(
    {
      ...env,
      DB: {
        batch() {
          local = true;
        },
      },
    },
    "remote",
    async () => Response.json({ success: false, result: [] }, { status: 403 }),
  );
  await assert.rejects(() =>
    db.prepare("UPDATE polls SET status=?").bind("closed").run(),
  );
  assert.equal(local, false);
});
