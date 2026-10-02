---
name: HitRate
description: Honest, real-data NFL prop trends and betting-edge analysis
colors:
  bg-void: "#0b0d12"
  surface-base: "#111620"
  surface-raised: "#12141a"
  surface-header: "#0f1117"
  ink-primary: "#e6e8ec"
  ink-muted: "rgba(255,255,255,0.7)"
  ink-faint: "rgba(255,255,255,0.5)"
  ink-whisper: "rgba(255,255,255,0.4)"
  border-hairline: "rgba(255,255,255,0.1)"
  edge-good: "#34d399"
  edge-good-strong: "#10b981"
  edge-mixed: "#fbbf24"
  edge-bad: "#fb7185"
  link-accent: "#38bdf8"
  badge-split: "#3b82f6"
  badge-h2h: "#a855f7"
typography:
  display:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: "normal"
  headline:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
  body:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  card:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.xl}"
    padding: "16px"
  card-hover:
    backgroundColor: "{colors.surface-base}"
  pill-tab-active:
    backgroundColor: "rgba(255,255,255,0.15)"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
  pill-tab-inactive:
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.md}"
  badge-good:
    backgroundColor: "rgba(52,211,153,0.2)"
    textColor: "{colors.edge-good}"
    rounded: "{rounded.sm}"
---

# Design System: HitRate

## 1. Overview

**Creative North Star: "The Trading Terminal"**

HitRate reads like a professional trading terminal for NFL prop bets, not a gamified sportsbook. The palette is a near-black void punctuated only by real signal — emerald when the real numbers are good, amber when mixed, rose when they aren't. Everything else stays a disciplined, low-contrast gray-on-black scale so that color is never decorative, only informational: if something is emerald on this screen, it means a real hit rate or edge is genuinely strong.

The system explicitly rejects the DraftKings/FanDuel neon slot-machine aesthetic (no confetti, no manufactured urgency, no celebratory motion on a "win") and the generic AI-SaaS dashboard look (no cream backgrounds, no gradient-clipped headlines, no uppercase eyebrow above every section, no identical icon-card grids). Density is a feature: bettors scan many real signals quickly, so layouts favor tight, bordered, information-dense cards over generous marketing whitespace.

**Key Characteristics:**
- Near-black void background with flat, hairline-bordered surfaces — no drop shadows except on floating overlays (modals).
- One consistent three-color signal scale (emerald / amber / rose) used everywhere hit-rate or edge strength is shown, and nowhere else.
- Uppercase, letter-spaced, low-opacity micro-labels (`text-xs font-semibold uppercase tracking-wide text-white/50`) mark every section header — the system's one recurring typographic signature.
- Real numbers are always paired with their sample size ("7 of 7 games") and, for small samples, a confidence interval — never a bare percentage floating alone.

## 2. Colors

The palette is almost monochrome by design; the three signal colors are the entire "color budget" and are reserved exclusively for real hit-rate/edge strength.

### Primary
- **Edge Good** (`#34d399` / strong `#10b981`): the app's one true accent. Used for positive hit-rates ≥70%, real market edges, Kelly stake suggestions, active nav links, and primary CTAs. Never used decoratively.

### Secondary
- **Sky Link** (`#38bdf8`): reserved for navigational links ("← Back to schedule") — distinct from the emerald signal color so navigation never reads as a "good bet" signal.

### Tertiary
- **Edge Mixed** (`#fbbf24`) and **Edge Bad** (`#fb7185`): the rest of the three-part signal scale. Amber = 50–69% real hit rate or a neutral market read; rose = <50%, a real signal against the pick. Also used for the two supplementary Linemate-style contextual badges, split (`#3b82f6`) and head-to-head (`#a855f7`) — these are informational category tags, not strength signals, and must stay visually distinct from the emerald/amber/rose scale.

### Neutral
- **Void** (`#0b0d12`): page background.
- **Surface Base** (`#111620`) / **Surface Raised** (`#12141a`): card and row backgrounds; raised is used for the primary content card, base for hover/alternate rows.
- **Surface Header** (`#0f1117`): sticky modal headers only.
- **Ink** (`#e6e8ec` at full opacity, then `white/70`, `white/50`, `white/40` steps): body text de-emphasizes by opacity, not by switching hue.
- **Hairline** (`white/10`): the only border color in the system.

### Named Rules
**The One Signal Rule.** Emerald/amber/rose are reserved for real hit-rate and edge strength only. If a new component needs a status color for something that is not a real computed signal (e.g. a "loading" or "info" state), it must NOT reuse this triad — use ink/white opacity steps instead.

## 3. Typography

**Body & Display Font:** Inter (fallback: Segoe UI, system-ui, sans-serif) — a single family throughout, no serif or mono pairing.

**Character:** One geometric-humanist sans at every weight from 400 to 900; hierarchy is carried entirely by size, weight, and opacity rather than a font pairing.

