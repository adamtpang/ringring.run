# ringring.run design system

One idea: **a handset inside a ring**. Calm surfaces, one green for Ringy, peach for Rungy, honest copy.
Live reference: `/design` (renders the palette, type, motion and components from the real tokens).

## Files

| File | What it holds |
|---|---|
| `src/app/tokens.css` | Raw tokens as CSS variables. Light by default, dark via `prefers-color-scheme`, plus `prefers-contrast: more`. |
| `src/app/globals.css` | Tailwind v4 `@theme inline` mapping tokens to utilities (`bg-surface`, `text-title-2`, `ease-spring`...), `pressable` and `material-bar` utilities, keyframes, reduced-motion and reduced-transparency fallbacks. |
| `src/components/ds/` | Shared components: `Button`/`ButtonLink`, `Card`, `Badge`, `Stat`/`StatGrid`, `SectionHeader`, `Timeline`/`TimelineStep`, `Field`. Server-safe (no hooks). |
| `src/components/ui.tsx` | App chrome (client): `AppHeader`, `PageShell`, `BackLink`, `ModeBadge`, `RunStatusPill`, `StepTimeline`. |
| `src/components/Logo.tsx` | `LogoMark`, `Wordmark`, `RingEmblem` (hero). |
| `src/app/icon.svg`, `favicon.ico`, `apple-icon.png`, `opengraph-image.tsx` | Brand assets via Next.js app/ file conventions, all in Ringy green `#60d394` (favicon.ico has 16/32/48 px; icon.png is 512 px; apple-icon.png is 180 px full-bleed). |

## Color

