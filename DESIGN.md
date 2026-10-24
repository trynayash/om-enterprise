# OM Enterprise — design system

The look of a **well-made trade catalogue and spec sheet**: ink-navy type on white or warm
paper, fine rules, real product facts set in monospace, brass-gold used sparingly. It should feel
like a serious building-materials counter, not a template.

Tokens live in `src/app/globals.css` (`@theme`). Shared components live in `src/components/ui/`.
Use them before writing new styles.

## Principles

1. **Real content is the decoration.** Sizes, SKUs, standards, brands and prices carry the page.
   Never add filler sections, invented claims or stock "why choose us" icon grids.
2. **One accent.** Brass-gold marks things (eyebrow rules, active nav, the single most important
   action on a public page). Everything else is navy, ink greys and white/paper.
3. **Rules, not boxes.** Prefer hairline borders (`border-navy-100/200`, `border-rule` on paper) and
   ruled rows over floating cards with big shadows.
4. **Type does the hierarchy.** Condensed `headline` for page titles and big numbers; Archivo text
   for reading; `font-mono` / `label-mono` for anything read like a spec sheet.
5. **Motion explains, never decorates.** Short, quiet, purposeful; always disabled by
   `prefers-reduced-motion` (handled globally).

## Type

| Use | Class |
|---|---|
| Page / hero titles, big figures | `headline font-bold` (Archivo at 78% width, tight leading) + size |
| Section labels, table heads, form labels, units | `label-mono` (11px uppercase IBM Plex Mono) |
| SKUs, codes, sizes, quantities, prices in tables | `font-mono tabular` |
| Body | default Archivo, `text-sm`/`text-base`, `leading-relaxed` for paragraphs |
| Secondary text | `text-navy-500` (ink grey — never a bright blue) |

## Colour

- `navy-900/950` — primary text, primary buttons, dark surfaces (header bars, footer, sidebar).
- `navy-50…600` — muted ink greys for borders, secondary text, quiet fills.
- `gold-500` (brass) — accents and the gold button; `gold-700` for gold text on white.
- `paper`, `paper-deep`, `rule` — warm off-white backgrounds and their lines (public site, table heads).
- Status colours (emerald / amber / red / sky / violet) only inside badges, alerts and figures.

## Shape & depth

- Radii are globally tightened: `rounded-lg` = 6px, `rounded-xl` = 8px. Cards use `rounded-xl`;
  controls `rounded-lg`; badges 3px. No pill-shaped cards, no `rounded-3xl` panels.
- Shadows: `shadow-card` (barely there) and `shadow-lift` (menus, dialogs). Nothing larger.
- No gradient blobs, glows, glassmorphism, gradient text, emoji or sparkle icons.

## Components (`src/components/ui`)

- `Button` / `LinkButton` — `primary` (navy), `gold` (one per view at most), `outline`, `ghost`,
  `danger`, `success`, `white` (on navy). Press feedback is built in.
- `Card`, `CardHeader`, `CardBody`, `Stat` (big figure with a tone rule).
- `PageHeader` — eyebrow (gold rule + mono label), condensed title, description, actions.
- `TableWrap` + `th` / `td` — spec-sheet tables. Rows: `hover:bg-paper/60`. Numbers right-aligned
  `text-right font-mono tabular`.
- `Badge` / `StatusBadge` — small stamp with a status dot.
- `Alert` — tinted panel with a 3px left rule.
- `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `Label` — mono labels, navy focus border with
  a soft brass ring.
- `Dialog`, `useToast` — animate in automatically.
- `EmptyState` — engineering-paper (`blueprint`) panel.

## Utilities (`globals.css`)

`headline`, `label-mono`, `blueprint` (grid paper), `leader` (dotted price-list leader),
`link-draw` (underline draws in on hover), `stagger` (children rise in once; set `style={{ "--i": i }}`),
`rule-draw` (a rule that draws across as it scrolls into view), `.drawing [data-draw]` (SVG strokes
draw in; set `--len` / `--d`), `animate-fade-in`, `animate-rise`, `animate-sheet-in`.

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
