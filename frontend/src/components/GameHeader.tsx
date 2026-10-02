import type { Game, Team } from "../api";
import { formatKickoff } from "../lib/period";

function TeamSide({ team, align }: { team: Team; align: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {team.logo_url ? (
        <img src={team.logo_url} alt={team.abbreviation} className="h-11 w-11 shrink-0 object-contain sm:h-14 sm:w-14" />
      ) : (
        <span className="h-11 w-11 shrink-0 rounded-full sm:h-14 sm:w-14" style={{ backgroundColor: team.primary_color }} />
      )}
      <div className="min-w-0">
        <div className="text-2xl font-black leading-none text-white sm:text-3xl">{team.abbreviation}</div>
        <div className="mt-1 hidden truncate text-xs text-white/50 sm:block">{team.name}</div>
      </div>
    </div>
  );
}

/** Matchup banner: both teams, kickoff or final score, and the data-window caveat. */
export function GameHeader({ game, blendedWindow }: { game: Game; blendedWindow: boolean }) {
  const isFinal = game.status === "final";

  return (
    <header className="rounded-xl border border-white/10 bg-[#12141a] p-4 sm:p-5">
      <h1 className="sr-only">
        {game.away_team.abbreviation} @ {game.home_team.abbreviation}
      </h1>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-white/50">{formatKickoff(game.kickoff)}</span>
        {blendedWindow && (
          <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">
            Early season — stats blended with last season
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        <TeamSide team={game.away_team} align="left" />
        <div className="flex flex-col items-center gap-1.5 text-center">
          {isFinal && game.away_score != null && game.home_score != null ? (
            <span className="text-2xl font-black tabular-nums text-white sm:text-3xl">
              {game.away_score} – {game.home_score}
            </span>
          ) : (
            <span aria-hidden="true" className="text-xl font-semibold text-white/30">
              @
            </span>
          )}
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/60">
            {isFinal ? "FINAL" : "UPCOMING"}
          </span>
        </div>
        <TeamSide team={game.home_team} align="right" />
      </div>

      <div aria-hidden="true" className="mt-4 flex h-1 gap-0.5 overflow-hidden rounded-full">
        <span className="flex-1" style={{ backgroundColor: game.away_team.primary_color }} />
        <span className="flex-1" style={{ backgroundColor: game.home_team.primary_color }} />
      </div>
    </header>
  );
}
