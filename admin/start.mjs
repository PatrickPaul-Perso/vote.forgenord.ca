import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { getCACertificates } from "node:tls";
const directory = mkdtempSync(join(tmpdir(), "forgenord-admin-"));
try {
  const config = JSON.parse(readFileSync("admin/wrangler.jsonc", "utf8"));
  config.main = resolve("admin/worker.ts");
  config.d1_databases[0].migrations_dir = resolve("migrations");
  writeFileSync(join(directory, "wrangler.jsonc"), JSON.stringify(config), {
    mode: 0o600,
  });
  let databaseId = process.env.FORGENORD_D1_DATABASE_ID;
  if (!databaseId) {
    try {
      databaseId = JSON.parse(
        readFileSync("wrangler.production.jsonc", "utf8"),
      ).d1_databases.find((binding) => binding.binding === "DB")?.database_id;
    } catch {}
  }
  const variables = {
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    FORGENORD_D1_DATABASE_ID: databaseId,
  };
  writeFileSync(
    join(directory, ".dev.vars"),
    Object.entries(variables)
      .filter(([, value]) => value)
      .map(([key, value]) => key + "=" + JSON.stringify(value))
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  const certificatePath = join(directory, "trusted-certificates.pem");
  writeFileSync(certificatePath, getCACertificates("default").join("\n"), {
    mode: 0o600,
  });
  const child = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--config",
      join(directory, "wrangler.jsonc"),
      "--local",
      "--persist-to",
      resolve(".wrangler/state"),
      "--ip",
      "0.0.0.0",
      "--port",
      "8788",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, NODE_EXTRA_CA_CERTS: certificatePath },
    },
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => child.kill(signal));
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
