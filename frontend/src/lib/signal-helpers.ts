import type { CheatsheetRow } from "../api";
import { formatDateTimeInAppTimezone } from "./period";
import { ordinal, STAT_LABELS } from "./statLabels";

/** Pure signal-interpretation helpers extracted from Trends.tsx and
 * CheatsheetRowCard.tsx (previously locked inside components, not
 * reusable/testable). Shared by TrendRowCard, TrendDetailModal, and
 * CheatsheetRowCard. */

export function isOpponentRankEdge(row: CheatsheetRow): boolean {
  if (row.opponent_rank == null || !row.opponent_team_count) return false;
  const midpoint = row.opponent_team_count / 2;
  return row.direction === "under" ? row.opponent_rank <= midpoint : row.opponent_rank > midpoint;
}

export function confirmingSignalCount(row: CheatsheetRow): number {
  let count = 0;
  if (row.split_games && row.split_hits != null && row.split_hits / row.split_games >= 0.5) count++;
  if (row.h2h_games && row.h2h_hits != null && row.h2h_hits / row.h2h_games >= 0.5) count++;
  if (row.without_player_games && row.without_player_hits != null && row.without_player_hits / row.without_player_games >= 0.5) count++;
  if (isOpponentRankEdge(row)) count++;
  if (row.edge != null && row.edge > 0) count++;
  return count;
}

export interface SignalChecklistItem {
  icon: string;
  label: string;
  status: "confirming" | "present" | "none";
  detail: string | null;
}

/**
 * Full transparency checklist of the 5 real signal types the app can
 * compute — "present" means real data exists but doesn't confirm the pick
 * (shown, never hidden — omitting an unfavorable real number would itself be
 * fabrication by omission), "none" means we simply have no real data for
 * that signal type for this player/game.
 */
export function getSignalChecklist(row: CheatsheetRow): SignalChecklistItem[] {
  const items: SignalChecklistItem[] = [];

  if (row.split_games) {
    const pct = Math.round(((row.split_hits ?? 0) / row.split_games) * 100);
    items.push({
      icon: "📍",
      label: `${row.is_home ? "Home" : "Away"} Split`,
      status: pct >= 50 ? "confirming" : "present",
      detail: `${pct}% (${row.split_hits}/${row.split_games})`,
    });
  } else {
    items.push({ icon: "📍", label: "Home/Away Split", status: "none", detail: null });
  }

  if (row.h2h_games) {
    const pct = Math.round(((row.h2h_hits ?? 0) / row.h2h_games) * 100);
    items.push({
      icon: "🎯",
      label: `vs ${row.opponent_team ?? "Opponent"}`,
      status: pct >= 50 ? "confirming" : "present",
      detail: `${pct}% (${row.h2h_hits}/${row.h2h_games})`,
    });
  } else {
    items.push({ icon: "🎯", label: "Head-to-Head", status: "none", detail: null });
  }

  if (row.without_player_games) {
    const pct = Math.round(((row.without_player_hits ?? 0) / row.without_player_games) * 100);
    items.push({
      icon: "🩹",
      label: `Without ${row.without_player}`,
      status: pct >= 50 ? "confirming" : "present",
      detail: `${pct}% (${row.without_player_hits}/${row.without_player_games})`,
    });
  } else {
    items.push({ icon: "🩹", label: "Injury Impact", status: "none", detail: null });
  }

  if (row.opponent_rank != null && row.opponent_team_count) {
    items.push({
      icon: "🏆",
      label: `${row.opponent_team ?? "Opponent"} Rank`,
      status: isOpponentRankEdge(row) ? "confirming" : "present",
      detail: `${ordinal(row.opponent_rank)} of ${row.opponent_team_count}`,
    });
  } else {
    items.push({ icon: "🏆", label: "Opponent Rank", status: "none", detail: null });
  }

  if (row.edge != null) {
    items.push({
      icon: "💹",
      label: "Market Edge",
      status: row.edge > 0 ? "confirming" : "present",
      detail: `${row.edge >= 0 ? "+" : ""}${Math.round(row.edge * 100)}%`,
    });
  } else {
    items.push({ icon: "💹", label: "Market Edge", status: "none", detail: null });
  }

  return items;
}

export interface Confidence {
  level: "high" | "medium" | "low";
  label: string;
  ciWidthPct: number | null;
  signalCount: number;
}

/**
 * Confidence blends sample precision (Wilson 95% CI width) with how many
 * independent real signals (split/H2H/injury/opponent-rank/market edge)
 * corroborate the pick. A high point-estimate hit rate on a tiny sample with
 * a wide CI and no corroborating signal is genuinely less trustworthy than
 * one backed by a tight CI or multiple confirming signals — never just the
 * raw hit-rate/games thresholds used before.
 */
export function getConfidence(row: CheatsheetRow): Confidence {
  const ciWidth =
    row.hit_rate_ci_low != null && row.hit_rate_ci_high != null ? row.hit_rate_ci_high - row.hit_rate_ci_low : null;
  const signalCount = confirmingSignalCount(row);

  let level: Confidence["level"] = "low";
  if ((ciWidth != null && ciWidth <= 0.25 && row.games >= 8) || (signalCount >= 2 && row.hit_rate >= 0.65)) {
    level = "high";
  } else if ((ciWidth != null && ciWidth <= 0.45 && row.games >= 5) || signalCount >= 1) {
    level = "medium";
  }

  return {
    level,
    label: level === "high" ? "High Confidence" : level === "medium" ? "Medium Confidence" : "Low Confidence",
    ciWidthPct: ciWidth != null ? Math.round(ciWidth * 100) : null,
    signalCount,
  };
}

