import { Link } from "react-router-dom";
import type { BoardGame } from "../api";
import { formatMarketTrendLine } from "../lib/statLabels";

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
  align,
}: {
  abbreviation: string;
  logoUrl: string;
  primaryColor: string;
  score: number | null;
  showScore: boolean;
  form: string[];
  align: "left" | "right";
}) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain" />
      ) : (
        <span className="h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: primaryColor }} />
      )}
      <div>
        <div className="flex items-center gap-2">
          {showScore && <span className="text-base font-extrabold text-white">{score ?? 0}</span>}
          <span className="text-sm font-bold text-white">{abbreviation}</span>
        </div>
        <FormDots form={form} />
      </div>
    </div>
  );
}

function GeneralStatsColumn({
  homePpg,
  homeRank,
  awayPpg,
  awayRank,
}: {
  homePpg: number | undefined;
  homeRank: number | undefined;
  awayPpg: number | undefined;
  awayRank: number | undefined;
}) {
  if (homePpg === undefined || awayPpg === undefined) {
    return <span className="text-xs text-white/30">—</span>;
  }
  return (
    <div className="text-xs text-white/60">
      <div>
        {awayPpg} PPG <span className="text-white/30">#{awayRank}</span>
      </div>
      <div>
        {homePpg} PPG <span className="text-white/30">#{homeRank}</span>
      </div>
    </div>
  );
}

/** ValueStats-style match row: kickoff, team form, general stats, and top prop trends. */
export function MatchRow({ row }: { row: BoardGame }) {
  const { game } = row;
  const isFinal = game.status === "final";

  return (
    <Link
      to={`/games/${game.id}`}
      className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-[#12141a] p-4 transition hover:border-sky-400/40 hover:bg-[#161923] sm:grid-cols-[auto_1.6fr_0.9fr_1.5fr_auto] sm:items-center sm:gap-4"
    >
      <div className="flex shrink-0 flex-col text-xs font-semibold text-white/40 sm:w-24">
        <span>{formatKickoff(game.kickoff)}</span>
        {isFinal ? (
          <span className="mt-1 w-fit rounded bg-white/10 px-1.5 py-0.5 text-white/60">FINAL</span>
        ) : (
          <span className="mt-1 w-fit rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">UPCOMING</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <TeamColumn
          abbreviation={game.away_team.abbreviation}
          logoUrl={game.away_team.logo_url}
          primaryColor={game.away_team.primary_color}
          score={game.away_score}
          showScore={isFinal}
          form={row.away_form}
          align="left"
        />
        <TeamColumn
          abbreviation={game.home_team.abbreviation}
          logoUrl={game.home_team.logo_url}
          primaryColor={game.home_team.primary_color}
          score={game.home_score}
          showScore={isFinal}
          form={row.home_form}
          align="left"
        />
      </div>

      <GeneralStatsColumn
        homePpg={row.home_stats?.points_per_game}
        homeRank={row.home_stats?.points_per_game_rank}
        awayPpg={row.away_stats?.points_per_game}
        awayRank={row.away_stats?.points_per_game_rank}
      />

      <div className="flex flex-col gap-1">
        {row.top_trends.length === 0 && <span className="text-xs text-white/30">No trends yet</span>}
        {row.top_trends.map((trend, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="text-sky-400">↗</span>
            <span className="font-semibold text-white/80">{trend.player_name}</span>
            <span className="text-white/50">{formatMarketTrendLine(trend)}</span>
            <span className="font-semibold text-emerald-400">
              {trend.hits}/{trend.games}
            </span>
          </div>
        ))}
      </div>

      <span className="hidden shrink-0 rounded-full bg-white/5 p-2 text-white/40 sm:block">→</span>
    </Link>
  );
}
