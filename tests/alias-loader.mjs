import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

// Mirrors the bundler's resolution for TypeScript sources: "@/x" maps to
// src/x, and an extensionless import ("./store") tries .ts, .tsx, .mjs and
// index.ts in that order.
async function resolveCandidates(base, context, next) {
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, "index.ts")]) {
    if (existsSync(cand) && isFile(cand)) {
      try { return await next(pathToFileURL(cand).href, context); } catch { /* try next candidate */ }
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const hit = await resolveCandidates(path.join(SRC, specifier.slice(2)), context, next);
    if (hit) return hit;
  } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const hit = await resolveCandidates(path.resolve(parentDir, specifier), context, next);
    if (hit) return hit;
  }
  return next(specifier, context);
}
