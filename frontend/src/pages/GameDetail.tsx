import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useBoard, useCheatsheet, useConfig, useMatchup, useParlays } from "../api";
import { MatchupComparisonCard } from "../components/MatchupComparisonCard";
import { HeadToHeadTable } from "../components/HeadToHeadTable";
import { CheatsheetRowCard } from "../components/CheatsheetRowCard";
import { ProbBar } from "../components/ProbBar";
import { TeamSnapshotCard } from "../components/TeamSnapshotCard";
import { formatMarketTrendLine, formatTrendLine, pctColorClass } from "../lib/statLabels";
import { formatDateInAppTimezone, seasonStartYear } from "../lib/period";
import { useTeamLogos } from "../lib/useTeamLogos";

type Tab = "overview" | "trends";

function formatPrice(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

export function GameDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "trends" ? "trends" : "overview";

  const [recentGamesTeam, setRecentGamesTeam] = useState<"home" | "away">("home");

  const matchupQuery = useMatchup(gameId ? Number(gameId) : null);
  const context = matchupQuery.data ?? null;
  const error = matchupQuery.isError ? "Could not load matchup context." : null;

  const game = context?.game ?? null;
  const boardQuery = useBoard(game?.season ?? null, game?.week ?? null);
  const cheatsheetQuery = useCheatsheet(0.5, 3, game?.season, game?.week, undefined, game != null);
  const parlaysQuery = useParlays(gameId ? Number(gameId) : null, tab === "trends");
  const configQuery = useConfig();
  const isDayBased = configQuery.data?.period_unit === "day";

  const boardRow = useMemo(
    () => boardQuery.data?.find((row) => row.game.id === Number(gameId)) ?? null,
    [boardQuery.data, gameId]
  );

  const gamePropRows = useMemo(
    () => (cheatsheetQuery.data ?? []).filter((row) => row.game_id === Number(gameId)).sort((a, b) => b.hit_rate - a.hit_rate),
    [cheatsheetQuery.data, gameId]
  );

  const teamLogos = useTeamLogos();

  const setTab = (next: Tab) => setSearchParams((prev) => {
    const params = new URLSearchParams(prev);
    params.set("tab", next);
    return params;
  }, { replace: true });

  if (error) return <p className="p-8 text-red-400">{error}</p>;
  if (!context) return <p className="p-8 text-white/50">Loading matchup…</p>;
  if (!game) return <p className="p-8 text-white/50">Game details are not available right now.</p>;

  const { stat_rows, head_to_head, window_mode } = context;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-400 transition hover:text-sky-300 hover:underline"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="h-4 w-4"
        >
          <path
            d="M12.5 4.5L7 10l5.5 5.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Back to schedule</span>
      </Link>

      <div className="mb-6 mt-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">
          {game.away_team.abbreviation} @ {game.home_team.abbreviation}
        </h1>
        {window_mode === "blended" && (
          <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">
            Early season — stats blended with last season
          </span>
        )}
      </div>

      {/* Tab bar — mirrors NFL.com Game Center's OVERVIEW/STATS tabs and
          ValueStats's match-page sections, persisted in the URL (?tab=). */}
      <div className="mb-6 flex gap-2 border-b border-white/10">
        <button
          onClick={() => setTab("overview")}
          className={`px-4 py-2 text-sm font-semibold transition ${
            tab === "overview"
              ? "border-b-2 border-emerald-400 text-white"
              : "text-white/55 hover:text-white"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab("trends")}
          className={`px-4 py-2 text-sm font-semibold transition ${
            tab === "trends"
              ? "border-b-2 border-emerald-400 text-white"
              : "text-white/55 hover:text-white"
          }`}
        >
          Trends & Props{gamePropRows.length > 0 && ` (${gamePropRows.length})`}
        </button>
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
          {boardRow && (
            <div className="flex gap-3">
              <TeamSnapshotCard
                abbreviation={game.away_team.abbreviation}
                logoUrl={game.away_team.logo_url}
                primaryColor={game.away_team.primary_color}
                form={boardRow.away_form}
                ppg={boardRow.away_stats?.points_per_game}
                ppgRank={boardRow.away_stats?.points_per_game_rank}
                ypg={boardRow.away_stats?.yards_per_game}
                ypgRank={boardRow.away_stats?.yards_per_game_rank}
                isDayBased={isDayBased}
              />
              <TeamSnapshotCard
                abbreviation={game.home_team.abbreviation}
                logoUrl={game.home_team.logo_url}
                primaryColor={game.home_team.primary_color}
                form={boardRow.home_form}
                ppg={boardRow.home_stats?.points_per_game}
                ppgRank={boardRow.home_stats?.points_per_game_rank}
                ypg={boardRow.home_stats?.yards_per_game}
                ypgRank={boardRow.home_stats?.yards_per_game_rank}
                isDayBased={isDayBased}
              />
            </div>
          )}

          {/* ValueStats-style "Tendencias" bullets — real moneyline/team-total/
              game-total signals, not player props (those live in the other tab). */}
          {boardRow && boardRow.top_trends.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-[#12141a] p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/50">Quick Trends</h2>
              <ul className="flex flex-col gap-1.5">
                {boardRow.top_trends.map((trend, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-sm text-white/80">
                    <span className="text-emerald-400">•</span>
                    <span>
                      {trend.stat_name !== "game_total_points" && (
                        <span className="font-semibold text-white">{trend.player_name} </span>
                      )}
                      {formatMarketTrendLine(trend)}
                      <span className={`ml-1 font-semibold ${pctColorClass(trend.hit_rate * 100)}`}>
                        {trend.hits}/{trend.games} ({Math.round(trend.hit_rate * 100)}%)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
              Season Stats at a Glance
            </h2>
            {stat_rows.length > 0 ? (
              <MatchupComparisonCard
                homeAbbr={game.home_team.abbreviation}
                awayAbbr={game.away_team.abbreviation}
                homeColor={game.home_team.primary_color}
                awayColor={game.away_team.primary_color}
                rows={stat_rows}
              />
            ) : (
              <p className="text-white/40">Matchup stats not available yet for these teams.</p>
            )}
          </div>

          {/* ValueStats-style odds panel — real sportsbook prices (best across the
              books we track) plus de-vigged consensus probabilities, never a guess. */}
          {(context.moneyline || context.spread || context.total) && (
            <div className="rounded-xl border border-white/10 bg-[#12141a] p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Real Market Odds</h2>

              {context.moneyline?.home && context.moneyline?.away && (
                <div className="mb-4">
                  <div className="mb-2 text-xs font-semibold text-white/40">Moneyline</div>
                  {context.moneyline.home.fair_prob != null && (
                    <ProbBar
                      label={`${game.home_team.abbreviation} to win`}
                      pct={context.moneyline.home.fair_prob}
                      color={game.home_team.primary_color}
                    />
                  )}
                  {context.moneyline.away.fair_prob != null && (
                    <ProbBar
                      label={`${game.away_team.abbreviation} to win`}
                      pct={context.moneyline.away.fair_prob}
                      color={game.away_team.primary_color}
                    />
                  )}
                  <div className="mt-2 flex justify-between text-xs text-white/50">
                    <span>
                      {game.home_team.abbreviation} best: {formatPrice(context.moneyline.home.best_price)} (
                      {context.moneyline.home.best_bookmaker})
                    </span>
                    <span>
                      {game.away_team.abbreviation} best: {formatPrice(context.moneyline.away.best_price)} (
                      {context.moneyline.away.best_bookmaker})
                    </span>
                  </div>
                </div>
              )}

              {context.spread?.point != null && context.spread.home && context.spread.away && (
                <div className="mb-4 border-t border-white/5 pt-3">
                  <div className="mb-2 text-xs font-semibold text-white/40">Spread</div>
                  <div className="flex justify-between text-sm text-white/80">
                    <span>
                      {game.home_team.abbreviation} {context.spread.point > 0 ? "+" : ""}
                      {context.spread.point} ({formatPrice(context.spread.home.best_price)})
                    </span>
                    <span>
                      {game.away_team.abbreviation} {-context.spread.point > 0 ? "+" : ""}
                      {-context.spread.point} ({formatPrice(context.spread.away.best_price)})
                    </span>
                  </div>
                </div>
              )}

              {context.total?.point != null && context.total.over && context.total.under && (
                <div className="border-t border-white/5 pt-3">
                  <div className="mb-2 text-xs font-semibold text-white/40">Total {context.total.point}</div>
                  {context.total.over.fair_prob != null && (
                    <ProbBar label="Over" pct={context.total.over.fair_prob} color="#34d399" />
                  )}
                  {context.total.under.fair_prob != null && (
                    <ProbBar label="Under" pct={context.total.under.fair_prob} color="#fb7185" />
                  )}
                </div>
              )}
            </div>
          )}
          </div>

          <div className="flex flex-col gap-6 lg:col-span-1">
          {/* NFL.com-style division standings, real W-L-T computed from final games this season. */}
          {context.standings.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-[#12141a] p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
                {context.division} Standings
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/40">
                    <th className="pb-2 font-medium">Team</th>
                    <th className="pb-2 text-center font-medium">W</th>
                    <th className="pb-2 text-center font-medium">L</th>
                    <th className="pb-2 text-center font-medium">T</th>
                    <th className="pb-2 text-right font-medium">PCT</th>
                  </tr>
                </thead>
                <tbody>
                  {context.standings.map((row) => (
                    <tr key={row.team} className={`border-t border-white/5 ${row.is_in_game ? "bg-emerald-500/10" : ""}`}>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          {row.logo_url ? (
                            <img src={row.logo_url} alt={row.team} className="h-5 w-5 object-contain" />
                          ) : (
                            <span className="h-5 w-5 rounded-full" style={{ backgroundColor: row.primary_color }} />
                          )}
                          <span className="font-semibold text-white">{row.team}</span>
                        </div>
                      </td>
                      <td className="py-2 text-center text-white/80">{row.wins}</td>
                      <td className="py-2 text-center text-white/80">{row.losses}</td>
                      <td className="py-2 text-center text-white/80">{row.ties}</td>
                      <td className="py-2 text-right font-semibold text-white">{row.pct.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* NFL.com-style "Recent Games" — tabbed per team, real final-game results. */}
          {(context.home_recent_games.length > 0 || context.away_recent_games.length > 0) && (
            <div className="rounded-xl border border-white/10 bg-[#12141a] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">Recent Games</h2>
                <div className="flex gap-1 rounded-lg bg-white/5 p-0.5">
                  <button
                    onClick={() => setRecentGamesTeam("away")}
                    className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                      recentGamesTeam === "away" ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
                    }`}
                  >
                    {game.away_team.abbreviation}
                  </button>
                  <button
                    onClick={() => setRecentGamesTeam("home")}
                    className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                      recentGamesTeam === "home" ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
                    }`}
                  >
                    {game.home_team.abbreviation}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {(recentGamesTeam === "home" ? context.home_recent_games : context.away_recent_games).map((g, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/40">
                        {isDayBased && g.kickoff
                          ? formatDateInAppTimezone(new Date(g.kickoff), { month: "short", day: "numeric" })
                          : `Wk ${g.week}`}
                      </span>
                      <span className="text-white/50">{g.is_home ? "vs" : "@"}</span>
                      {g.opponent_logo_url ? (
                        <img src={g.opponent_logo_url} alt={g.opponent} className="h-5 w-5 object-contain" />
                      ) : null}
                      <span className="text-white/70">{g.opponent}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          g.result === "W"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : g.result === "L"
                              ? "bg-rose-500/20 text-rose-400"
                              : "bg-white/10 text-white/60"
                        }`}
                      >
                        {g.result}
                      </span>
                      <span className="font-semibold text-white">
                        {g.team_score}-{g.opponent_score}
                      </span>
                    </div>
                  </div>
                ))}
                {(recentGamesTeam === "home" ? context.home_recent_games : context.away_recent_games).length === 0 && (
                  <p className="text-sm text-white/40">No recent final games found.</p>
                )}
              </div>
            </div>
          )}

          {/* NFL.com-style "Previous Matchup" — the single most recent real H2H result. */}
          {head_to_head.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-[#12141a] p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Previous Matchup</h2>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-white">
                  {head_to_head[0].away_team} @ {head_to_head[0].home_team}
                </span>
                <span className="text-white/40">
                  {isDayBased && head_to_head[0].kickoff
                    ? formatDateInAppTimezone(new Date(head_to_head[0].kickoff), {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : `${head_to_head[0].season} · Wk ${head_to_head[0].week}`}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-lg font-black text-white">
                  {head_to_head[0].away_score} - {head_to_head[0].home_score}
                </span>
                <span className="text-xs text-white/40">
                  {(() => {
                    const seasonsAgo = seasonStartYear(game.season) - seasonStartYear(head_to_head[0].season);
                    if (seasonsAgo <= 0) return "This season";
                    if (seasonsAgo === 1) return "Last season";
                    return `${seasonsAgo} seasons ago`;
                  })()}
                </span>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {tab === "trends" && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            Player Props & Trends
          </h2>
          {gamePropRows.length > 0 ? (
            <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {gamePropRows.map((row, i) => (
                <CheatsheetRowCard key={`${row.player_id}-${row.stat_name}-${row.threshold}-${i}`} row={row} teamLogos={teamLogos} />
              ))}
            </div>
          ) : (
            <p className="mb-8 text-white/40">No real prop signals available for this game yet.</p>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {parlaysQuery.data && parlaysQuery.data.length > 0 && (
                <>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Parlays</h2>
                  <div className="flex flex-col gap-3">
                    {parlaysQuery.data.map((parlay, pi) => (
                      <div key={pi} className="rounded-xl border border-white/10 bg-[#12141a] p-4">
                        <div className="flex flex-col gap-2">
                          {parlay.legs.map((leg, li) => (
                            <div key={li} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                              <div>
                                <span className="font-semibold text-white">{leg.player_name}</span>
                                <span className="ml-1 text-white/50">
                                  {formatTrendLine(leg.stat_name, leg.threshold, leg.direction)}
                                </span>
                              </div>
                              <span className="text-xs font-semibold text-emerald-400">
                                Hit in {leg.hits} of last {leg.games} games
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 text-xs font-semibold text-white/40">
                          Each leg hit in {parlay.summary_hits} of last {parlay.summary_games} games
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="lg:col-span-1">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Head to Head</h2>
              <div className="rounded-xl border border-white/10 bg-[#12141a] p-4">
                <HeadToHeadTable results={head_to_head} isDayBased={isDayBased} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

