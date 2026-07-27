import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();

function resolveAliasPath(specifier) {
    if (!specifier.startsWith("@/")) return "";
    return path.join(rootDir, "src", specifier.slice(2));
}

function resolveExistingFile(filePath) {
    const candidates = [filePath, `${filePath}.ts`, `${filePath}.tsx`, `${filePath}.js`, `${filePath}.jsx`, path.join(filePath, "index.ts"), path.join(filePath, "index.tsx")];
    return candidates.find((candidate) => existsSync(candidate)) || filePath;
}

export async function resolve(specifier, context, nextResolve) {
    const aliasPath = resolveAliasPath(specifier);
    if (!aliasPath) return nextResolve(specifier, context);

    return nextResolve(pathToFileURL(resolveExistingFile(aliasPath)).href, context);
}
