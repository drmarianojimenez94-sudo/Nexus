/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateVertical } from "./evaluation";
import { applyNativePermissions } from "./native";
import { formatScorecard, scoreVertical } from "./rubric";
import { scaffoldSource } from "./scaffold";

const here = dirname(fileURLToPath(import.meta.url));
const [command, ...args] = process.argv.slice(2);

async function main() {
  if (command === "new") {
    const [id, ...rest] = args;
    if (!id || !/^[a-z][a-z0-9-]{1,47}$/.test(id)) throw new Error("Uso: new <id> --name «…» --profession «…» --subject singular/plural --record singular/plural");
    const flag = (n: string) => {
      const i = rest.indexOf(`--${n}`);
      return i >= 0 ? rest[i + 1] : undefined;
    };
    const pair = (v: string | undefined, fallback: string) => {
      const [singular, plural] = (v ?? fallback).split("/");
      return { singular: singular!, plural: plural ?? `${singular}s` };
    };
    const dir = join(here, "verticals", id);
    if (existsSync(join(dir, "manifest.ts"))) throw new Error(`Ya existe ${dir}/manifest.ts`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "manifest.ts"),
      scaffoldSource({
        id,
        name: flag("name") ?? `Nexus ${id}`,
        profession: flag("profession") ?? id,
        subject: pair(flag("subject"), "cliente/clientes"),
        record: pair(flag("record"), "registro/registros"),
        profile: flag("profile"),
      }),
    );
    console.log(`Creado ${dir}/manifest.ts. Registralo en src/registry.ts y corré: pnpm --filter @nexus/verticals score ${id}`);
    return;
  }
  const { VERTICALS } = await import("./registry");
  if (command === "score") {
    const ids = args.length ? args : Object.keys(VERTICALS);
    let failed = false;
    for (const id of ids) {
      const v = VERTICALS[id];
      if (!v) throw new Error(`Vertical desconocida: ${id}`);
      const evaluation = evaluateVertical(v.manifest, v.adapter);
      const card = scoreVertical(v.manifest, evaluation);
      console.log(formatScorecard(card));
      console.log(`  Evaluación: ${evaluation.passed}/${evaluation.cases} casos, ${evaluation.majorErrors} errores mayores, ${evaluation.minorErrors} menores, evidencia ${(evaluation.evidenceCoverage * 100).toFixed(0)}%`);
      for (const r of evaluation.results.filter((x) => x.errors.length)) console.log(`    · ${r.id}: ${r.errors.map((e) => `[${e.severity}] ${e.detail}`).join("; ")}`);
      console.log("");
      if (v.manifest.status !== "draft" && !card.passed) failed = true;
    }
    if (failed) process.exitCode = 1;
    return;
  }
  if (command === "native") {
    const [id = "medicine", path = join(here, "../../../apps/mobile/app.json")] = args;
    const v = VERTICALS[id];
    if (!v) throw new Error(`Vertical desconocida: ${id}`);
    const config = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, `${JSON.stringify(applyNativePermissions(config, v.manifest), null, 2)}\n`);
    console.log(`Permisos nativos de ${id} aplicados a ${path}`);
    return;
  }
  console.log("Comandos: score [id…] | new <id> [--name …] [--profession …] [--subject a/b] [--record a/b] [--profile …] | native [id] [app.json]");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
