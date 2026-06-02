# Contributing

Thanks for helping improve `vite-plugin-jsx-in-js`.

## Local Setup

Use a Node.js version supported by Vite 8 for local development, currently `^20.19.0 || >=22.12.0`.

```sh
npm install
npm run check
```

## Pull Requests

- Keep changes focused on one behavior or maintenance task.
- Add or update tests when plugin behavior changes.
- Run `npm run check` before opening a pull request.
- Open issues and pull requests at https://github.com/EnixCoda/vite-plugin-jsx-in-js.

## Releases

This project does not prescribe a release workflow yet. Before publishing, verify the generated package with:

```sh
npm run build
npm pack --dry-run
```
