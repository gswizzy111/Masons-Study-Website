# Mason's Study design system

Direction: **lab notebook, calm focus.** Warm paper, ink, and one
chlorophyll-teal accent. The chrome stays quiet so the study material is the
loudest thing on screen. Dense where studying needs density (card lists, the
guide), generous on dashboards and the landing page.

Source of truth for values: `app/globals.css`. This file explains the rules.

## Principles

1. **The material leads.** Headers, nav and panels use ink, lines and white
   space, not color. Color is saved for state (mastery, errors, the one
   primary action on a screen).
2. **One accent.** Teal means "go" and "mastered". Never introduce a second
   accent color. Amber only ever means "still learning".
3. **Typography does the hierarchy.** Fraunces for headings, Hanken Grotesk
   for everything you read and click, JetBrains Mono for numbers that tick.
4. **Honest visuals.** No stock illustrations, no gradients-on-everything, no
   glassmorphism, no purple, no fake stats or testimonials. Previews use real
   components with clearly labeled example data.
5. **Accessible by default.** WCAG AA contrast in both themes, visible focus,
   full keyboard support, reduced motion respected, 390px to 1440px.

## Color tokens

CSS custom properties on `:root` (light) and `.dark` (dark), exposed to
Tailwind through `@theme inline`. Use the Tailwind names (`bg-surface`,
`text-ink-2`, `border-line`, `bg-accent`, `text-accent-ink`...), never raw
hex in components.

| Token | Tailwind | Light | Dark | Use |
|---|---|---|---|---|
| `--bg` | `bg-bg` | `#F7F6F2` | `#0E1012` | Page background |
| `--surface` | `bg-surface` | `#FFFFFF` | `#16191C` | Cards, inputs, menus |
| `--surface-2` | `bg-surface-2` | `#F0EEE8` | `#1D2125` | Sunken panels, hover fills, secondary buttons |
| `--ink` | `text-ink` | `#16181C` | `#ECEEF0` | Body text, headings |
| `--ink-2` | `text-ink-2` | `#585E68` | `#A3AAB3` | Secondary text (AA on every surface) |
| `--ink-3` | `text-ink-3` | `#7E848D` | `#7D858F` | Icons, list markers, large or decorative text only (not AA for small text in light) |
| `--line` | `border-line` | `#E4E1D8` | `#272C31` | Borders, dividers, progress tracks |
| `--accent` | `bg-accent` | `#0E7A6A` | `#3FC1A7` | Primary buttons, focus ring, mastered |
| `--accent-hover` | `bg-accent-hover` | `#0B6457` | `#5ED0B8` | Primary hover |
| `--accent-ink` | `text-accent-ink` | `#FFFFFF` | `#06221C` | Text on `bg-accent` |
| `--accent-soft` | `bg-accent-soft` | `#E1F0EC` | `#12332D` | Tinted panels, call-outs, selected chips |
| `--learning` | `bg-learning` / `text-learning` | `#A86200` | `#E3A33A` | Still learning |
| `--learning-soft` | `bg-learning-soft` | `#FBEFD9` | `#3A2A0F` | Learning tint |
| `--not-studied` | `bg-not-studied` | `#9AA0A8` | `#5E656E` | Not studied (bars and dots, never text) |
| `--mastered` | `bg-mastered` | = accent | = accent | Mastered |
| `--danger` | `bg-danger` / `text-danger` | `#B42318` | `#F07167` | Errors, destructive actions |
| `--danger-soft` | `bg-danger-soft` | `#FDECEA` | `#3A1614` | Error tint |

Additions (non-breaking, for contrast):

| Token | Tailwind | Light | Dark | Use |
|---|---|---|---|---|
| `--accent-strong` | `text-accent-strong` | `#0B6457` | `#5ED0B8` | Accent **text** on `bg-accent-soft` or small accent text (plain `text-accent` on the soft tint is 4.46:1 in light) |
| `--learning-strong` | `text-learning-strong` | `#8A5000` | `#E3A33A` | Learning text on `bg-learning-soft` |
| `--danger-ink` | `text-danger-ink` | `#FFFFFF` | `#2A0B08` | Text on `bg-danger` |
| `--ink-placeholder` | `placeholder:text-ink-placeholder` | `#6B717A` | `#7D858F` | Input placeholders (AA) |
| `--line-strong` | `border-line-strong` | `#CFCBC0` | `#353B42` | Hover borders, dashed empty states |

**Mastery colors are fixed everywhere:** not studied = `not-studied`, still
learning = `learning`, mastered = `mastered`. Order in bars and legends:
mastered, still learning, not studied (left to right). Labels: "Mastered",
"Still learning", "Not studied".