Palette: [coolors.co/ee6055-60d394-aaf683-ffd97d-ff9b85](https://coolors.co/ee6055-60d394-aaf683-ffd97d-ff9b85). The five hues and their text shades live once in `tokens.css` as `--pal-*`; every role token points at them.

The raw hues are fills. As text on white they fail (green 1.9, peach 2.0, coral 3.3, yellow 1.4, light green 1.3), so text uses a darker `-ink` shade of the same hue, and fills carry dark text, never white. `pnpm contrast` prints every pairing; `tests/contrast.test.ts` fails the build if one drops under 4.5:1.

| Hue | Fill | Text shade (light) | Role |
|---|---|---|---|
| Ringy green | `#60d394` (`accent-solid`, `ringy`) | `#217748` (`accent`, `success`) | Ringy, primary actions, links, pass. Logo and favicon. |
| Rungy peach | `#ff9b85` (`rungy-solid`, `peach`) | `#a23d22` (`rungy`) | Rungy: scans, searches and runs in progress |
| Coral | `#ee6055` (`coral`) | `#c42014` (`danger`) | Problems, fail, gaps, urgent (A-tier) |
| Yellow | `#ffd97d` (`yellow`) | `#84610b` (`warning`) | Warnings, unknown, estimates, saved snapshot, demo data |
| Light green | `#aaf683` (`lime`, `highlight`) | text on it is Ink | Success backgrounds (`success-soft`), highlights |

| Pair | Ratio |
|---|---|
| `accent` #217748 on white / Canvas / Mist | 5.5 / 5.4 / 5.1 |
| Primary button: `#0b2a19` on #60d394 (hover #4cc584) | 8.3 (7.1) |
| Rungy button: `#3a1309` on #ff9b85 (hover #ff8a70) | 8.1 (7.1) |
| Badges on white: accent / success / rungy / warning / danger | 4.9 / 4.9 / 5.6 / 5.0 / 4.9 |
| Same badges on a Mist card | 4.6 / 4.6 / n/a / 4.8 / 4.6 |
| Dark theme text (on #161618): green / peach / yellow / coral #f4847b | 9.7 / 8.9 / 13.3 / 7.3 |

Neutrals:

| Name | Token | Light | Ratio | Dark | Ratio | Use |
|---|---|---|---|---|---|---|
| Ink | `foreground` | `#1d1d1f` | 16.3 | `#f5f5f7` | 16.6 | Body text |
| Graphite | `muted` | `#636368` | 5.8 | `#a1a1a6` | 7.0 | Secondary text |
| Pewter | `subtle` | `#6f6f74` | 4.8 | `#8d8d92` | 5.5 | Captions, meta |
| Canvas | `background` | `#fbfbfd` | | `#000000` | | Page |
| Surface | `surface` | `#ffffff` | | `#161618` | | Cards |
| Mist | `surface-2` | `#f5f5f7` | | `#1c1c1e` | | Inputs, sunken areas |

Mapping in the app: scorecard pass = green, gap = coral, unknown = yellow. Plan tiers A = coral, B = yellow, C = neutral. Peer tiers S = green, A = light green, B = neutral, C = yellow, D = coral. "Ringy does this" and "Ringy does this after your OK" = green; "You do this" = neutral. Eval PASS = green, FAIL = coral. The one-pager forces the light palette and prints with `print-color-adjust: exact`; every badge also carries its words, so it still reads in grayscale.

Each status color has a `-soft` tint for badge backgrounds. Hairlines are translucent (`rgba(0,0,0,.08)` / `rgba(255,255,255,.1)`) so they work on any surface. `prefers-contrast: more` darkens muted text and hairlines.

## Type

**Inter** (UI) + **Geist Mono** (timings, IDs), both loaded with `next/font/google`, self-hosted at build, `display: swap` with metric-matched fallbacks so there is no layout shift.

- Inter is the closest open match to SF Pro, ships an optical-size axis (we load `opsz`), and has tabular figures, which keeps live counters steady.
- Geist Mono is narrow and neutral; it marks machine values (timestamps, durations, run IDs) apart from prose without shouting.
- Apple system fonts stay in the fallback stack.

Scale (size, leading, tracking). Tracking tightens as size grows; small text opens up.

| Utility | Size | Leading | Tracking | Weight |
|---|---|---|---|---|
| `text-display` | clamp(2.5rem → 4.5rem) | 1.04 | -0.032em | 650 |
| `text-title-1` | clamp(1.75rem → 2.5rem) | 1.1 | -0.024em | 650 |
| `text-title-2` | 1.5rem | 1.2 | -0.018em | 600 |
| `text-title-3` | 1.1875rem | 1.3 | -0.012em | 600 |
| `text-headline` | 1.0625rem | 1.4 | -0.008em | 600 |
| `text-body` | 1.0625rem | 1.5 | -0.006em | 400 |
| `text-callout` | 0.9375rem | 1.5 | -0.003em | 400 |
| `text-footnote` | 0.8125rem | 1.45 | 0 | 400 |
| `text-caption` | 0.75rem | 1.4 | 0.01em | 400 |
| `text-eyebrow` | 0.75rem, uppercase | 1.3 | 0.06em | 600 |

## Space, radius, shadow

- Space: 4px base (`--space-1..12`), `--space-section` clamp(4rem → 7.5rem), `--space-gutter` clamp(1.25rem → 2rem).
- Radius: `sm` 8, `md` 12, `lg` 18, `xl` 24, `pill`. Nested corners: outer = inner + padding.
- Shadow: `card`, `raised`, `float`. Light uses soft shadows plus a hairline ring; dark relies on the ring (shadows vanish on black).

## Motion

| Token | Value | Use |
|---|---|---|
| `duration-instant` | 100ms | Press feedback (`pressable` scales to 0.97 on pointer-down) |
| `duration-fast` | 200ms | Hover, color |
| `duration-base` | 300ms | Fades |
| `ease-spring` | damping 1.0, response 0.35s (≈480ms) | Layout, new timeline rows, score bars |
| `ease-spring-bouncy` | damping 0.8, response 0.35s (≈450ms, 1.5% overshoot) | Segmented control thumb |

Springs are sampled into CSS `linear()` curves. All state changes are CSS transitions, so they retarget mid-flight (interruptible). New timeline rows enter with `@starting-style`. The ring waves on the hero and the live ping on running steps are the only looping motion.

Reduced motion: loops stop, movement becomes opacity. Reduced transparency: the blurred header becomes solid.

## Components

- **Button**: `primary`, `secondary`, `plain`, `inverse`; sizes `sm` 32px, `md` 40px, `lg` 48px. One primary per view.
- **Badge**: `neutral`, `accent`, `success`, `warning`, `danger`; `dot`, `live`. Used for run status and the **Demo data** label (warning).
- **Card**: `default`, `sunken`, `danger`; padding `none`–`lg`; `as` picks the landmark.
- **Stat / StatGrid**: label + tabular value; `emphasis` for the one number that matters.
- **SectionHeader**: eyebrow, title, one-line description, optional action.
- **TimelineStep**: status node on a rail, mono timestamp, live ping while running.
- **Field**: label above input, optional hint.

## Brand assets

- Mark: white handset on a Ringy green (#60d394) disc inside a faint ring. Built from one 24px handset path (`HANDSET_PATH` in `Logo.tsx`).
- `icon.svg` (32 viewBox), `icon.png` (512), `favicon.ico` (16/32/48), `apple-icon.png` (180, full-bleed green, iOS rounds it).
- `opengraph-image.tsx` (1200×630): wordmark, headline, emblem.
- Theme color: `#fbfbfd` light, `#000000` dark.

## Copy rules

- Say only what the code does. Future work is labeled **Next**. Pricing is labeled **Illustrative**.
- Do not claim SMS, Spanish, or live voice calls work.
- Sample data is always labeled **Demo data**; fictional businesses say **Fictional**.
- Short: one line per idea, sentence case, no exclamation marks.