export function getMatchupLabel(row: CheatsheetRow): string | null {
  if (!row.opponent_team) return null;
  return `${row.is_home ? "vs" : "@"} ${row.opponent_team}`;
}

export function getKickoffLabel(row: CheatsheetRow): string | null {
  if (!row.game_kickoff) return null;
  const d = new Date(row.game_kickoff);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateTimeInAppTimezone(d, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface SignalBadge {
  icon: string;
  label: string;
  context: string;
  percentage: number;
  valueLabel?: string; // overrides "{percentage}%" (e.g. an ordinal rank like "1st")
  color: string; // Tailwind class
  confidenceRange?: string; // shown for small samples, e.g. "95% CI: 39%–88%"
}

// Below this many games, a point-estimate hit rate alone is misleading —
// pair it with its confidence interval so a 2/3 streak doesn't read the same
// as a well-supported 16/19.
const SMALL_SAMPLE_GAMES_THRESHOLD = 8;

/**
 * Generate Linemate-style signal badges for a CheatsheetRow.
 * Shows: recent_form, split, h2h, opponent_rank — but only the contextual ones
 * (split/h2h/opponent_rank) when they actually confirm the pick, since a 0%
 * head-to-head record is evidence *against* the prop, not a supporting signal.
 */
export function getSignalBadges(row: CheatsheetRow): SignalBadge[] {
  const badges: SignalBadge[] = [];

  // 1. RECENT_FORM (always shown as main signal)
  const showConfidenceRange =
    row.games < SMALL_SAMPLE_GAMES_THRESHOLD && row.hit_rate_ci_low != null && row.hit_rate_ci_high != null;
  badges.push({
    icon: "🔥",
    label: "Recent Form",
    context: `Hit in ${row.hits} of last ${row.games} games`,
    percentage: Math.round(row.hit_rate * 100),
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    confidenceRange: showConfidenceRange
      ? `95% CI: ${Math.round((row.hit_rate_ci_low ?? 0) * 100)}%–${Math.round((row.hit_rate_ci_high ?? 0) * 100)}%`
      : undefined,
  });

  // 2. SPLIT (Home/Away split) — only when it confirms the pick
  if (row.split_hits != null && row.split_games != null && row.split_games > 0) {
    const splitPercentage = Math.round((row.split_hits / row.split_games) * 100);
    if (splitPercentage >= 50) {
      const splitLabel = row.is_home ? "Home Split" : "Away Split";
      badges.push({
        icon: "📍",
        label: splitLabel,
        context: `Hit in ${row.split_hits} of last ${row.split_games} ${row.is_home ? "home" : "away"} games`,
        percentage: splitPercentage,
        color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      });
    }
  }

  // 3. H2H (Head-to-Head vs Opponent) — only when it confirms the pick
  if (row.h2h_hits != null && row.h2h_games != null && row.h2h_games > 0) {
    const h2hPercentage = Math.round((row.h2h_hits / row.h2h_games) * 100);
    if (h2hPercentage >= 50) {
      badges.push({
        icon: "🎯",
        label: "vs Opponent",
        context: `Hit in ${row.h2h_hits} of last ${row.h2h_games} matchups`,
        percentage: h2hPercentage,
        color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      });
    }
  }

  // 4. INJURY_IMPACT — real teammate-absence data, only when it confirms the pick
  if (row.without_player && row.without_player_hits != null && row.without_player_games) {
    const injuryPercentage = Math.round((row.without_player_hits / row.without_player_games) * 100);
    if (injuryPercentage >= 50) {
      badges.push({
        icon: "🩹",
        label: "Injury Impact",
        context: `Hit in ${row.without_player_hits} of last ${row.without_player_games} games without ${row.without_player}`,
        percentage: injuryPercentage,
        color: "bg-red-500/20 text-red-400 border-red-500/30",
      });
    }
  }

  // 5. OPPONENT_RANK — direction-aware, only when it's a genuine matchup edge
  // (weak defense for an over, stingy defense for an under).
  if (row.opponent_rank != null && row.opponent_team_count) {
    const isOver = row.direction !== "under";
    const midpoint = row.opponent_team_count / 2;
    const isEdge = isOver ? row.opponent_rank > midpoint : row.opponent_rank <= midpoint;
    if (isEdge) {
      const edgeRank = isOver ? row.opponent_team_count - row.opponent_rank + 1 : row.opponent_rank;
      const statLabel = STAT_LABELS[row.stat_name] ?? row.stat_name;
      const opponentAbbr = row.opponent_team ?? "Opponent";
      badges.push({
        icon: "🏆",
        label: "Opponent Rank",
        context: `${opponentAbbr} is a good ${statLabel} matchup`,
        percentage: Math.round((1 - edgeRank / row.opponent_team_count) * 100),
        valueLabel: ordinal(edgeRank),
        color: "bg-green-500/20 text-green-400 border-green-500/30",
      });
    }
  }

  return badges;
}
