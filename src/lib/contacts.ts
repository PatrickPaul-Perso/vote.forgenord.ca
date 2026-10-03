export type Draw = {
  id: string;
  poll_id: string;
  enabled: number;
  opens_at: string | null;
  closes_at: string | null;
  terms_fr: string;
  terms_en: string;
  terms_version: string;
  validated_at: string | null;
};
export function drawOpen(draw: Draw, now = Date.now()) {
  return (
    draw.enabled === 1 &&
    !!draw.validated_at &&
    !!draw.terms_fr &&
    !!draw.terms_en &&
    !!draw.terms_version &&
    (!draw.opens_at || Date.parse(draw.opens_at) <= now) &&
    (!draw.closes_at || Date.parse(draw.closes_at) > now)
  );
}
export function parseContact(form: FormData) {
  const channel = String(form.get("channel") ?? "");
  const address = String(form.get("address") ?? "").trim();
  const name = String(form.get("display_name") ?? "").trim();
  const mention = form.has("mention");
  if (
    !["email", "tiktok", "instagram", "facebook"].includes(channel) ||
    name.length > 80 ||
    address.length > 254 ||
    !address
  )
    return null;
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    return null;
  if (channel !== "email" && !/^@?[a-zA-Z0-9._-]{1,100}$/.test(address))
    return null;
  if (mention && channel === "email" && !name) return null;
  return {
    channel,
    address,
    name,
    mention,
    normalized: address.replace(/^@/, "").toLowerCase(),
  };
}
export function mentionText(organization: string) {
  return {
    fr: `J’autorise ${organization} à mentionner mon nom et/ou mon identifiant social dans un message à sa communauté.`,
    en: `I authorize ${organization} to mention my name and/or social handle in a message to its community.`,
  };
}
export function contactText(organization: string) {
  return {
    fr: `J’autorise ${organization} à me contacter directement au sujet de ce tirage.`,
    en: `I authorize ${organization} to contact me directly about this draw.`,
  };
}
export async function saveContact(
  db: D1Database,
  pollId: string,
  organization: string,
  contact: NonNullable<ReturnType<typeof parseContact>>,
  draw: Draw | null,
  participationId: string | null,
) {
  const existing = await db
    .prepare(
      "SELECT id FROM contacts WHERE poll_id=? AND channel=? AND normalized_address=?",
    )
    .bind(pollId, contact.channel, contact.normalized)
    .first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  const statements = [
    db
      .prepare(
        "INSERT INTO contacts(id,poll_id,participation_id,display_name,channel,address,normalized_address) VALUES (?,?,?,?,?,?,?) ON CONFLICT(poll_id,channel,normalized_address) DO UPDATE SET display_name=excluded.display_name,address=excluded.address",
      )
      .bind(
        id,
        pollId,
        participationId,
        contact.name || null,
        contact.channel,
        contact.address,
        contact.normalized,
      ),
  ];
  const consent = (
    purpose: string,
    fr: string,
    en: string,
    version: string,
  ) => {
    const consentId = crypto.randomUUID();
    statements.push(
      db
        .prepare(
          "INSERT INTO consents(id,poll_id,contact_id,purpose,text_fr,text_en,version) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(consentId, pollId, id, purpose, fr, en, version),
    );
    return consentId;
  };
  if (contact.mention) {
    const text = mentionText(organization);
    consent("public_mention", text.fr, text.en, "public-mention-v1");
  }
  if (draw) {
    const text = contactText(organization);
    const contactId = consent(
      "draw_contact",
      text.fr,
      text.en,
      "draw-contact-v1",
    );
    const termsId = consent(
      "draw_terms",
      draw.terms_fr,
      draw.terms_en,
      draw.terms_version,
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO draw_entries(id,draw_id,poll_id,contact_id,contact_consent_id,terms_consent_id) VALUES (?,(SELECT id FROM draws WHERE id=? AND enabled=1 AND terms_version=?),?,?,?,?) ON CONFLICT(draw_id,contact_id) DO UPDATE SET contact_consent_id=excluded.contact_consent_id,terms_consent_id=excluded.terms_consent_id`,
        )
        .bind(
          crypto.randomUUID(),
          draw.id,
          draw.terms_version,
          pollId,
          id,
          contactId,
          termsId,
        ),
    );
  }
  await db.batch(statements);
}
