export type AdminEnv = Pick<Env, "DB"> & {
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  FORGENORD_D1_DATABASE_ID?: string;
};
type Query = { sql: string; params: (string | number | null)[] };
type Result = { results: unknown[]; success?: boolean };
export function remoteReady(env: AdminEnv) {
  return (
    !!env.CLOUDFLARE_API_TOKEN &&
    /^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? "") &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
      env.FORGENORD_D1_DATABASE_ID ?? "",
    ) &&
    env.FORGENORD_D1_DATABASE_ID !== "00000000-0000-4000-8000-000000000000"
  );
}
export class AdminDatabase {
  private env: AdminEnv;
  private target: "local" | "remote";
  private transport: typeof fetch;
  constructor(
    env: AdminEnv,
    target: "local" | "remote",
    transport: typeof fetch = fetch,
  ) {
    this.env = env;
    this.target = target;
    this.transport = transport;
    if (target === "remote" && !remoteReady(env))
      throw Error("Configuration Cloudflare absente ou invalide.");
  }
  prepare(sql: string) {
    return new Statement(this, { sql, params: [] });
  }
  async execute(queries: Query[]): Promise<Result[]> {
    if (this.target === "local") {
      const prepared = queries.map((q) =>
        this.env.DB.prepare(q.sql).bind(...q.params),
      );
      return this.env.DB.batch(prepared);
    }
    const transport = this.transport;
    const response = await transport(
      `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${this.env.FORGENORD_D1_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          queries.length === 1 ? queries[0] : { batch: queries },
        ),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw Error("Accès Cloudflare refusé ou indisponible.");
    const data = (await response.json()) as {
      success?: boolean;
      result?: Result[];
    };
    if (
      !data.success ||
      !data.result ||
      data.result.length !== queries.length ||
      data.result.some((r) => r.success !== true)
    )
      throw Error("Opération D1 refusée.");
    return data.result;
  }
  batch(statements: Statement[]) {
    return this.execute(statements.map((s) => s.query));
  }
}
class Statement {
  private database: AdminDatabase;
  readonly query: Query;
  constructor(database: AdminDatabase, query: Query) {
    this.database = database;
    this.query = query;
  }
  bind(...params: Query["params"]) {
    return new Statement(this.database, { sql: this.query.sql, params });
  }
  async all<T>() {
    const [result] = await this.database.execute([this.query]);
    return { results: result.results as T[] };
  }
  async first<T = Record<string, unknown>>() {
    return (await this.all<T>()).results[0] ?? null;
  }
  run() {
    return this.database.execute([this.query]);
  }
}
