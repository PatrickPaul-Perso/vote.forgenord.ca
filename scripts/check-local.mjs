import assert from "node:assert/strict";
const admin = "http://admin:8788";
const site = "http://127.0.0.1:4321";
for (const base of [admin, site]) {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(base);
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(ready, "Local service did not start");
}
const poll = crypto.randomUUID();
const slug = "check-" + poll;
const option = crypto.randomUUID();
const draw = crypto.randomUUID();
const code = crypto.randomUUID();
async function manage(values) {
  const response = await fetch(admin, {
    method: "POST",
    headers: {
      origin: admin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
  });
  assert.equal(response.status, 200, await response.text());
}
await manage({
  action: "poll",
  id: poll,
  slug,
  organization: "Test organization",
  title_fr: "Consultation test",
  title_en: "Test consultation",
  description_fr: "Test",
  description_en: "Test",
  status: "published",
  proposal_terms_fr: "Autorisation de réutilisation test",
  proposal_terms_en: "Test reuse permission",
  proposal_terms_version: "test-v1",
});
await manage({
  action: "option",
  id: option,
  poll_id: poll,
  name_fr: "Option test",
  name_en: "Test option",
  sort_order: "0",
  archived: "0",
  image_key: "grandpic.jpg",
});
await manage({
  action: "promo",
  poll_id: poll,
  promo_code: code,
  promo_starts_at: "2026-01-01T00:00:00Z",
  promo_ends_at: "2099-01-01T00:00:00Z",
});
const page = await fetch(site + "/" + slug, {
  headers: { "accept-language": "en" },
});
assert.equal(page.status, 200);
const html = await page.text();
assert.match(html, /Test consultation/);
assert.ok(!html.includes(code));
const cookie = page.headers
  .get("set-cookie")
  .match(/forgenord_participant=[^;]+/)[0];
async function submit(path, values) {
  return fetch(site + path, {
    method: "POST",
    headers: {
      cookie,
      origin: site,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
  });
}
const vote = await submit("/" + slug, { choice: option });
assert.equal(vote.status, 200);
const confirmation = await vote.text();
assert.ok(confirmation.includes(code));
assert.match(confirmation, /name="address"/);
assert.match(confirmation, /name="mention"/);
assert.ok(!confirmation.includes('name="draw_contact"'));
for (const language of ['fr','en']) {
 const reload = await fetch(site+'/'+slug+'?lang='+language, {headers:{cookie}});
 assert.equal(reload.status,200);
 const reloaded = await reload.text();
 assert.match(reloaded,/name="mention"/);
 assert.match(reloaded,/name="address"/);
 assert.ok(!reloaded.includes(code));
}
const bad = await submit("/" + slug, {
  choice: "proposal",
  title: "New model",
});
assert.equal(bad.status, 400);
const proposal = await submit("/" + slug, {
  choice: "proposal",
  title: "New model",
  reuse: "on",
});
assert.equal(proposal.status, 200);
const mention = await submit("/" + slug + "/contact", {
  channel: "instagram",
  address: "@test_account",
  mention: "on",
});
assert.equal(mention.status, 200);
const closed = await submit("/" + slug + "/contact?draw=1", {
  channel: "email",
  address: "test@example.invalid",
  draw_contact: "on",
  draw_terms: "on",
});
assert.equal(closed.status, 400);
await manage({
  action: "draw",
  id: draw,
  poll_id: poll,
  enabled: "1",
  terms_fr: "Modalités de test",
  terms_en: "Test terms",
  terms_version: "test-v1",
  validated_at: "2026-10-02T00:00:00Z",
});
const entry = await submit("/" + slug + "/contact?draw=1", {
  channel: "email",
  address: "test@example.invalid",
  draw_contact: "on",
  draw_terms: "on",
});
assert.equal(entry.status, 200);
// Hide the synthetic consultation after validation; no real contact or promo used.
await manage({
  action: "poll",
  id: poll,
  organization: "Test organization",
  title_fr: "Consultation test",
  title_en: "Test consultation",
  status: "draft",
  proposal_terms_fr: "Test",
  proposal_terms_en: "Test",
  proposal_terms_version: "test-v1",
});
console.log(
  "Local HTTP checks passed: management, shared D1, language, vote, proposal consent, D1 promotion, public mention, separate draw.",
);
