import { readFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import type { Plugin } from "vite";

const sourceMappingURLRE = /\/\/#\s*sourceMappingURL=([^\s'"]+)\s*$/;

/**
 * Read any source map already associated with `code` so it can be forwarded
 * instead of being shadowed by a synthesized identity map. Handles both inline
 * data URIs and sibling `.map` files (e.g. TypeScript-compiled output that ships
 * with a companion `.js.map`). Returns null when the source carries no map.
 */
const readExistingSourceMap = async (file: string, code: string) => {
    const match = sourceMappingURLRE.exec(code.trimEnd());
    if (!match) return null;

    const url = match[1];
    const dataUriMatch = /^data:application\/json[^,]*?(;base64)?,(.*)$/.exec(url);
    try {
        if (dataUriMatch) {
            const [, base64, payload] = dataUriMatch;
            const json = base64
                ? Buffer.from(payload, "base64").toString("utf-8")
                : decodeURIComponent(payload);
            return JSON.parse(json);
        }

        // Ignore absolute/remote URLs; only resolve sibling map files.
        if (/^[a-z]+:\/\//i.test(url)) return null;
        const mapPath = resolvePath(dirname(file), url);
        return JSON.parse(await readFile(mapPath, "utf-8"));
    } catch {
        return null;
    }
};

const JSX_SHIM_SUFFIX = ".jsx";
const DEFAULT_INCLUDE = /^(?!.*node_modules).*\.js$/;
const nonJavaScriptQueryRE = /(?:\?|&)(?:raw|url|worker|sharedworker)(?:&|$|=)/;

export interface JsxInJsOptions {
    /** Files that should be loaded through the JSX shim. */
    include?: RegExp;
}

interface SplitId {
    path: string;
    query: string;
}

/**
 * Make selected .js modules look like .jsx modules to Vite so React Refresh can
 * process legacy React files without renaming them.
 */
export function jsxInJs({ include = DEFAULT_INCLUDE }: JsxInJsOptions = {}): Plugin {
    const splitId = (id: string): SplitId => {
        const match = /([^?#]*)([?#].*)?/.exec(id);
        return {
            path: match?.[1] ?? id,
            query: match?.[2] ?? "",
        };
    };

    const getCleanId = (id: string) => splitId(id).path;

    const matchesInclude = (id: string) => {
        include.lastIndex = 0;
        return include.test(id);
    };

    const isIncluded = (id: string) => {
        if (nonJavaScriptQueryRE.test(id)) return;

        const cleanId = getCleanId(id);
        if (!cleanId || !matchesInclude(cleanId)) return;
        return cleanId;
    };

    const isShimmed = (id: string) => {
        const cleanId = getCleanId(id);
        if (!cleanId.endsWith(`.js${JSX_SHIM_SUFFIX}`)) return false;
        return Boolean(isIncluded(cleanId.slice(0, -JSX_SHIM_SUFFIX.length)));
    };

    const toShimmed = (id: string) => {
        if (isShimmed(id)) return id;

        const { path, query } = splitId(id);
        return `${path}${JSX_SHIM_SUFFIX}${query}`;
    };

    const toReal = (id: string) => {
        const { path, query } = splitId(id);
        return `${path.slice(0, -JSX_SHIM_SUFFIX.length)}${query}`;
    };

    return {
        name: "vite-plugin-jsx-in-js",
        enforce: "pre",

        async resolveId(source, importer, options) {
            const realImporter =
                importer && isShimmed(importer) ? toReal(importer) : importer;
            const realSource = isShimmed(source) ? toReal(source) : source;

            const resolved = await this.resolve(realSource, realImporter, {
                ...options,
                skipSelf: true,
            });
            if (!resolved?.id || !isIncluded(resolved.id)) return resolved;

            return {
                ...resolved,
                id: toShimmed(resolved.id),
            };
        },

        async load(id) {
            if (!isShimmed(id)) return null;

            const real = getCleanId(toReal(id));
            this.addWatchFile(real);
            const code = await readFile(real, "utf-8");

            // If the source already ships a map (inline or sibling .js.map, e.g.
            // TS-compiled output), forward it so devtools keeps mapping back to
            // the original source instead of the shim id.
            const existing = await readExistingSourceMap(real, code);
            if (existing) return { code, map: existing };

            // Otherwise return an identity map so .js.map sources reference the
            // real .js file on disk rather than the virtual .js.jsx shim id.
            const lineCount = code.split("\n").length;
            return {
                code,
                map: {
                    version: 3 as const,
                    sources: [real],
                    sourcesContent: [code],
                    names: [],
                    mappings: lineCount > 0 ? `AAAA${";AACA".repeat(lineCount - 1)}` : "",
                },
            };
        },

        handleHotUpdate(ctx) {
            if (!isIncluded(ctx.file)) return;

            const shimmedModule = ctx.server.moduleGraph.getModuleById(
                toShimmed(ctx.file),
            );
            if (!shimmedModule) return;

            return ctx.modules.includes(shimmedModule)
                ? ctx.modules
                : [...ctx.modules, shimmedModule];
        },
    };
}

export const jsxShim = jsxInJs;
export default jsxInJs;
