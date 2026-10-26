# OM Enterprise — design system

Simple, professional and uncluttered: ink-navy type on white or warm paper, fine rules, one type
family, brass-gold used sparingly. It should feel like a serious building-materials counter, not a
template.

Tokens live in `src/app/globals.css` (`@theme`). Shared components live in `src/components/ui/`.
Use them before writing new styles.

## Principles

1. **Real content is the decoration.** Sizes, SKUs, standards, brands and prices carry the page.
   Never add filler sections, invented claims or stock "why choose us" icon grids.
2. **One accent.** Brass-gold marks things (active nav, the single most important action on a
   public page, the small line above a public heading). Everything else is navy, ink greys and
   white/paper.
3. **Rules, not boxes.** Prefer solid hairline borders (`border-navy-100/200`, `border-rule` on
   paper) and ruled rows over floating cards with big shadows. No dashed or dotted rules.
4. **Type does the hierarchy.** One family at a few sizes and weights. Bold `headline` for page
   titles and big figures; regular text for reading; `tabular` figures for numbers; `label-sm`
   (small sentence-case text) for table heads and figure names.
5. **Motion explains, never decorates.** Short, quiet, purposeful; always disabled by
   `prefers-reduced-motion` (handled globally).

## Type

One family everywhere: **Roboto** (variable, self-hosted from `@fontsource-variable/roboto`, the
same face as the printed bill). There is no second display or monospace face: `font-mono` maps to
Roboto with tabular figures, so prefer `tabular` in new code.

| Use | Class |
|---|---|
| Staff page titles | `PageHeader`: `headline`, 26px on a phone, 30px from `sm` |
| Public page titles | `PageIntro`: 32px / 40px; section headings (`SectionHeading`) 26px / 32px; home hero at most 52px |
| Big figures | `headline font-bold tabular` + size: `Stat` 22px / 28px, POS grand total 32px / 36px |
| Table heads, figure names, small section names | `label-sm`: 12px medium, sentence case, normal spacing |
| Form labels | `Label` / `Field`: 13px medium, written as typed ("Business name") |
| SKUs, codes, sizes, quantities, prices | `tabular` (right-aligned in tables) |
| Body | `text-sm`/`text-base`, `leading-relaxed` for paragraphs |
| Secondary text | `text-navy-500` (ink grey — never a bright blue) |

- Nothing smaller than 11px; prefer `text-xs` (12px) for the smallest text.
- No capitals for decoration: labels, badges and buttons are written in sentence case
  ("Sample data", "QR expired", "New sale"). Real names keep their own spelling (OM ENTERPRISE,
  GSTIN, UPI).
- No positive letter-spacing and no width tricks; `headline` tightens slightly (-0.015em).
- The small line above a staff page title (`PageHeader` `eyebrow`) is plain 13px grey text. On the
  public site the line above a heading (`Eyebrow`) is 13px brass text, used only when it adds
  something (a place, a count) — never to repeat the heading.

## Colour

- `navy-900/950` — primary text, primary buttons, dark surfaces (header bars, footer, sidebar).
- `navy-50…600` — muted ink greys for borders, secondary text, quiet fills.
- `gold-500` (brass) — accents and the gold button; `gold-700` for gold text on white.
- `paper`, `paper-deep`, `rule` — warm off-white backgrounds and their lines (public site, table heads).
- Status colours: green (done), amber (waiting or needs a look), red (stopped or failed), and grey for
  everything else. Only inside badges, alerts and figures.

## Shape & depth

- Radii are globally tightened: `rounded-lg` = 6px, `rounded-xl` = 8px. Cards use `rounded-xl`;
  controls `rounded-lg`; badges 3px. No pill-shaped cards, no `rounded-3xl` panels.
- Shadows: `shadow-card` (barely there) and `shadow-lift` (menus, dialogs). Nothing larger.
- No gradient blobs, glows, glassmorphism, gradient text, emoji or sparkle icons.
- No template flourishes: no grid-paper backgrounds, no dotted price-list leaders (label and value
  sit at the two ends of a `flex justify-between` row), no rubber-stamp labels, no numbered indexes
  ("01", "02"), no spec plates drawn over illustrations, no short rules before headings, no coloured
  stripe down the edge of cards or alerts, no underline swooshes under headline words, no
  "Good morning" greetings. Titles say what the page is.

## Components (`src/components/ui`)

- `Button` / `LinkButton` — `primary` (navy), `gold` (one per view at most), `outline`, `ghost`,
  `danger`, `success`, `white` (on navy). Press feedback is built in.
- `Card`, `CardHeader`, `CardBody`, `Stat` (big figure; the tone colours the figure). Figure grids
  are two to a row on a phone.
- `PageHeader` — optional small grey line, title, description, actions.
- `TableWrap` + `th` / `td` — data tables. Heads are `label-sm` in `text-navy-500`. Rows:
  `hover:bg-paper/60`. Numbers right-aligned `text-right tabular`. Add `stack-sm` to the `<table>`
  and a `data-label` to each body cell (none on an actions cell) and the table becomes one block per
  row on a phone instead of scrolling sideways.
- `Badge` / `StatusBadge` — small sentence-case label with a status dot. Four tones: `neutral`,
  `green`, `amber`, `red` (the older names `navy`, `gold`, `blue`, `purple` still work and map onto
  grey or amber). `SampleBadge` — red-tinted "Sample data" label on demonstration items.
- `Alert` — tinted panel with an even 1px border.
- `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `Label` — plain labels, navy focus border with
  a soft brass ring.
- Filter forms (`FilterBar`, `ProductFilters`, `ListFilters`) show only the search box on a phone until
  "Filters" is tapped.
- `Dialog`, `useToast` — animate in automatically.
- `EmptyState` — quiet paper panel with a hairline border.
- `PaperSheet` — one white sheet on a paper background for sign-in, account and error pages;
  `SheetStamp` is a small plain label in its header.

## Utilities (`globals.css`)

`headline` (bold, slightly tight), `label-sm` (12px medium sentence-case label), `blueprint`
(flat paper fill behind line drawings), `tabular` (tabular figures), `link-draw` (underline draws in
on hover), `stagger` (children rise in once; set `style={{ "--i": i }}`), `.drawing [data-draw]`
(SVG strokes draw in; set `--len` / `--d`), `animate-fade-in`, `animate-rise`, `animate-sheet-in`.

## Motion

- UI feedback 150–250 ms; entrances ≤ 460 ms; easing `--ease-out-quart`. Animate only `opacity`
  and `transform` (and SVG stroke offsets).
- Lists may rise in once (`stagger`), capped at 12 steps. No scroll-jacking, parallax, bouncing,
  looping or attention-seeking animation.
- A product's figure morphs from the card that was opened into the product page, through the
  page skeleton (`figure-transition.tsx`). Only the opened card carries the shared name, so names
  stay unique on a page. Other route changes are instant.

## Copy

Plain, specific, short. Say what a thing is and what happens next. No marketing superlatives,
no invented facts (opening hours, years in business, stock levels, certifications).

## Keep working

Changing styles must never change behaviour: keep element `id`s, `data-testid`s, `aria-*`
labels, `role`s, button and heading text that the Playwright specs in `tests/e2e` and
`tests/walkthrough` rely on.
