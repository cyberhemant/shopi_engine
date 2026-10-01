# Project Context (handoff from planning chat)

## Goal
Build a complete e-commerce Shopify theme (Online Store 2.0, Liquid) with a merchant-controlled "theme engine": global settings drive CSS variables, and the theme editor controls which sections and blocks appear.

## Environment
- Shopify Partner account and a development store already exist (store: test-engine.myshopify.com, admin: https://admin.shopify.com/store/test-engine)
- Dev store was created with test data, no feature previews
- Tools: Shopify CLI, Node.js, Git, Claude Code
- Base: Dawn (or Shopify's current starter). Reuse its existing settings and snippets instead of duplicating them.

## Composition model (how the engine picks snippets)
- Shopify picks the layout and template from the URL. The engine does not choose these.
- JSON templates list sections. The merchant adds, removes, and reorders sections in the theme editor.
- Sections contain blocks. The merchant reorders blocks. Sections dispatch block types to snippets using `{% case block.type %}`.
- Snippets are developer-side partials called with `{% render %}`. Merchants never pick a snippet directly.
- Any variation a merchant should control must be a **setting or block**. The snippet only reads what it is given.
- Snippets take explicit parameters and never read `section.settings` directly. The parent section passes everything in.
- Avoid dynamic snippet names unless needed (theme check may flag them).

## Full theme scope (target, about 90 files)
- layout (2): theme, password
- templates (19): index, product, collection, list-collections, cart, search, page, blog, article, 404, password, gift_card + customer: account, login, register, reset_password, activate_account, addresses, order
- config (2), locales (2)
- sections (~38): header-group, footer-group, header, footer, announcement-bar, main-* per template, plus image-banner, slideshow, featured-collection, collection-list, featured-product, rich-text, image-with-text, multicolumn, video, featured-blog, newsletter, custom-liquid, product-recommendations, recently-viewed
- snippets (~20): css-variables, meta-tags, structured-data, product-card, price, badge, product-media-gallery, variant-picker, buy-buttons, quantity-selector, cart-items, cart-drawer, facets, pagination, breadcrumbs, predictive-search, localization-selector, icons, image, skip-to-content
- assets (~11): base.css, global.js, cart.js, product-form.js, media-gallery.js, facets.js, predictive-search.js, localization.js, pubsub.js

## Features to cover
Product: variants, swatches, multiple media, inventory, dynamic checkout, pickup availability, gift cards, selling plans, metafields.
Collection/search: filtering, sorting, pagination, predictive search, empty states.
Cart: AJAX via Cart API, notes, empty state.
Global: color schemes, typography, layout, buttons, cards, social links.
International: Markets, localization selectors, translated strings, RTL.
SEO: meta tags, canonical, Open Graph, JSON-LD.
Quality: WCAG AA, performance, theme editor support, theme check clean, app blocks.

## Build order
1. Global settings and CSS variable system (color schemes, typography, layout, buttons, cards)
2. Header, footer, layout
3. Core sections (hero, featured collection, rich text)
4. Product, collection, cart templates
5. Remaining templates and customer pages
6. Accessibility, performance, localization passes

## Git and safety rules
- Work on feature branches, one feature per commit.
- Never push to the live theme. Do not run `shopify theme push` unless I approve it.
- Do not hand-edit `config/settings_data.json`.
- Ask before renaming setting IDs (breaks merchants' saved data).

## Progress log (update as you go)
- [x] Project initialized, baseline commit made
- [x] Design token system
- [x] Header and footer
- [x] Core sections
- [x] Product, collection, cart
- [x] Shopify Theme Check: no offenses
- [x] Search, page, blog, article, collection list, and 404 templates
- [x] Password and customer account templates
- [x] Local global-settings control panel with dev-theme sync
- [x] Recipe panel: select split or centered homepage hero and build a checked ZIP
- [ ] Accessibility, performance, localization
