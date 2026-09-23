import type { CheatsheetRow } from "../api";
import { formatTrendLine } from "../lib/statLabels";

interface CheatsheetRowCardProps {
  row: CheatsheetRow;
  teamLogos?: Record<string, { logoUrl: string; primaryColor: string }>;
}

interface SignalBadge {
  icon: string;
  label: string;
  context: string;
  percentage: number;
  color: string; // Tailwind class
}

/**
 * Generate Linemate-style signal badges for a CheatsheetRow
 * Shows: recent_form, split, h2h, injury_impact, opponent_rank
 */
function getSignalBadges(row: CheatsheetRow): SignalBadge[] {
  const badges: SignalBadge[] = [];

  // 1. RECENT_FORM (always shown as main signal)
  badges.push({
    icon: "🔥",
    label: "Recent Form",
    context: `Hit in ${row.hits} of ${row.games} games`,
    percentage: Math.round(row.hit_rate * 100),
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  });

  // 2. SPLIT (Home/Away split)
  if (row.split_hits != null && row.split_games != null && row.split_games > 0) {
    const splitPercentage = Math.round((row.split_hits / row.split_games) * 100);
    badges.push({
      icon: "📍",
      label: "Home/Away Split",
      context: `Hit in ${row.split_hits} of ${row.split_games} split games`,
      percentage: splitPercentage,
      color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    });
  }

  // 3. H2H (Head-to-Head vs Opponent)
  if (row.h2h_hits != null && row.h2h_games != null && row.h2h_games > 0) {
    const h2hPercentage = Math.round((row.h2h_hits / row.h2h_games) * 100);
    badges.push({
      icon: "🎯",
      label: "vs Opponent",
      context: `Hit in ${row.h2h_hits} of ${row.h2h_games} matchups`,
      percentage: h2hPercentage,
      color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    });
  }

  // 4. INJURY_IMPACT
  if (row.without_player) {
    badges.push({
      icon: "🩹",
      label: "Injury Impact",
      context: `Without ${row.without_player}`,
      percentage: Math.round(row.hit_rate * 100),
      color: "bg-red-500/20 text-red-400 border-red-500/30",
    });
  }

  // 5. OPPONENT_RANK
  if (row.opponent_rank != null && row.opponent_team_count != null) {
    badges.push({
      icon: "🏆",
      label: "Opponent Rank",
      context: `Ranked ${row.opponent_rank} of ${row.opponent_team_count}`,
      percentage: row.opponent_rank <= 10 ? Math.round((1 - row.opponent_rank / row.opponent_team_count) * 100) : 0,
      color: row.opponent_rank <= 10 
        ? "bg-green-500/20 text-green-400 border-green-500/30"
        : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    });
  }

  return badges;
}

export function CheatsheetRowCard({ row, teamLogos }: CheatsheetRowCardProps) {
  const teamLogo = teamLogos?.[row.team];
  const signals = getSignalBadges(row);
  const mainSignal = signals[0]; // Recent form is always first
  
  return (
    <div className="group relative rounded-lg border border-white/10 bg-gradient-to-br from-[#12141a] to-[#0f1116] p-4 transition hover:border-emerald-400/30 hover:shadow-lg hover:shadow-emerald-400/10">
      {/* Player Info */}
      <div className="mb-3 flex items-center gap-2">
        {teamLogo?.logoUrl ? (
          <img src={teamLogo.logoUrl} alt={row.team} className="h-7 w-7 shrink-0 object-contain" />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white text-sm truncate">{row.player_name}</div>
          <div className="text-xs text-white/50">{row.team} • {row.direction === "over" ? "Over" : "Under"}</div>
        </div>
      </div>

      {/* Stat Line */}
      <div className="mb-3 p-2.5 rounded-lg bg-white/5 border border-white/5">
        <div className="text-xs text-white/60 mb-1">Prop:</div>
        <div className="font-semibold text-white text-sm">{formatTrendLine(row.stat_name, row.threshold, row.direction)}</div>
      </div>

      {/* Main Signal (Recent Form) with Visual */}
      {mainSignal && (
        <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{mainSignal.icon}</span>
              <span className="text-xs font-semibold text-white/70">{mainSignal.label}</span>
            </div>
            <span className="text-sm font-bold text-amber-400">{mainSignal.percentage}%</span>
          </div>
          <div className="text-xs text-white/60 mb-2">{mainSignal.context}</div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
              style={{ width: `${mainSignal.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Additional Context Badges */}
      {signals.length > 1 && (
        <div className="mb-3 space-y-2">
          {signals.slice(1).map((signal, idx) => (
            <div 
              key={idx} 
              className={`flex items-center justify-between p-2.5 rounded-lg border ${signal.color} bg-white/5 text-xs`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-sm shrink-0">{signal.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white/90">{signal.label}</div>
                  <div className="text-white/60">{signal.context}</div>
                </div>
              </div>
              <span className="text-white/90 font-bold ml-2 shrink-0">{signal.percentage}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer - Summary */}
      <div className="pt-2 border-t border-white/10 text-xs text-white/60">
        {signals.length} signal{signals.length !== 1 ? 's' : ''} • Last {row.games} games
      </div>
    </div>
  );
}

