import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, "index.ts")]) {
      if (existsSync(cand) && !cand.endsWith(path.sep)) {
        try { return await next(pathToFileURL(cand).href, context); } catch { /* try next candidate */ }
      }
    }
  }
  return next(specifier, context);
}
