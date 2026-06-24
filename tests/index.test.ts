import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import jsxInJs, { jsxShim } from "../src/index";

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "vite-plugin-jsx-in-js-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("jsxInJs", () => {
  it("exports jsxShim as a compatibility alias", () => {
    expect(jsxShim).toBe(jsxInJs);
  });

  it("marks included .js modules as .jsx during resolution", async () => {
    const plugin = jsxInJs();
    const resolve = vi.fn(async (source: string) => ({
      id: source,
      meta: { existing: true },
    }));

    const resolved = await (plugin.resolveId as any).call({ resolve }, "/project/src/Component.js", undefined, {});

    expect(resolve).toHaveBeenCalledWith("/project/src/Component.js", undefined, { skipSelf: true });
    expect(resolved).toEqual({
      id: "/project/src/Component.js.jsx",
      meta: { existing: true },
    });
  });

  it("resolves shimmed importers back to their real module ids", async () => {
    const plugin = jsxInJs();
    const resolve = vi.fn(async (source: string) => ({ id: source }));

    await (plugin.resolveId as any).call({ resolve }, "./Child.js", "/project/src/Parent.js.jsx", {});

    expect(resolve).toHaveBeenCalledWith("./Child.js", "/project/src/Parent.js", {
      skipSelf: true,
    });
  });

  it("preserves query strings when adding the shim suffix", async () => {
    const plugin = jsxInJs();
    const resolve = vi.fn(async () => ({ id: "/project/src/Component.js?v=123" }));

    const resolved = await (plugin.resolveId as any).call(
      { resolve },
      "/project/src/Component.js?v=123",
      undefined,
      {},
    );

    expect(resolved).toEqual({
      id: "/project/src/Component.js.jsx?v=123",
    });
  });

  it("does not shim non-JavaScript Vite query imports", async () => {
    const plugin = jsxInJs();
    const rawResult = { id: "/project/src/fixture.js?raw" };
    const resolve = vi.fn(async () => rawResult);

    const resolved = await (plugin.resolveId as any).call({ resolve }, "/project/src/fixture.js?raw", undefined, {});

    expect(resolved).toBe(rawResult);
  });

  it("loads shimmed modules from the real source file", async () => {
    const plugin = jsxInJs();
    const directory = await createTemporaryDirectory();
    const realFile = join(directory, "Component.js");
    const code = "export const Component = () => <main />;\n";
    await writeFile(realFile, code);

    const addWatchFile = vi.fn();
    const loaded = await (plugin.load as any).call({ addWatchFile }, `${realFile}.jsx`);

    expect(addWatchFile).toHaveBeenCalledWith(realFile);
    expect(loaded.code).toBe(code);
  });

  it("returns an identity source map pointing to the real .js file", async () => {
    const plugin = jsxInJs();
    const directory = await createTemporaryDirectory();
    const realFile = join(directory, "Component.js");
    const code = "line1\nline2\nline3\n";
    await writeFile(realFile, code);

    const addWatchFile = vi.fn();
    const loaded = await (plugin.load as any).call({ addWatchFile }, `${realFile}.jsx`);

    expect(loaded.map.sources).toEqual([realFile]);
    expect(loaded.map.sourcesContent).toEqual([code]);
    // 4 lines (including trailing empty after final \n) → AAAA + 3×;AACA
    expect(loaded.map.mappings).toBe("AAAA;AACA;AACA;AACA");
  });

  it("forwards an existing sibling .js.map instead of synthesizing one", async () => {
    const plugin = jsxInJs();
    const directory = await createTemporaryDirectory();
    const realFile = join(directory, "Component.js");
    const code = "export const Component = () => null;\n//# sourceMappingURL=Component.js.map\n";
    const existingMap = {
      version: 3,
      sources: ["Component.ts"],
      sourcesContent: ["export const Component = (): null => null;\n"],
      names: [],
      mappings: "AAAA",
    };
    await writeFile(realFile, code);
    await writeFile(join(directory, "Component.js.map"), JSON.stringify(existingMap));

    const addWatchFile = vi.fn();
    const loaded = await (plugin.load as any).call({ addWatchFile }, `${realFile}.jsx`);

    expect(loaded.code).toBe(code);
    expect(loaded.map).toEqual(existingMap);
  });

  it("forwards an inline data-URI source map", async () => {
    const plugin = jsxInJs();
    const directory = await createTemporaryDirectory();
    const realFile = join(directory, "Component.js");
    const existingMap = {
      version: 3,
      sources: ["Component.ts"],
      sourcesContent: ["export const Component = (): null => null;\n"],
      names: [],
      mappings: "AAAA",
    };
    const base64 = Buffer.from(JSON.stringify(existingMap)).toString("base64");
    const code = `export const Component = () => null;\n//# sourceMappingURL=data:application/json;base64,${base64}\n`;
    await writeFile(realFile, code);

    const addWatchFile = vi.fn();
    const loaded = await (plugin.load as any).call({ addWatchFile }, `${realFile}.jsx`);

    expect(loaded.map).toEqual(existingMap);
  });

  it("adds the shimmed module to hot update payloads", () => {
    const plugin = jsxInJs();
    const realModule = { id: "/project/src/Component.js" };
    const shimmedModule = { id: "/project/src/Component.js.jsx" };
    const getModuleById = vi.fn(() => shimmedModule);

    const modules = (plugin.handleHotUpdate as any)({
      file: "/project/src/Component.js",
      modules: [realModule],
      server: {
        moduleGraph: { getModuleById },
      },
    });

    expect(getModuleById).toHaveBeenCalledWith("/project/src/Component.js.jsx");
    expect(modules).toEqual([realModule, shimmedModule]);
  });

  it("respects custom include filters", async () => {
    const plugin = jsxInJs({ include: /legacy\/.*\.js$/ });
    const resolve = vi.fn(async (source: string) => ({ id: source }));

    const skipped = await (plugin.resolveId as any).call({ resolve }, "/project/src/Component.js", undefined, {});
    const shimmed = await (plugin.resolveId as any).call(
      { resolve },
      "/project/src/legacy/Component.js",
      undefined,
      {},
    );

    expect(skipped).toEqual({ id: "/project/src/Component.js" });
    expect(shimmed).toEqual({
      id: "/project/src/legacy/Component.js.jsx",
    });
  });
});