## Type

Fonts load through `next/font/google` in `app/layout.tsx` and are exposed as
`--font-display`, `--font-sans`, `--font-mono` (`font-display`, `font-sans`,
`font-mono`).

- **Fraunces** (variable, optical size axis on): headings, the wordmark,
  card and dialog titles, study guide h1-h3. Weight 600 (500 for very large
  display sizes). Tight tracking: -0.01em to -0.025em as size grows.
  Fraunces is on the taste skill's default ban list; it is used here because
  the architecture contract names it for the "lab notebook" direction.
- **Hanken Grotesk**: all UI and body text. 400 body, 500 labels and
  buttons, 600 sparingly.
- **JetBrains Mono**: timers, scores, counts in legends, `Kbd`, code. Always
  `tabular-nums` for numbers that change.

| Role | Classes |
|---|---|
| Landing display | `font-display text-[2.5rem] sm:text-[3rem] leading-[1.06] font-semibold tracking-[-0.025em]` |
| Page title (h1) | `font-display text-[1.75rem] sm:text-[2rem] leading-tight font-semibold tracking-[-0.02em]` (see `PageHeader`) |
| Section title (h2) | `font-display text-2xl font-semibold tracking-[-0.015em]` |
| Card title | `font-display text-lg font-semibold` (`CardTitle`) |
| Body | `text-[0.9375rem]` or `text-base`, `leading-relaxed`, `text-ink` / `text-ink-2` |
| Small / meta | `text-sm text-ink-2` |
| Label | `text-sm font-medium text-ink` |
| Numbers | `font-mono tabular-nums` |

Sentence case everywhere. No em dashes in visible copy. No emoji in UI chrome.

## Space, radius, elevation

- Spacing: Tailwind's 4px scale. Page gutters `px-4 sm:px-6 lg:px-8`,
  content max width `max-w-7xl` (header and `PageContainer`). Sections on
  dashboards `gap-6`; dense lists `gap-2` / `py-2.5` rows.
- Radius (one scale): **controls 10px** (`rounded-md`, buttons, inputs,
  selects, menus), **small controls and tags 6px** (`rounded-sm`: sm buttons,
  badges, chips, menu items), **containers 16px** (`rounded-lg`: cards,
  dialogs, panels), `rounded-full` for progress tracks and avatars only.
  `rounded` alone is 10px. Don't use `rounded-xl` / `rounded-2xl` on cards.
- Elevation (very subtle, tinted): `shadow-xs` controls, `shadow-md` cards,
  `shadow-lg` menus, popovers, dialogs, toasts. Prefer a border plus space over
  a shadow when elevation doesn't mean anything. (`shadow-card` and
  `shadow-pop` exist as aliases, but use the standard names so
  `tailwind-merge` can resolve overrides.)
- `graph-paper` utility: a faint 20px grid for the rare notebook surface.

## Theme

