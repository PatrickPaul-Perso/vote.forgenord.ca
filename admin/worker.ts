import { AdminDatabase, remoteReady, type AdminEnv } from "./database.ts";
import { limitedBody } from "../src/lib/request.ts";
import { safeLink, safePhoto } from "../src/lib/polls.ts";
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
const labels: Record<string, string> = {
  organization: "Organisme", title_fr: "Titre en français", title_en: "Titre en anglais",
  description_fr: "Description en français", description_en: "Description en anglais",
  status: "État", opens_at: "Ouverture (UTC)", closes_at: "Fermeture (UTC)",
  proposal_terms_fr: "Autorisation des propositions en français", proposal_terms_en: "Autorisation des propositions en anglais",
  proposal_terms_version: "Version de l’autorisation", poll_id: "Consultation",
  name_fr: "Nom en français", name_en: "Nom en anglais", image_key: "Chemin de la photo",
  external_url: "Lien externe HTTPS", sort_order: "Ordre d’affichage", archived: "Option archivée",
  enabled: "Tirage activé", terms_fr: "Modalités en français", terms_en: "Modalités en anglais",
  terms_version: "Version des modalités", validated_at: "Validation des modalités (UTC)",
  slug: "Adresse publique (slug)", promo_code: "Code promotionnel",
  promo_starts_at: "Début de la promotion (UTC)", promo_ends_at: "Fin de la promotion (UTC)",
  moderation_status: "Modération",
};
const choices: Record<string, Record<string, string>> = {
  status: { draft: "Brouillon", published: "Publiée", closed: "Fermée" },
  enabled: { "0": "Non", "1": "Oui — modalités validées" },
  archived: { "0": "Non", "1": "Oui" },
  moderation_status: { pending: "À examiner", approved: "Approuvée", rejected: "Refusée" },
};
function input(name: string, value: unknown) {
  const label = escape(labels[name] ?? name);
  if (choices[name]) return `<label>${label}<select name="${name}">${Object.entries(choices[name]).map(([key, title]) => `<option value="${key}" ${String(value) === key ? "selected" : ""}>${title}</option>`).join("")}</select></label>`;
  if (name.includes("description") || name.includes("terms_fr") || name.includes("terms_en"))
    return `<label>${label}<textarea name="${name}" maxlength="5000" rows="3">${escape(value)}</textarea></label>`;
  const date = name.endsWith("_at");
  return `<label>${label}<input name="${name}" type="${date ? "datetime-local" : "text"}" ${date ? 'step="0.001"' : 'maxlength="5000"'} value="${escape(date ? String(value ?? "").replace(/Z$/, "") : value)}"></label>`;
}
function renderForm(
  action: string,
  id: unknown,
  body: string,
  target: "local" | "remote",
) {
  return `<form method="post" action="?target=${target}"><input type="hidden" name="target" value="${target}"><input type="hidden" name="action" value="${action}"><input type="hidden" name="id" value="${escape(id)}">${body}<button>Enregistrer</button></form>`;
}
function validateDate(value: string) {
  if (value && !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))
    throw Error("Dates UTC ISO 8601 requises.");
  if (value && !Number.isFinite(Date.parse(value)))
    throw Error("Date invalide.");
}
export default {
  async fetch(request: Request, env: AdminEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!["localhost", "127.0.0.1", "admin"].includes(url.hostname))
      return new Response("Local only", { status: 403 });
    const selected = url.searchParams.get("target") ?? "local";
    if (selected !== "local" && selected !== "remote")
      return new Response("Cible invalide.", { status: 400 });
    const target = selected;
    if (target === "remote" && !remoteReady(env))
      return new Response(
        "Accès distant indisponible. Transmettez le jeton, le compte et la configuration D1 au conteneur.",
        { status: 503 },
      );
    const database = new AdminDatabase(env, target);
    const form = (action: string, id: unknown, body: string) =>
      renderForm(action, id, body, target);
    let message = "";
    let status = 200;
    try {
      if (request.method === "POST") {
        if (request.headers.get("origin") !== url.origin)
          throw Error("Origine invalide.");
        const body = await limitedBody(request, 40000);
        if (body === null) throw Error("Formulaire trop volumineux.");
        const data = new URLSearchParams(body);
        if (target === "remote" && data.get("target") !== target)
          throw Error("Cible distante non confirmée.");
        // The date pickers display UTC, independently of the browser timezone.
        for (const name of ["opens_at", "closes_at", "validated_at", "promo_starts_at", "promo_ends_at"]) {
          const value = data.get(name);
          if (value && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{3})?)?$/.test(value))
            data.set(name, value + (value.length === 16 ? ":00Z" : "Z"));
        }
        const action = data.get("action");
        const id = data.get("id") || crypto.randomUUID();
        if (action === "promo") {
          const poll = data.get("poll_id") ?? "";
          const start = data.get("promo_starts_at") ?? "";
          const end = data.get("promo_ends_at") ?? "";
          validateDate(start);
          validateDate(end);
          if (!start || !end || Date.parse(start) >= Date.parse(end))
            throw Error("Période promotionnelle invalide.");
          await database.batch(
            ["promo_code", "promo_starts_at", "promo_ends_at"].map((key) =>
              database
                .prepare(
                  "INSERT INTO poll_parameters(poll_id,key,value) VALUES (?,?,?) ON CONFLICT(poll_id,key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
                )
                .bind(poll, key, data.get(key) ?? ""),
            ),
          );
        } else if (action === "proposal") {
          const review = data.get("moderation_status");
          if (!["pending", "approved", "rejected"].includes(review ?? ""))
            throw Error("Statut invalide.");
          await database
            .prepare(
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
            Date.parse(data.get("opens_at")!) >= Date.parse(data.get("closes_at")!)
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
            const exists = await database
              .prepare("SELECT id FROM polls WHERE id=?")
              .bind(id)
              .first();
            if (!exists) {
              const slug = data.get("slug") ?? "";
              if (
                !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
                ["api", "models", "404"].includes(slug)
              )
                throw Error("Slug invalide ou réservé.");
              await database
                .prepare(
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
            await database
              .prepare(
                `UPDATE polls SET ${names.map((name) => name + "=?").join(",")} WHERE id=?`,
              )
              .bind(...binds, id)
              .run();
          else
            await database
              .prepare(
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
            database.prepare(`SELECT * FROM ${table} LIMIT 200`).all<Row>(),
          ),
        );
      const parameters = await database.prepare("SELECT poll_id,key,value FROM poll_parameters WHERE key IN ('promo_code','promo_starts_at','promo_ends_at')").all<Row>();
      const pollSelect = (value: unknown) => `<label>Consultation<select name="poll_id" required><option value="">Choisir une consultation</option>${polls.results.map(row => `<option value="${escape(row.id)}" ${row.id === value ? "selected" : ""}>${escape(row.title_fr)} — ${escape(row.slug)}</option>`).join("")}</select></label>`;
      const field = (name: string, value: unknown) => name === "poll_id" ? pollSelect(value) : input(name, value);
      const promotions = polls.results.map(poll => {
        const values = Object.fromEntries(parameters.results.filter(row => row.poll_id === poll.id).map(row => [row.key, row.value]));
        return `<article><h3>${escape(poll.title_fr)}</h3><p>${values.promo_code ? "Code configuré" : "Aucun code actif"}</p>` + form("promo", "", `<input type="hidden" name="poll_id" value="${escape(poll.id)}"><details><summary>Afficher ou modifier le code promotionnel</summary>${input("promo_code", values.promo_code)}</details>${input("promo_starts_at", values.promo_starts_at)}${input("promo_ends_at", values.promo_ends_at)}<p class="hint">Un code vide désactive la promotion. Les dates sont en UTC.</p>`) + `</article>`;
      }).join("");
      const editors = (kind: "poll" | "option" | "draw", rows: Row[]) =>
        rows
          .map((row) =>
            form(
              kind,
              row.id,
              kind === "poll"
                ? `<p>Slug stable : ${escape(row.slug)}</p>` +
                    fields[kind].map((name) => field(name, row[name])).join("")
                : fields[kind].map((name) => field(name, row[name])).join(""),
            ),
          )
          .join("");
      const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gestion ForgeNord Vote</title><style>
      *{box-sizing:border-box}body{font:16px/1.5 system-ui;background:#f4f6fa;color:#192b3b;max-width:1100px;margin:auto;padding:24px}h1{margin-bottom:4px}h2{margin-top:36px}nav{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}a{color:#125b7b}form,article{background:white;border:1px solid #d6dfe7;border-radius:12px;padding:20px;margin:16px 0}article form{border:0;padding:0}label{display:block;margin:14px 0;font-weight:600}input,select,textarea{display:block;width:100%;font:inherit;border:1px solid #aab9c6;border-radius:6px;padding:10px;margin-top:5px}button{font:inherit;font-weight:600;background:#125b7b;color:white;border:0;border-radius:6px;padding:10px 18px;cursor:pointer}button:hover{background:#093e56}input:focus,select:focus,textarea:focus,button:focus,summary:focus{outline:3px solid #df9d25;outline-offset:2px}summary{cursor:pointer;font-weight:600;padding:8px 0}.target,.message{padding:16px;border-radius:8px;background:#dceef7}.remote{background:#fff0d1;border:2px solid #b86c00}.error{background:#ffe0df}.hint{color:#536777;font-size:.9rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{scroll-margin-top:20px}
      </style></head><body><header><h1>Gestion ForgeNord Vote</h1><p>Gérez vos consultations et leurs promotions.</p></header>
      <form method="get"><label>Base de données<select name="target"><option value="local" ${target === "local" ? "selected" : ""}>Locale — cet ordinateur</option><option value="remote" ${target === "remote" ? "selected" : ""} ${remoteReady(env) ? "" : "disabled"}>Cloudflare — production</option></select></label><button>Afficher cette base</button></form>
      <p class="target ${target === "remote" ? "remote" : ""}" role="status"><strong>${target === "remote" ? "PRODUCTION" : "BASE LOCALE"}</strong> — ${target === "remote" ? "Les enregistrements modifient immédiatement les données de production." : "Les modifications restent sur cet ordinateur."}</p>
      <nav aria-label="Sections de gestion"><a href="#promotions">Promotions</a><a href="#consultations">Consultations</a><a href="#options">Options</a><a href="#propositions">Propositions</a><a href="#tirages">Tirages</a><a href="#coordonnees">Coordonnées</a></nav>
      ${message ? `<p class="message ${status === 400 ? "error" : ""}" role="${status === 400 ? "alert" : "status"}">${escape(message)}</p>` : ""}
      <section id="promotions"><h2>Promotions</h2><p>Modifiez le code et sa période dans la consultation concernée. Aucun build nécessaire.</p>${promotions || "<p>Créez d’abord une consultation.</p>"}</section>
      <section id="consultations"><h2>Consultations</h2>${editors("poll", polls.results)}<details><summary>Créer une consultation</summary>${form("poll", "", input("slug", "") + fields.poll.map((name) => field(name, name === "status" ? "draft" : "")).join(""))}</details></section>
      <section id="options"><h2>Options</h2>${editors("option", options.results)}<details><summary>Ajouter une option</summary>${form("option", "", fields.option.map((name) => field(name, ["sort_order", "archived"].includes(name) ? "0" : "")).join(""))}</details></section>
      <section id="propositions"><h2>Propositions privées</h2>${proposals.results.map(row => `<pre>${escape(JSON.stringify(row, null, 2))}</pre>` + form("proposal", row.participation_id, input("moderation_status", row.moderation_status))).join("")}</section>
      <section id="tirages"><h2>Tirages</h2><p>Ne validez les modalités qu’après révision humaine.</p>${editors("draw", draws.results)}<details><summary>Créer un tirage</summary>${form("draw", "", fields.draw.map((name) => field(name, name === "enabled" ? "0" : "")).join(""))}</details></section>
      <section id="coordonnees"><h2>Coordonnées et permissions privées</h2><details><summary>Afficher les coordonnées, permissions et inscriptions</summary><pre>${escape(JSON.stringify({ contacts: contacts.results, consents: consents.results, entries: entries.results }, null, 2))}</pre></details></section></body></html>`;
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
        "Gestion indisponible. Vérifiez la connexion et les migrations de la base sélectionnée.",
        { status: 503 },
      );
    }
  },
};
