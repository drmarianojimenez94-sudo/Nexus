import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const [mode, path] = process.argv.slice(2);
if (!["backup", "restore"].includes(mode) || !path)
  throw Error("Uso: node scripts/backup.mjs backup|restore archivo.nexusbak");
const secret = process.env.NEXUS_BACKUP_KEY;
if (!secret || secret.length < 32)
  throw Error(
    "NEXUS_BACKUP_KEY debe contener al menos 32 caracteres y conservarse fuera del archivo",
  );
const key = createHash("sha256").update(`nexus-backup-v1:${secret}`).digest();
const magic = Buffer.from("NEXUSBK1");
function run(cmd, args, url) {
  const u = new URL(url || "");
  if (!["postgres:", "postgresql:"].includes(u.protocol))
    throw Error("URL PostgreSQL requerida");
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGSSLMODE: u.searchParams.get("sslmode") || "prefer",
  };
  delete env.DATABASE_URL;
  delete env.RESTORE_DATABASE_URL;
  delete env.NEXUS_BACKUP_KEY;
  const r = spawnSync(cmd, args, { env, maxBuffer: 512 * 1024 * 1024 });
  if (r.error || r.status !== 0)
    throw Error(
      `${cmd} no completó la operación; verificar permisos, conexión y versión sin exponer credenciales`,
    );
  return r.stdout;
}
if (mode === "backup") {
  const data = run(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-privileges"],
    process.env.DATABASE_URL,
  );
  try {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(magic);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    writeFileSync(
      path,
      Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]),
      { flag: "wx", mode: 0o600 },
    );
    console.log("Copia cifrada creada");
  } finally {
    data.fill(0);
  }
} else {
  const target = process.env.RESTORE_DATABASE_URL;
  if (!target)
    throw Error("RESTORE_DATABASE_URL requerida: base vacía aislada");
  if (target === process.env.DATABASE_URL)
    throw Error("El destino debe ser una base aislada distinta del origen");
  const input = readFileSync(path);
  if (!input.subarray(0, 8).equals(magic) || input.length < 37)
    throw Error("Archivo de copia inválido");
  const decipher = createDecipheriv("aes-256-gcm", key, input.subarray(8, 20));
  decipher.setAAD(magic);
  decipher.setAuthTag(input.subarray(20, 36));
  const data = Buffer.concat([
    decipher.update(input.subarray(36)),
    decipher.final(),
  ]);
  const folder = mkdtempSync(join(tmpdir(), "nexus-restore-"));
  const dump = join(folder, "restore.dump");
  try {
    const count = run(
      "psql",
      [
        "-At",
        "-c",
        "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')",
      ],
      target,
    )
      .toString()
      .trim();
    if (count !== "0")
      throw Error("La base destino contiene tablas: no se modifica");
    writeFileSync(dump, data, { mode: 0o600, flag: "wx" });
    run(
      "pg_restore",
      [
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        new URL(target).pathname.slice(1),
        dump,
      ],
      target,
    );
    console.log("Restauración completada en base aislada");
  } finally {
    data.fill(0);
    rmSync(folder, { recursive: true, force: true });
  }
}
