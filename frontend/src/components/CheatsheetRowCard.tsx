import type { CheatsheetRow } from "../api";
import { formatTrendLine, ordinal, STAT_LABELS } from "../lib/statLabels";

interface CheatsheetRowCardProps {
  row: CheatsheetRow;
  teamLogos?: Record<string, { logoUrl: string; primaryColor: string }>;
}

interface SignalBadge {
  icon: string;
  label: string;
  context: string;
  percentage: number;
  valueLabel?: string; // overrides "{percentage}%" (e.g. an ordinal rank like "1st")
  color: string; // Tailwind class
  confidenceRange?: string; // shown for small samples, e.g. "95% CI: 39%\u201388%"
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
function getSignalBadges(row: CheatsheetRow): SignalBadge[] {
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

export function CheatsheetRowCard({ row, teamLogos }: CheatsheetRowCardProps) {
  const teamLogo = teamLogos?.[row.team];
  const signals = getSignalBadges(row);
  const opponentLine = row.opponent_team ? `${row.is_home ? "vs" : "@"} ${row.opponent_team}` : row.team;

  return (
    <div className="group relative rounded-lg border border-white/10 bg-[#12141a] p-4 transition hover:border-emerald-400/30">
      {/* Player Info */}
      <div className="mb-2 flex items-center gap-2">
        {teamLogo?.logoUrl ? (
          <img src={teamLogo.logoUrl} alt={row.team} className="h-7 w-7 shrink-0 object-contain" />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white text-sm truncate">{row.player_name}</div>
          <div className="text-xs text-white/50">{opponentLine}</div>
        </div>
      </div>

      {/* Stat Line */}
      <div className="mb-3 text-sm font-semibold text-white">
        {formatTrendLine(row.stat_name, row.threshold, row.direction)}
      </div>

      {/* Signal rows — flat list, matching Linemate's compact style */}
      <div className="space-y-1.5">
        {signals.map((signal, idx) => (
          <div key={idx} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0">{signal.icon}</span>
              <span className="text-white/70 truncate">
                {signal.context}
                {signal.confidenceRange && (
                  <span className="ml-1.5 text-white/35">({signal.confidenceRange})</span>
                )}
              </span>
            </div>
            <span className="font-bold text-white shrink-0">{signal.valueLabel ?? `${signal.percentage}%`}</span>
          </div>
        ))}
      </div>

      {/* Real market comparison — only rendered when we have an actual matching
          sportsbook quote (never fabricated); edge can be negative, unlike the
          signal badges above, since this is grading against the real line. */}
      {row.market_line != null && row.edge != null && row.market_hits != null && row.market_games != null && (
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-white/50 truncate">
              Book: {row.direction === "over" ? "Over" : "Under"} {row.market_line} ({row.market_price! > 0 ? "+" : ""}
              {row.market_price}) — hit {row.market_hits} of {row.market_games}
            </span>
            <span
              className={`shrink-0 font-bold ${row.edge >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {row.edge >= 0 ? "+" : ""}
              {Math.round(row.edge * 100)}% edge
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

