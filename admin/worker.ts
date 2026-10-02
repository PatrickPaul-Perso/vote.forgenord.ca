import { limitedBody } from "../src/lib/request";
import { safeLink, safePhoto } from "../src/lib/polls";
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fields = {
  poll: [
    "organization",
    "title_fr",
    "title_en",
    "description_fr",
    "description_en",
    "status",
    "opens_at",
    "closes_at",
    "proposal_terms_fr",
    "proposal_terms_en",
    "proposal_terms_version",
  ],
  option: [
    "poll_id",
    "name_fr",
    "name_en",
    "description_fr",
    "description_en",
    "image_key",
    "external_url",
    "sort_order",
    "archived",
  ],
  draw: [
    "poll_id",
    "enabled",
    "opens_at",
    "closes_at",
    "terms_fr",
    "terms_en",
    "terms_version",
    "validated_at",
  ],
} as const;
type Row = Record<string, string | number | null>;
function input(name: string, value: unknown) {
  return `<label>${escape(name)} <input name="${name}" value="${escape(value)}" maxlength="5000"></label>`;
}
function form(action: string, id: unknown, body: string) {
  return `<form method="post"><input type="hidden" name="action" value="${action}"><input type="hidden" name="id" value="${escape(id)}">${body}<button>Enregistrer</button></form>`;
}
function validateDate(value: string) {
  if (value && !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))
    throw Error("Dates UTC ISO 8601 requises.");
  if (value && !Number.isFinite(Date.parse(value)))
    throw Error("Date invalide.");
}
export default {
  async fetch(request: Request, env: Pick<Env, "DB">): Promise<Response> {
    const url = new URL(request.url);
    if (!["localhost", "127.0.0.1", "admin"].includes(url.hostname))
      return new Response("Local only", { status: 403 });
    let message = "";
    let status = 200;
    try {
      if (request.method === "POST") {
        if (request.headers.get("origin") !== url.origin)
          throw Error("Origine invalide.");
        const body = await limitedBody(request, 40000);
        if (body === null) throw Error("Formulaire trop volumineux.");
        const data = new URLSearchParams(body);
        const action = data.get("action");
        const id = data.get("id") || crypto.randomUUID();
        if (action === "promo") {
          const poll = data.get("poll_id") ?? "";
          const start = data.get("promo_starts_at") ?? "";
          const end = data.get("promo_ends_at") ?? "";
          validateDate(start);
          validateDate(end);
          if (!start || !end || start >= end)
            throw Error("Période promotionnelle invalide.");
          await env.DB.batch(
            ["promo_code", "promo_starts_at", "promo_ends_at"].map((key) =>
              env.DB.prepare(
                "INSERT INTO poll_parameters(poll_id,key,value) VALUES (?,?,?) ON CONFLICT(poll_id,key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
              ).bind(poll, key, data.get(key) ?? ""),
            ),
          );
        } else if (action === "proposal") {
          const review = data.get("moderation_status");
          if (!["pending", "approved", "rejected"].includes(review ?? ""))
            throw Error("Statut invalide.");
          await env.DB.prepare(
            "UPDATE proposals SET moderation_status=? WHERE participation_id=?",
          )
            .bind(review, id)
            .run();
        } else if (
          action === "poll" ||
          action === "option" ||
          action === "draw"
        ) {
          const names = fields[action];
          const values = names.map((name) => data.get(name) ?? "");
          for (const name of ["opens_at", "closes_at", "validated_at"])
            if (data.has(name)) validateDate(data.get(name) ?? "");
          if (
            data.get("opens_at") &&
            data.get("closes_at") &&
            data.get("opens_at")! >= data.get("closes_at")!
          )
            throw Error("Période invalide.");
          if (action === "poll") {
            if (
              !data.get("organization") ||
              !data.get("title_fr") ||
              !data.get("title_en") ||
              !["draft", "published", "closed"].includes(
                data.get("status") ?? "",
              )
            )
              throw Error("Organisme, titres et statut requis.");
            const exists = await env.DB.prepare(
              "SELECT id FROM polls WHERE id=?",
            )
              .bind(id)
              .first();
            if (!exists) {
              const slug = data.get("slug") ?? "";
              if (
                !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
                ["api", "models", "404"].includes(slug)
              )
                throw Error("Slug invalide ou réservé.");
              await env.DB.prepare(
                "INSERT INTO polls(id,slug,organization,title_fr,title_en) VALUES (?,?,?,?,?)",
              )
                .bind(
                  id,
                  slug,
                  data.get("organization"),
                  data.get("title_fr"),
                  data.get("title_en"),
                )
                .run();
            }
          }
          if (action === "option") {
            if (!data.get("name_fr") || !data.get("name_en"))
              throw Error("Noms FR/EN requis.");
            if (data.get("image_key") && !safePhoto(data.get("image_key")))
              throw Error("Photo invalide.");
            if (data.get("external_url") && !safeLink(data.get("external_url")))
              throw Error("Lien HTTPS invalide.");
            if (
              !/^\d+$/.test(data.get("sort_order") ?? "") ||
              !["0", "1"].includes(data.get("archived") ?? "")
            )
              throw Error("Ordre ou archivage invalide.");
          }
          const table = {
            poll: "polls",
            option: "poll_options",
            draw: "draws",
          }[action];
          const nullable = [
            "opens_at",
            "closes_at",
            "validated_at",
            "image_key",
            "external_url",
          ];
          const binds = values.map((value, index) =>
            nullable.includes(names[index]) && !value ? null : value,
          );
          if (action === "poll")
            await env.DB.prepare(
              `UPDATE polls SET ${names.map((name) => name + "=?").join(",")} WHERE id=?`,
            )
              .bind(...binds, id)
              .run();
          else
            await env.DB.prepare(
              `INSERT INTO ${table}(id,${names.join(",")}) VALUES (?,${names.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${names.map((name) => name + "=excluded." + name).join(",")}`,
            )
              .bind(id, ...binds)
              .run();
        } else throw Error("Action invalide.");
        message = "Enregistré.";
      }
    } catch {
      message =
        "Enregistrement refusé. Vérifiez les champs, dates, liens et modalités.";
      status = 400;
    }
    try {
      const [polls, options, proposals, draws, contacts, consents, entries] =
        await Promise.all(
          [
            "polls",
            "poll_options",
            "proposals",
            "draws",
            "contacts",
            "consents",
            "draw_entries",
          ].map((table) =>
            env.DB.prepare(`SELECT * FROM ${table} LIMIT 200`).all<Row>(),
          ),
        );
      const editors = (kind: "poll" | "option" | "draw", rows: Row[]) =>
        rows
          .map((row) =>
            form(
              kind,
              row.id,
              kind === "poll"
                ? `<p>Slug stable : ${escape(row.slug)}</p>` +
                    fields[kind].map((name) => input(name, row[name])).join("")
                : fields[kind].map((name) => input(name, row[name])).join(""),
            ),
          )
          .join("");
      const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Gestion locale ForgeNord Vote</title><style>body{font:16px system-ui;max-width:950px;margin:auto;padding:20px}form{border:1px solid #ccc;padding:15px;margin:20px 0}label{display:block;margin:8px}input{width:95%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Gestion locale ForgeNord Vote</h1><p>Interface locale. Dates UTC ISO 8601; statut draft/published/closed; enabled et archived : 0 ou 1. Ne valider les modalités qu’après révision humaine. Les noms des champs correspondent aux données enregistrées.</p><p role="status">${escape(message)}</p><h2>Consultations</h2>${editors("poll", polls.results)}<h3>Nouvelle consultation</h3>${form("poll", "", input("slug", "") + fields.poll.map((name) => input(name, name === "status" ? "draft" : "")).join(""))}<h2>Options</h2>${editors("option", options.results)}${form("option", "", fields.option.map((name) => input(name, ["sort_order", "archived"].includes(name) ? "0" : "")).join(""))}<h2>Promotion</h2><p>La valeur existante n’est pas affichée. Saisir le code et sa période pour le remplacer; un code vide le désactive.</p>${form("promo", "", ["poll_id", "promo_code", "promo_starts_at", "promo_ends_at"].map((name) => input(name, "")).join(""))}<h2>Propositions privées</h2>${proposals.results.map((row) => `<pre>${escape(JSON.stringify(row, null, 2))}</pre>` + form("proposal", row.participation_id, input("moderation_status", row.moderation_status))).join("")}<h2>Tirages</h2>${editors("draw", draws.results)}${form("draw", "", fields.draw.map((name) => input(name, name === "enabled" ? "0" : "")).join(""))}<h2>Coordonnées, permissions et inscriptions privées</h2><pre>${escape(JSON.stringify({ contacts: contacts.results, consents: consents.results, entries: entries.results }, null, 2))}</pre></html>`;
      return new Response(html, {
        status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
        },
      });
    } catch {
      return new Response(
        "Gestion indisponible. Appliquez les migrations locales.",
        { status: 503 },
      );
    }
  },
};
