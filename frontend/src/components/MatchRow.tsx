import { Link } from "react-router-dom";
import type { BoardGame } from "../api";
import { formatMarketTrendLine, pctColorClass } from "../lib/statLabels";

function formatKickoff(kickoff: string | null): string {
  if (!kickoff) return "TBD";
  const date = new Date(kickoff);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function FormDots({ form }: { form: string[] }) {
  if (form.length === 0) {
    return <span className="text-xs text-white/30">—</span>;
  }
  return (
    <div className="flex gap-1">
      {form.map((result, i) => (
        <span
          key={i}
          title={result === "W" ? "Win" : result === "L" ? "Loss" : "Tie"}
          className={`h-2.5 w-2.5 rounded-full ${
            result === "W" ? "bg-emerald-400" : result === "L" ? "bg-red-500" : "bg-white/30"
          }`}
        />
      ))}
    </div>
  );
}

function TeamColumn({
  abbreviation,
  logoUrl,
  primaryColor,
  score,
  showScore,
  form,
  ppg,
  rank,
}: {
  abbreviation: string;
  logoUrl: string;
  primaryColor: string;
  score: number | null;
  showScore: boolean;
  form: string[];
  ppg: number | undefined;
  rank: number | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain" />
        ) : (
          <span className="h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: primaryColor }} />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {showScore && <span className="text-base font-extrabold text-white">{score ?? 0}</span>}
            <span className="text-sm font-bold text-white">{abbreviation}</span>
          </div>
          <FormDots form={form} />
        </div>
      </div>
      {ppg !== undefined && (
        <div className="shrink-0 text-right text-xs text-white/60">
          <div>{ppg} PPG</div>
          <div className="text-white/30">#{rank}</div>
        </div>
      )}
    </div>
  );
}

/** ValueStats-style match row: kickoff, team form (paired with its own PPG/rank), and top prop trends. */
export function MatchRow({ row }: { row: BoardGame }) {
  const { game } = row;
  const isFinal = game.status === "final";

  return (
    <Link
      to={`/games/${game.id}`}
      className="flex h-full flex-col rounded-xl border border-white/10 bg-[#12141a] p-4 transition hover:border-sky-400/40 hover:bg-[#161923]"
    >
      <div className="flex items-center justify-between text-xs font-semibold text-white/40">
        <span>{formatKickoff(game.kickoff)}</span>
        {isFinal ? (
          <span className="w-fit rounded bg-white/10 px-1.5 py-0.5 text-white/60">FINAL</span>
        ) : (
          <span className="w-fit rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">UPCOMING</span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        <TeamColumn
          abbreviation={game.away_team.abbreviation}
          logoUrl={game.away_team.logo_url}
          primaryColor={game.away_team.primary_color}
          score={game.away_score}
          showScore={isFinal}
          form={row.away_form}
          ppg={row.away_stats?.points_per_game}
          rank={row.away_stats?.points_per_game_rank}
        />
        <TeamColumn
          abbreviation={game.home_team.abbreviation}
          logoUrl={game.home_team.logo_url}
          primaryColor={game.home_team.primary_color}
          score={game.home_score}
          showScore={isFinal}
          form={row.home_form}
          ppg={row.home_stats?.points_per_game}
          rank={row.home_stats?.points_per_game_rank}
        />
      </div>

      {row.top_trends.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-white/5 pt-2.5">
          {row.top_trends.map((trend, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="text-sky-400">↗</span>
              <span className="font-semibold text-white/80">{trend.player_name}</span>
              <span className="text-white/50">{formatMarketTrendLine(trend)}</span>
              <span className={`font-semibold ${pctColorClass(trend.hit_rate * 100)}`}>
                {trend.hits}/{trend.games}
              </span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
