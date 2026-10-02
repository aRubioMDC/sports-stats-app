import { useState } from "react";
import type { ReactNode } from "react";
import type { Game, GamePrediction, MatchupContext, OddsSide, Team } from "../api";
import { MarginBars, SplitLadder, pct, signed } from "./OutlookCharts";
import type { LadderRow } from "./OutlookCharts";
import { ProbBar } from "./ProbBar";

const price = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function Subheading({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-semibold text-white/40">{children}</div>;
}

/** Model minus market in points; the sign carries the meaning, color only reinforces a gap of 3+ points. */
function EdgeNote({ model, market }: { model: number; market: number }) {
  const diff = Math.round((model - market) * 100);
  if (diff === 0) return <span>In line with market</span>;
  const tone = Math.abs(diff) < 3 ? "text-white/40" : diff > 0 ? "text-emerald-400" : "text-rose-400";
  return <span className={`font-semibold ${tone}`}>{`${diff > 0 ? "+" : "\u2212"}${Math.abs(diff)} pts vs market`}</span>;
}

function bestPrice(side: OddsSide | null | undefined): string | null {
  return side ? `${price(side.best_price)} (${side.best_bookmaker})` : null;
}

/** Real sportsbook prices on their own — the fallback when the model has no outlook for a game. */
function MarketOddsPanel({ game, context }: { game: Game; context: MatchupContext }) {
  const { moneyline, spread, total } = context;
  const home = game.home_team.abbreviation;
  const away = game.away_team.abbreviation;

  return (
    <div className="rounded-xl border border-white/10 bg-[#12141a] p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Real Market Odds</h2>

      {moneyline?.home && moneyline?.away && (
        <div className="mb-4">
          <Subheading>Moneyline</Subheading>
          {moneyline.home.fair_prob != null && (
            <ProbBar label={`${home} to win`} pct={moneyline.home.fair_prob} color={game.home_team.primary_color} />
          )}
          {moneyline.away.fair_prob != null && (
            <ProbBar label={`${away} to win`} pct={moneyline.away.fair_prob} color={game.away_team.primary_color} />
          )}
          <div className="mt-2 flex justify-between text-xs text-white/50">
            <span>
              {home} best: {bestPrice(moneyline.home)}
            </span>
            <span>
              {away} best: {bestPrice(moneyline.away)}
            </span>
          </div>
        </div>
      )}

      {spread?.point != null && spread.home && spread.away && (
        <div className="mb-4 border-t border-white/5 pt-3">
          <Subheading>Spread</Subheading>
          <div className="flex justify-between text-sm text-white/80">
            <span>
              {home} {signed(spread.point)} ({price(spread.home.best_price)})
            </span>
            <span>
              {away} {signed(-spread.point)} ({price(spread.away.best_price)})
            </span>
          </div>
        </div>
      )}

      {total?.point != null && total.over && total.under && (
        <div className="border-t border-white/5 pt-3">
          <Subheading>Total {total.point}</Subheading>
          {total.over.fair_prob != null && <ProbBar label="Over" pct={total.over.fair_prob} color="#34d399" />}
          {total.under.fair_prob != null && <ProbBar label="Under" pct={total.under.fair_prob} color="#fb7185" />}
        </div>
      )}
    </div>
  );
}

function hasMarket(context: MatchupContext): boolean {
  return Boolean(context.moneyline || context.spread || context.total);
}

function WinSide({
  team,
  value,
  marketPct,
  bestLine,
  align,
}: {
  team: Team;
  value: number;
  marketPct: number | null | undefined;
  bestLine: string | null;
  align: "left" | "right";
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${align === "right" ? "items-end text-right" : "items-start text-left"}`}>
      <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {team.logo_url && <img src={team.logo_url} alt="" className="h-6 w-6 object-contain" />}
        <span className="text-sm font-semibold text-white/70">{team.abbreviation}</span>
      </div>
      <span className="text-2xl font-bold tabular-nums text-white">{pct(value)}</span>
      {marketPct != null && (
        <>
          <span className="text-[11px] text-white/40">{`Market ${pct(marketPct)}`}</span>
          <span className="text-xs">
            <EdgeNote model={value} market={marketPct} />
          </span>
        </>
      )}
      {bestLine && <span className="text-[11px] text-white/40">{`Best ${bestLine}`}</span>}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="py-3 @xl:px-4 @xl:first:pl-0 @xl:last:pr-0">
      <dt className="text-xs text-white/50">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-white">{value}</dd>
      {note && <dd className="text-[11px] text-white/40">{note}</dd>}
    </div>
  );
}

type View = "totals" | "margin" | "spread";

function ModelOutlook({
  game,
  context,
  prediction,
  win,
}: {
  game: Game;
  context: MatchupContext;
  prediction: GamePrediction;
  win: { home: number; away: number };
}) {
  const [view, setView] = useState<View>("totals");

  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const home = homeTeam.abbreviation;
  const away = awayTeam.abbreviation;
  const market = prediction.market;
  const { moneyline, spread, total } = context;
  const homeFavored = win.home >= 0.5;
  const marketSpread = spread?.point ?? null;
  const spreadRows = prediction.spreads.filter(
    (s) => (homeFavored ? s.home_line < 0 : s.home_line > 0) || s.home_line === marketSpread,
  );

  const totalRows: LadderRow[] = prediction.totals.map((r) => ({
    key: r.line,
    label: `${r.line}`,
    left: r.over,
    right: r.under,
    isMarket: market?.total_point != null && r.line === market.total_point,
  }));
  const teamTotalRows = (rows: GamePrediction["totals"]): LadderRow[] =>
    rows.map((r) => ({ key: r.line, label: `${r.line}`, left: r.over, right: r.under }));
  const spreadLadder: LadderRow[] = spreadRows.map((r) => ({
    key: r.home_line,
    label: `${home} ${signed(r.home_line)}`,
    left: r.home_cover,
    right: r.away_cover,
    isMarket: marketSpread != null && r.home_line === marketSpread,
  }));

  const marketTotalRow = market?.total_point != null ? prediction.totals.find((r) => r.line === market.total_point) : undefined;
  const marketSpreadRow = marketSpread != null ? prediction.spreads.find((s) => s.home_line === marketSpread) : undefined;
  const { projected_home: ph, projected_away: pa } = prediction;
  const margin = ph != null && pa != null ? ph - pa : null;

  const views: Array<{ id: View; label: string; show: boolean }> = [
    { id: "totals", label: "Totals", show: prediction.totals.length > 0 },
    { id: "margin", label: "Margin", show: prediction.margin_buckets.length > 0 },
    { id: "spread", label: "Spread", show: spreadLadder.length > 0 },
  ];
  const visibleViews = views.filter((v) => v.show);
  const activeView = visibleViews.some((v) => v.id === view) ? view : (visibleViews[0]?.id ?? null);

  return (
    <section aria-labelledby="game-outlook-title" className="rounded-xl border border-white/10 bg-[#12141a]">
      <div className="lg:grid lg:grid-cols-2">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h2 id="game-outlook-title" className="whitespace-nowrap text-sm font-semibold uppercase tracking-wide text-white/50">
            Game Outlook
          </h2>
          {market?.home_win != null && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-white/40">
              <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-white" />
              Sportsbook price, vig removed
            </span>
          )}
        </div>
        <p className="mb-4 mt-1 text-xs text-white/40">
          Model estimate from real final scores. Sportsbook prices are shown for comparison and are not a guarantee.
        </p>

        {prediction.low_sample && (
          <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Small sample: team ratings lean on last season and the league average until more games are played.
          </p>
        )}

        <div className="flex items-start justify-between gap-4">
          <WinSide
            team={awayTeam}
            value={win.away}
            marketPct={market?.away_win}
            bestLine={market?.away_win != null ? bestPrice(moneyline?.away) : null}
            align="left"
          />
          <WinSide
            team={homeTeam}
            value={win.home}
            marketPct={market?.home_win}
            bestLine={market?.home_win != null ? bestPrice(moneyline?.home) : null}
            align="right"
          />
        </div>
        <div className="relative mt-3 h-2.5">
          <div
            role="img"
            aria-label={`Model win probability: ${away} ${pct(win.away)}, ${home} ${pct(win.home)}`}
            className="flex h-full gap-0.5 overflow-hidden rounded-full bg-white/10"
          >
            <div className="ring-1 ring-inset ring-white/20" style={{ width: `${win.away * 100}%`, backgroundColor: awayTeam.primary_color }} />
            <div className="ring-1 ring-inset ring-white/20" style={{ width: `${win.home * 100}%`, backgroundColor: homeTeam.primary_color }} />
          </div>
          {market?.away_win != null && (
            <div
              aria-hidden="true"
              className="absolute -inset-y-1 w-0.5 rounded-full bg-white"
              style={{ left: `calc(${market.away_win * 100}% - 1px)` }}
            />
          )}
        </div>

        <div className="@container mt-4 border-t border-white/10">
        <dl className="grid grid-cols-1 divide-y divide-white/10 @xl:grid-cols-3 @xl:divide-x @xl:divide-y-0">
          {ph != null && pa != null && (
            <Figure label="Projected score" value={`${away} ${pa.toFixed(1)} – ${ph.toFixed(1)} ${home}`} />
          )}
          {prediction.projected_total != null && (
            <Figure
              label="Projected total"
              value={prediction.projected_total.toFixed(1)}
              note={
                market?.total_point != null
                  ? `Market ${market.total_point}${marketTotalRow ? ` · model Over ${pct(marketTotalRow.over)}` : ""}`
                  : null
              }
            />
          )}
          {marketSpread != null ? (
            <Figure
              label="Market spread"
              value={`${home} ${signed(marketSpread)}`}
              note={marketSpreadRow ? `Model cover ${pct(marketSpreadRow.home_cover)}` : null}
            />
          ) : (
            margin != null && (
              <Figure label="Projected margin" value={`${margin >= 0 ? home : away} by ${Math.abs(margin).toFixed(1)}`} />
            )
          )}
        </dl>
        </div>
      </div>

      {activeView && (
        <div className="border-t border-white/10 p-4 lg:border-l lg:border-t-0">
          <div role="group" aria-label="Outlook view" className="mb-4 flex w-fit gap-1 rounded-lg bg-white/5 p-0.5">
            {visibleViews.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={activeView === v.id}
                onClick={() => setView(v.id)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  activeView === v.id ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {activeView === "totals" && (
            <div>
              <Subheading>Game total</Subheading>
              <SplitLadder
                rows={totalRows}
                lineHeader="Line"
                leftHeader="Over"
                rightHeader="Under"
                marketLeft={market?.total_over}
              />
              {total?.point != null && total.over && total.under && (
                <p className="mt-2 text-xs text-white/50">
                  Best prices at {total.point}: Over {bestPrice(total.over)} · Under {bestPrice(total.under)}
                </p>
              )}
              <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-white/5 pt-4 sm:grid-cols-2">
                <div>
                  <Subheading>{away} team total</Subheading>
                  <SplitLadder
                    rows={teamTotalRows(prediction.away_team_totals)}
                    lineHeader="Line"
                    leftHeader="Over"
                    rightHeader="Under"
                  />
                </div>
                <div>
                  <Subheading>{home} team total</Subheading>
                  <SplitLadder
                    rows={teamTotalRows(prediction.home_team_totals)}
                    lineHeader="Line"
                    leftHeader="Over"
                    rightHeader="Under"
                  />
                </div>
              </div>
            </div>
          )}

          {activeView === "margin" && (
            <div>
              <Subheading>Most likely margin of victory</Subheading>
              <MarginBars
                buckets={prediction.margin_buckets}
                awayAbbr={away}
                homeAbbr={home}
                awayColor={awayTeam.primary_color}
                homeColor={homeTeam.primary_color}
              />
            </div>
          )}

          {activeView === "spread" && (
            <div>
              <Subheading>Spread cover probability</Subheading>
              <SplitLadder rows={spreadLadder} lineHeader="Line" leftHeader={`${home} covers`} rightHeader={`${away} covers`} />
              {spread?.point != null && spread.home && spread.away && (
                <p className="mt-2 text-xs text-white/50">
                  Best prices: {home} {signed(spread.point)} ({price(spread.home.best_price)}) · {away} {signed(-spread.point)} (
                  {price(spread.away.best_price)})
                </p>
              )}
            </div>
          )}
        </div>
      )}
      </div>

      <p className="border-t border-white/10 px-4 py-3 text-[11px] text-white/40">
        Based on {Math.round(prediction.league_games)} weighted league games; {home} {prediction.home_games.toFixed(1)}{" "}
        and {away} {prediction.away_games.toFixed(1)} weighted games (last season counts half).
      </p>
    </section>
  );
}

/**
 * Statistical outlook for a game (win probability, margins, totals, spreads) from real final scores,
 * with the real de-vigged market price beside each estimate. Falls back to market-only odds.
 */
export function GameOutlook({
  game,
  context,
  prediction,
  isLoading,
}: {
  game: Game;
  context: MatchupContext;
  prediction: GamePrediction | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-white/40">Calculating game outlook…</p>;
  }
  if (!prediction || !prediction.available || !prediction.win) {
    return hasMarket(context) ? <MarketOddsPanel game={game} context={context} /> : null;
  }

  return <ModelOutlook game={game} context={context} prediction={prediction} win={prediction.win} />;
}
