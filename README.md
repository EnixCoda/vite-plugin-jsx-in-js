# vite-plugin-jsx-in-js

[![CI](https://github.com/EnixCoda/vite-plugin-jsx-in-js/actions/workflows/ci.yml/badge.svg)](https://github.com/EnixCoda/vite-plugin-jsx-in-js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/vite-plugin-jsx-in-js.svg)](https://www.npmjs.com/package/vite-plugin-jsx-in-js)

Treat `.js` files as JSX modules in Vite so React Refresh can process legacy React code without renaming every file to `.jsx` or `.tsx`.

> ⚠️ Vite team has disabled react refresh for JSX in `.js` files on purpose. [[↗️ 1](https://github.com/vitejs/vite/blob/a5763266170f8606836da5c6f987b4b2fd6ddc55/packages/vite/src/node/plugins/oxc.ts#L251)] [[↗️ 2](https://github.com/rolldown/rolldown/blob/426536752c85c35a1c61800ac23d74eb43239259/crates/rolldown_plugin_vite_react_refresh_wrapper/src/lib.rs#L131)]
>
> It is not recommended to use this plugin for new projects. This plugin is a workaround to restore that behavior for legacy React codebases without renaming every file to `.jsx` or `.tsx`.

## Install

```sh
npm install -D vite-plugin-jsx-in-js
```

Vite 5, 6, 7, and 8 are supported. This plugin need to be use with `@vitejs/plugin-react`.

## Usage

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import jsxInJs from "vite-plugin-jsx-in-js";

export default defineConfig({
  plugins: [
    jsxInJs({
      // include: /^(?!.*node_modules).*\.js$/,
    }),
    react({
      runtime: "classic",
    }),
  ],
});
```

## Options

### `include`

Type: `RegExp`  
Default: `/^(?!.*node_modules).*\.js$/`, includes all `.js` files except those in `node_modules`.

## How It Works

The plugin resolves matching `.js` modules to virtual `.js.jsx` ids, loads the original file contents, and mirrors hot updates onto the shimmed module. That lets Vite and React Refresh treat legacy `.js` React modules like JSX while keeping the files in place.

## Limitations

Since this plugin works by virtualizing `.js` files as `.js.jsx`, you may see `.js.jsx` instead of `.js` in places like stack traces and dev tools.

## License

MIT
