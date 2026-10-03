import test from "node:test";
import assert from "node:assert/strict";
import { parseContact, drawOpen } from "../src/lib/contacts.ts";
test("public mentions never expose an email as a name", () => {
  const form = new FormData();
  form.set("channel", "email");
  form.set("address", "person@example.com");
  form.set("mention", "on");
  assert.equal(parseContact(form), null);
  form.set("display_name", "Name");
  assert.equal(parseContact(form)?.mention, true);
});
test("social contacts use a handle rather than arbitrary URLs", () => {
  const form = new FormData();
  form.set("channel", "instagram");
  form.set("address", "https://example.com");
  assert.equal(parseContact(form), null);
  form.set("address", "@example");
  assert.equal(parseContact(form)?.normalized, "example");
});
test("draw eligibility requires validated bilingual terms and its own period", () => {
  const draw = {
    enabled: 1,
    validated_at: "2026-10-01",
    terms_fr: "Texte",
    terms_en: "Text",
    terms_version: "1",
    opens_at: null,
    closes_at: null,
  };
  assert.equal(drawOpen(draw), true);
  assert.equal(drawOpen({ ...draw, terms_en: "" }), false);
  assert.equal(drawOpen({ ...draw, enabled: 0 }), false);
  assert.equal(drawOpen({ ...draw, closes_at: "2020-01-01" }), false);
});
