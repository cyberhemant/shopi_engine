# Shopify Theme: Project Guide for Claude Code

@PROJECT_CONTEXT.md

## Overview
This is a Shopify Online Store 2.0 theme. Merchants customize it through the theme editor, so every visual decision must be exposed as a setting, not hardcoded.

## Commands
- `shopify theme dev --store test-engine.myshopify.com` : live preview (already running in another terminal)
- `shopify theme check` : Liquid linter. Run after every meaningful change and fix all errors before finishing.
- `shopify theme push --unpublished` : push to a new unpublished theme (only when I ask)
- Never run `shopify theme push --live` or `theme delete` unless I explicitly ask.

## Folder layout
- `layout/` : theme.liquid and other layouts
- `templates/` : JSON templates (prefer JSON over .liquid templates)
- `sections/` : merchant-configurable sections, each with a `{% schema %}`
- `blocks/` : reusable theme blocks
- `snippets/` : small reusable Liquid partials (no schema)
- `assets/` : CSS, JS, images
- `config/settings_schema.json` : global theme settings (the "engine" definition)
- `config/settings_data.json` : saved values. Do not hand-edit unless asked.
- `locales/` : translation files. Every user-facing string goes through `t` filters.

## The theme engine: design token system
All styling flows from global settings to CSS variables to components.

1. Global settings live in `config/settings_schema.json`, grouped as: Colors, Typography, Layout, Buttons, Cards.
2. `snippets/css-variables.liquid` reads those settings and outputs `:root { --color-*, --font-*, --space-*, --radius-* }`. It is rendered once in `layout/theme.liquid`.
3. Color schemes use Shopify's `color_scheme_group` setting. Each scheme defines background, text, button, and accent colors, applied via `.color-{{ scheme.id }}` classes.
4. Components only consume CSS variables.

## Rules
- **Never hardcode** colors, font families, spacing, or radii in CSS or inline styles. Use variables.
- Every section needs a `{% schema %}` with a `name`, `settings`, `presets` (if it should be addable), and sensible defaults.
- Use `blocks` in schemas for repeatable content. Cap `max_blocks` sensibly.
- Section-specific CSS goes in `{% stylesheet %}`, JS in `{% javascript %}`, or in `assets/` if shared.
- Use `{{ 'file.css' | asset_url | stylesheet_tag }}` and load non-critical assets with `defer` or `media="print"` patterns.
- Images: use `image_tag` with `widths`, `sizes`, and `loading: 'lazy'` (eager for above-the-fold hero images).
- Support merchant edits: use `{{ block.shopify_attributes }}` and `{{ section.id }}` correctly so the theme editor works.
- Accessibility: semantic HTML, visible focus states, alt text, keyboard-operable menus, WCAG AA contrast.
- Vanilla JS and web components only. No jQuery or heavy frameworks.
- Mobile first. Breakpoints are defined as CSS variables or a single shared list. Do not invent new ones per component.
- Keep Liquid readable: prefer `{%- liquid -%}` blocks for logic-heavy code, and comment non-obvious logic.

## Composition model
- Sections and blocks are what the merchant controls. Snippets are developer-side partials.
- Snippets take explicit parameters and never read `section.settings` directly. The parent section passes everything in.
- Any variation a merchant should control must be a setting or block.

## Workflow
1. Before editing, read the related section/snippet and existing conventions.
2. Make small, focused changes. One feature per commit.
3. After changes: run `shopify theme check`, fix issues, and tell me what to verify in the preview.
4. At the end of each session, update the progress log in PROJECT_CONTEXT.md and commit.
5. Ask before adding new dependencies, renaming settings IDs (this breaks merchants' saved data), or deleting files.

## Definition of done
- `shopify theme check` passes with no errors
- Works in the theme editor (settings change live, blocks reorder correctly)
- Responsive from 320px to 1440px
- No hardcoded design values
- All strings localized in `locales/en.default.json`