- Class `dark` on `<html>`. Default follows the system. An inline script in
  `app/layout.tsx` applies it before first paint; `ThemeSync` keeps it right
  afterwards (system changes, other tabs, React's dev remount).
- `components/theme-toggle.tsx` exports `ThemeToggle` (cycles light, dark,
  system), `useTheme()` → `{ theme, resolvedTheme, setTheme }`, and
  `setTheme(choice)`. The choice is stored in `localStorage.theme`.
- Write dark styles through tokens, not `dark:` overrides. Use `dark:` only
  for the rare value that isn't a token (overlay scrims).

## Components (`components/ui/`)

| Component | Notes |
|---|---|
| `Button` | `variant`: primary, secondary, ghost, outline, danger, link. `size`: sm, md, lg, icon. `asChild` (wrap a `Link`), `loading` (spinner, disabled, aria-busy). One primary per view. Icon buttons need `aria-label`. |
| `Input`, `Textarea`, `Label` | 16px text on phones (no iOS zoom). `aria-invalid` turns the border red. |
| `Field` | Label above, hint, control, error below. Wires `id`, `aria-describedby`, `aria-invalid`, `required` onto its single child; for composite controls pass a function child `(p) => <SelectTrigger {...p} />`. Props: `label`, `hint`, `error`, `optional`, `required`, `hideLabel`, `id`. |
| `Card` + `CardHeader/Title/Description/Content/Footer` | `variant`: raised (default), flat, sunken. `interactive` for clickable cards. `CardTitle as="h2"` to fix heading order. |
| `Badge` | neutral, accent, learning, danger, outline. 6px radius, 24px tall. |
| `Dialog` | `DialogContent title description size hideClose`. A bottom sheet under 640px, a centered card above. `DialogFooter` stacks full-width buttons on phones. |
| `DropdownMenu` | Item `variant="danger"`, checkbox and radio items, labels, separators, shortcuts. |
| `Tooltip` / `WithTooltip` | Supplementary only (touch can't hover). Brings its own provider. |
| `Select` | Radix select styled as an input. |
| `Progress` | Thin bar, `value` 0-max or `null` for indeterminate, `tone`, `label`. |
| `ProgressRing` | SVG ring, `value` 0-100, `size`, `stroke`, `tone`, children centered. role=progressbar. |
| `MasteryBar` | Takes a `MasterySummary`. Stacked mastered / still learning / not studied with an optional legend and counts. `showLegend={false}` gives it role=img with a full text description. |
| `Skeleton`, `Spinner`, `Kbd` | Skeletons match the final layout's shape. `Spinner label="Loading"` announces; without a label it's decorative. |
| `EmptyState` | `icon title body action`. Says how to fill the space. |
| `Segmented` | Radio group styled as a segmented control. Arrow keys move and select. Sliding indicator. |
| `TabsNav` | Link tabs with `aria-current="page"`, accent underline, sideways scroll with edge fade on phones. `exact` on the overview tab. |
| `Toaster` | Sonner, themed with tokens. Call `toast()` / `toast.error()` from `sonner`. |

Also: `components/brand.tsx` (`Brand`, `BrandMark`), `components/markdown.tsx`
(`<Markdown compact?>{md}</Markdown>`), `components/app-shell`
(`AppShell`, `PageContainer`, `PageHeader`, `SkipLink`).

## Rendered markdown (`.prose-study`)

Study guides, tutor answers and explanations render through `<Markdown>`:
68ch measure, Fraunces h1-h3 (h2 opens with a hairline rule), bold in ink,
blockquotes as teal call-outs (a bold first word becomes the label, e.g.
`> **High-yield.** ...`), zebra tables in a horizontally scrolling, focusable
wrapper, inline code and code blocks in JetBrains Mono, GFM task lists and
footnotes. `compact` tightens it for chat bubbles. Raw HTML is dropped; links
open in a new tab with `rel="noreferrer"`.

Print: anything with `data-print-hide` disappears; tokens switch to black on
white; tables, call-outs and code avoid page breaks.

## Motion

- `motion/react` for interaction, CSS keyframes for enter and exit
  (`animate-fade-in/out`, `pop-in/out`, `dialog-in/out`, `sheet-in/out`,
  `drawer-in/out`, `rise-in`).
- 150-250ms, ease-out for enters (`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`,
  also the Tailwind `ease-out`), quicker ease-in for exits. No bounce on
  chrome; springs with `bounce: 0` for indicators. A flashcard flip may use a
  spring. Games may be lively.
- Animate `transform`/`translate`/`scale` and `opacity` only.
- Always honor reduced motion: `useReducedMotion()` in components, and
  `globals.css` cuts CSS animations and transitions to near zero (spinners
  keep turning, slowly).
- Theme switches apply instantly (transitions are paused for one frame).

## Accessibility checklist

- Every input has a visible label (`Field`), errors are tied with
  `aria-describedby` and announced politely.
- Focus: one style everywhere, a 2px accent outline with a 2px offset
  (inputs use an inset ring). Never remove it without a replacement.
- Keyboard: dialogs trap focus and close on Escape; menus, selects, segmented
  controls and tabs work with arrows; wide tables are focusable to scroll.
- `AppShell` has a skip link to `<main id="main">`.
- Contrast: `text-ink-3` is for icons and large text only; use `text-ink-2`
  for small secondary text; accent text on tints uses the `-strong` tokens.
- Touch targets: 40px for default controls, 44px for tabs and mobile menu
  rows.

## Do and don't

Do:
- Use tokens through Tailwind classes; reach for `bg-surface` + `border-line`
  before a shadow.
- Keep one primary button per view; pair it with outline or ghost.
- Show mastery with the fixed colors and the same order every time.
- Write plain, specific copy: "Build the set", "6 cards due for review".
- Design empty, loading (skeletons), error and refused-by-Claude states.

Don't:
- Add colors, gradients, glass effects, glows or stock illustrations.
- Use `text-accent` for small text on `bg-accent-soft` (use `text-accent-strong`).
- Put essential information only in a tooltip, or only in color.
- Use em dashes, exclamation-mark spam or emoji in UI chrome.
- Name a custom utility `bg-*` / `text-*` unless it is a color: `tailwind-merge`
  will treat it as one and drop the real color class.
