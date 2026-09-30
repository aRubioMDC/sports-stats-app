# Product

## Register

product

## Users

NFL bettors and prop researchers checking real statistical edges before placing a bet — on desktop or mobile, often between games or right before kickoff. They are skeptical of hype, tout accounts, and gamified sportsbook marketing; they want to verify an actual hit rate, sample size, and market price themselves rather than trust someone's pick. Primary tasks: scan the week's real trend signals, drill into a specific game or player, and check whether a prop has genuine positive edge against a real sportsbook line before staking anything.

## Product Purpose

SportStats surfaces every real, backend-computed statistical signal for NFL player props and game markets (recent-form hit rates, home/away splits, head-to-head, opponent rank, injury-impact, and de-vigged market edge vs. real sportsbook prices) across a Home board, a Trends explorer, a Cheatsheet, a per-player page, and a per-game detail page. Nothing on screen is fabricated or mocked — every number traces to a real database computation, and small-sample or missing data is shown honestly (confidence intervals, "no data yet") rather than smoothed over or hidden. Success = a user can find a genuine edge and trust every figure that led them there.

## Brand Personality

Honest, sharp, analytical. The tone is a professional trading terminal, not a gamified sportsbook — confident and information-dense, never hyped or cutesy. Emotional goal: the quiet trust of "this number is real," not the dopamine rush of a slot machine.

## Anti-references

- Flashy sportsbook apps (DraftKings/FanDuel neon slot-machine aesthetics, gamified push notifications, manufactured urgency, confetti/celebration animations on a "win").
- Generic AI-generated SaaS dashboard look: cream/beige near-white backgrounds, gradient-clipped text, tiny uppercase tracked eyebrows above every section, identical icon+heading+text card grids, the hero-metric-with-gradient-accent template.
- Hype-driven "tout" sites that surface only cherry-picked winning picks and hide the losses or small samples.

## Design Principles

1. **Never fabricate.** Every stat, badge, or number must trace to a real computed value; no placeholder or mock data ships to production, and this is non-negotiable across every surface.
2. **Show your work.** Confidence intervals, sample sizes, and "no data yet" states are surfaced honestly rather than hidden or visually smoothed over.
3. **Dense but scannable.** Bettors compare many signals quickly across a page; prioritize information density and fast visual scanning over decorative whitespace or generic marketing rhythm.
4. **Reads like a serious tool.** Every affordance (edge %, Kelly stake, real odds/prices) should feel like a trading terminal, not a game — no celebratory or gamified motion on numeric outcomes.
5. **One consistent signal language.** Win/edge/hit-rate strength maps to the same emerald (good) / amber (mixed) / rose (bad) scale everywhere in the app; these colors are never repurposed decoratively.

## Accessibility & Inclusion

Standard WCAG AA target. Dark mode only today (no light theme). The existing emerald/amber/rose hit-rate color scale is a real red-green color-blindness risk on this surface (odds/edge signals are safety-adjacent, financial decisions) — new and refreshed components should pair color with a non-color cue (icon, position, or label) rather than color alone.
