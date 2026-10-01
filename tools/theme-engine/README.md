# Local Theme Settings

Start the control panel from the theme root:

```sh
node tools/theme-engine/server.mjs
```

Open `http://127.0.0.1:4173`. The panel reads `config/settings_schema.json` and saves supported global settings to `config/settings_data.json`. Its recipe cards can build and download a selected theme ZIP. Keep `shopify theme dev` running in another terminal for setting changes to sync to the development theme.

The server binds only to `127.0.0.1`, uses Node's built-in modules, and does not expose the settings API to the network. It edits saved setting values only; it does not alter the schema, templates, or section content.

## Build recipe variants

The first generator prototype creates two complete Shopify theme folders and ZIPs that differ only in the homepage hero section. Each output is checked and packaged automatically. The local panel can build a selected recipe and offer its ZIP for download:

```sh
node tools/theme-engine/build-recipes.mjs
```

Output is written under a timestamped folder inside `dist/`, which is ignored by Git. `split-hero` uses the existing split hero; `centered-hero` selects the new centered hero. The builder copies the Shopify theme directories, checks that all recipe hero sections expose the same setting IDs and types, runs `shopify theme check` for each complete build, and creates an uploadable ZIP. The homepage's saved copy, links, and image selection are preserved.

To build into a specific fresh alternate output directory, pass a path under `dist/`. To build only one recipe, add its ID after the output path, for example `node tools/theme-engine/build-recipes.mjs dist/my-test centered-hero`. Existing recipe output folders are never overwritten. The build process does not upload themes to Shopify.