### Hierarchy
- **Display** (font-black, 1.875–2.25rem, tight line-height): page-level identity — a player's name, a matchup title ("IND @ WAS"). Rare, one per page.
- **Headline** (font-bold, 1.25rem): card and modal titles.
- **Title** (font-semibold, 0.75rem, uppercase, `tracking-wide`, `text-white/50`): the system's signature section label. Appears above every logical block ("Season Stats at a Glance", "Real Market Odds", "Recent Games").
- **Body** (font-normal/semibold, 0.875rem, `text-white/70`–`80`): stat lines, table cells, card copy.
- **Label** (0.75rem, `text-white/40`–`50`): timestamps, sample-size footnotes, helper text under a control.

### Named Rules
**The Uppercase Title Rule.** Every distinct content block on a page gets exactly one `text-xs font-semibold uppercase tracking-wide text-white/50` label above it. This is the system's one recurring "eyebrow"-shaped element — deliberately singular and consistent, not a new eyebrow invented per section.

## 4. Elevation

The system is flat by default: surfaces are distinguished by background tone (`void` → `surface-base` → `surface-raised`) and a single hairline border, not by shadow. Shadows are reserved for genuinely floating elements — the trend-detail modal and its overlay — where real depth communicates "this is above the page," not decoration.

### Shadow Vocabulary
- **Modal** (`shadow-2xl`): the trend/player detail modal only.
- **Small lift** (`shadow-lg` / `shadow-sm`): rare, used only on small floating controls (e.g. a dropdown), never on static cards.

### Named Rules
**The Flat-Card Rule.** Cards and rows at rest use `border border-white/10` and a background-tone step, never a shadow. A shadow appearing on a static (non-overlay) element is a bug, not a style choice.

## 5. Components

### Buttons / Tabs
- **Shape:** `rounded-lg` (8px) for tab pills and inline buttons; `rounded-full` for icon-only controls and status dots.
- **Active tab:** `bg-white/15 text-white`, or for top-level page tabs, a 2px emerald bottom border (`border-b-2 border-emerald-400 text-white`).
- **Inactive tab:** `text-white/50`, hover → `text-white`. No background change on hover for inactive tabs — only the text brightens.

### Cards / Containers
- **Corner style:** `rounded-xl` (16px) for primary content cards, `rounded-lg` (8px) for nested rows/badges.
- **Background:** `bg-[#12141a]` for the primary card layer; `bg-white/5` for a nested row inside a card.
- **Border:** `border border-white/10` on every card; no border on nested rows (background-tone alone separates them).
- **Internal padding:** `p-4` (16px) standard; `px-3 py-2` for compact nested rows.

### Signal Badges
- **Style:** small pill or inline row pairing an icon (🔥📍🎯🩹🏆) with a label, a sample-size sentence, and a bold percentage in the emerald/amber/rose scale.
- **Rule:** a contextual badge (split/H2H/injury/opponent-rank) only renders when it *confirms* the pick (≥50%); a losing contextual signal is omitted rather than shown crossed-out, to keep the badge row meaning "reasons this is good," while the primary recent-form number is always shown regardless of direction (full transparency on the headline stat only).

### Tables
- **Style:** left-aligned header row in `text-white/40`, `border-t border-white/5` between body rows, numeric columns right- or center-aligned. Used for standings and head-to-head history.

### Navigation
- **Style:** top header bar, flat, `border-b border-white/10`, pill-shaped nav container (`rounded-full border border-white/10 bg-white/3`). Links are `text-white/50`, hover → `text-white`; the active route gets `bg-white/10 text-white`.

### Focus (all interactive elements)
- Every `a`, `button`, `input`, `select`, and `textarea` gets a 2px solid emerald (`#34d399`) outline with 2px offset on `:focus-visible`, applied globally in `index.css` rather than per-component — no element should ship without a visible keyboard-focus state.

## 6. Do's and Don'ts

### Do:
- **Do** reserve emerald/amber/rose exclusively for real computed hit-rate or edge strength — never decorative.
- **Do** pair every headline percentage with its real sample size ("7 of 7 games") and, below 8 games, its confidence interval.
- **Do** use the single uppercase `text-xs font-semibold tracking-wide text-white/50` label as the only section-header pattern.
- **Do** keep cards flat (`border-white/10`, no shadow) at rest; reserve shadows for true overlays (modals).
- **Do** omit a contextual signal badge entirely when it doesn't support the pick, rather than showing a "bad" version of it.
- **Do** rely on the global `:focus-visible` rule (2px emerald outline) for every new interactive element — don't hand-roll a one-off focus style.

### Don't:
- **Don't** use gradient-clipped text, cream/beige backgrounds, or tiny uppercase eyebrows above every section — the generic AI-SaaS look this product explicitly rejects.
- **Don't** add confetti, celebration animation, or gamified "win" feedback on any numeric outcome — this is a terminal, not a sportsbook.
- **Don't** introduce a new status color outside the emerald/amber/rose triad for anything that isn't a real signal strength.
- **Don't** use a `border-left`/`border-right` colored stripe as a callout accent anywhere in the system.
- **Don't** show a bare percentage without its underlying game count next to it.
