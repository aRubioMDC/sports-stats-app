import { useEffect, useMemo, useState } from "react";
import { api, useConfig, useSamplePrices, useTeams, useTrendGroups } from "../api";

const tabs = [
  { key: "player", label: "Player" },
  { key: "team", label: "Team" },
  { key: "parlay", label: "Parlay" },
  { key: "sgp", label: "SGP" },
] as const;

type TrendTab = (typeof tabs)[number]["key"];

type TrendCard = {
  id: string;
  playerName: string;
  team: string;
  matchup: string; // "@ DAL" or "vs BUF"
  stat: string; // "Over 90.5 Rush Yards"
  direction: "over" | "under";
  price: number;
  sportsbook: string;
  hits: number;
  games: number;
  hitRate: number;
  projectedROI: number; // Calculated: (hitRate * (100 / Math.abs(price)) - (1 - hitRate)) * 100
  confidence: "high" | "medium" | "low"; // Based on hit rate and consistency
  metrics: Array<{
    label: string;
    value: string;
    icon: string;
  }>;
};

// Mock sportsbooks for variety
const SPORTSBOOKS = ["FanDuel", "DraftKings", "BetMGM", "Caesars", "Betano", "PointsBet"];

function calculateProjectedROI(hitRate: number, price: number): number {
  if (price === 0) return 0;
  const odds = Math.abs(price);
  const returnOnWin = odds > 100 ? odds / 100 : 100 / odds;
  const expectedValue = hitRate * returnOnWin - (1 - hitRate);
  return expectedValue * 100;
}

function getConfidenceLevel(hitRate: number, games: number): "high" | "medium" | "low" {
  if (hitRate >= 0.75 && games >= 5) return "high";
  if (hitRate >= 0.60 && games >= 3) return "medium";
  return "low";
}

function toPrice(index: number, isOver: boolean, samplePrices: number[]): number {
  if (samplePrices.length === 0) {
    const base = [-120, -135, 115, -110, -125, 108, -140, 105][index % 8];
    return isOver ? base : [115, -130, -120, -110, 105, -115, 120, -125][index % 8];
  }
  const price = samplePrices[index % samplePrices.length];
  return Math.round(price);
}

function formatStatName(statName: string): string {
  return statName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

interface DetailData {
  stats: Array<{ label: string; games: number; yards: string; attempts: string; td: string; targets: string }>;
  injuryReport: { status: string; summary: string };
  defensiveRank: { rank: number; summary: string };
  weather: { summary: string; details: string };
  gamelog: Array<{ date: string; opponent: string; result: string; hit: boolean; yards: string; td: string }>;
}

function generateDetailData(card: TrendCard): DetailData {
  const idx = parseInt(card.id.split("-")[1] || "0");
  const baseYards = Math.max(32, Math.round((card.hits / Math.max(card.games, 1)) * 100 + idx * 12));
  const baseAttempts = Math.max(10, Math.round(card.games * 1.8 + idx));
  const baseTd = idx % 3 === 0 ? 1 : 0;

  return {
    stats: [
      {
        label: "Recent Form",
        games: card.games,
        yards: String(baseYards),
        attempts: String(baseAttempts),
        td: String(baseTd),
        targets: String(Math.max(2, baseAttempts - 4)),
      },
      {
        label: "Season Avg",
        games: Math.max(7, card.games + 3),
        yards: String(baseYards + 24),
        attempts: String(baseAttempts + 4),
        td: String(baseTd + 1),
        targets: String(Math.max(3, baseAttempts - 2)),
      },
    ],
    injuryReport: {
      status: [
        "Healthy",
        "Limited practice",
        "Questionable",
        "Out",
      ][idx % 4],
      summary: [
        "Healthy and fully available for this matchup.",
        "Limited in practice, but trending toward playing.",
        "Status is day-to-day and could be a game-time decision.",
        "Expected to miss this game.",
      ][idx % 4],
    },
    defensiveRank: {
      rank: 6 + ((idx * 7) % 20),
      summary:
        idx % 2 === 0
          ? `Defense ranks ${6 + ((idx * 7) % 20)}th vs ${card.stat.split(" ")[0]}.`
          : `Opponent allows ${6 + ((idx * 7) % 20)}th-fewest stats to the position.`,
    },
    weather: {
      summary: ["Clear", "Cloudy", "Light rain", "Windy"][idx % 4],
      details: `${["Clear", "Cloudy", "Light rain", "Windy"][idx % 4]} • ${65 + (idx % 10)}°F • ${4 + (idx % 6)} mph wind`,
    },
    gamelog: Array.from({ length: 5 }, (_, gameIndex) => ({
      date: `${["09/08", "09/15", "09/22", "09/29", "10/06"][gameIndex]}/26`,
      opponent: ["BUF", "BAL", "NYJ", "MIA", "NE"][gameIndex],
      result: ["W", "L", "W", "W", "L"][gameIndex],
      hit: (gameIndex + idx) % 2 === 0,
      yards: String(baseYards - gameIndex * 8),
      td: String((gameIndex + idx) % 3),
    })),
  };
}

export function Trends() {
  const [tab, setTab] = useState<TrendTab>("player");
  const [minHitRate, setMinHitRate] = useState(0.60);
  const [selectedCard, setSelectedCard] = useState<TrendCard | null>(null);
  
  // React Query hooks for automatic caching
  const configQuery = useConfig();
  // Always pass daysBack=3 for "Trending Today" (last 3 days to show recent games)
  const trendGroupsQuery = useTrendGroups(configQuery.data?.current_season, configQuery.data?.current_week, 3);
  const samplePricesQuery = useSamplePrices();
  const teamsQuery = useTeams();

  // Derived state from queries
  const trendGroups = trendGroupsQuery.data ?? null;
  const samplePrices = samplePricesQuery.data ?? [];
  const loading = trendGroupsQuery.isLoading || samplePricesQuery.isLoading || teamsQuery.isLoading;

  // Build team logos mapping
  const teamLogos = useMemo(() => {
    if (!teamsQuery.data) return {};
    return teamsQuery.data.reduce(
      (acc, team) => {
        acc[team.abbreviation] = {
          logoUrl: team.logo_url,
          primaryColor: team.primary_color,
        };
        return acc;
      },
      {} as Record<string, { logoUrl: string; primaryColor: string }>
    );
  }, [teamsQuery.data]);

  // Track page view
  useEffect(() => {
    api.trackEvent("page_view_trends");
  }, []);

  const trendCards = useMemo<Record<TrendTab, TrendCard[]>>(() => {
    if (!trendGroups) {
      return { player: [], team: [], parlay: [], sgp: [] };
    }

    const allPlayerRows = [
      ...(trendGroups.recent_form ?? []),
      ...(trendGroups.versus_opponent ?? []),
      ...(trendGroups.alternate_lines ?? []),
      ...(trendGroups.home_away_splits ?? []),
      ...(trendGroups.unders_only ?? []),
    ];

    const playerCards: TrendCard[] = allPlayerRows.slice(0, 20).map((row, idx) => {
      const price = toPrice(idx, row.direction === "over", samplePrices);
      const projectedROI = calculateProjectedROI(row.hit_rate, price);
      const confidence = getConfidenceLevel(row.hit_rate, row.games);

      const metrics = [
        {
          label: "Recent Form",
          value: `${Math.round(row.hit_rate * 100)}%`,
          icon: "⚡",
        },
        {
          label: "vs Opponent",
          value: `${Math.round(Math.min(1, row.hit_rate + 0.05) * 100)}%`,
          icon: "🛡️",
        },
        {
          label: "Home/Away",
          value: `${Math.round(Math.min(1, row.hit_rate - 0.05) * 100)}%`,
          icon: "📍",
        },
      ];

      return {
        id: `player-${idx}`,
        playerName: row.player_name || "N/A",
        team: row.team || "N/A",
        matchup: `vs DAL`, // Mock matchup
        stat: `${row.direction === "over" ? "Over" : "Under"} ${row.threshold} ${formatStatName(row.stat_name)}`,
        direction: row.direction === "over" ? "over" : "under",
        price,
        sportsbook: SPORTSBOOKS[idx % SPORTSBOOKS.length],
        hits: row.hits,
        games: row.games,
        hitRate: row.hit_rate,
        projectedROI,
        confidence,
        metrics,
      };
    });

    const teamCards: TrendCard[] = (trendGroups.team_form ?? [])
      .slice(0, 12)
      .map((row, idx) => {
        const price = toPrice(idx + 2, true, samplePrices);
        const projectedROI = calculateProjectedROI(row.hit_rate, price);
        const confidence = getConfidenceLevel(row.hit_rate, row.games);

        return {
          id: `team-${idx}`,
          playerName: row.player_name || "Team",
          team: row.team || "N/A",
          matchup: "vs DAL",
          stat: `${formatStatName(row.stat_name)} Over ${row.threshold}`,
          direction: "over",
          price,
          sportsbook: SPORTSBOOKS[(idx + 2) % SPORTSBOOKS.length],
          hits: row.hits,
          games: row.games,
          hitRate: row.hit_rate,
          projectedROI,
          confidence,
          metrics: [
            { label: "Win Rate", value: `${Math.round(row.hit_rate * 100)}%`, icon: "✅" },
            { label: "Games", value: String(row.games), icon: "🏈" },
            { label: "ROI", value: `${Math.round(projectedROI)}%`, icon: "💰" },
          ],
        };
      });

    return {
      player: playerCards.filter((c) => c.hitRate >= minHitRate),
      team: teamCards.filter((c) => c.hitRate >= minHitRate),
      parlay: [],
      sgp: [],
    };
  }, [trendGroups, samplePrices, minHitRate]);

  const currentCards = trendCards[tab];

  if (loading) {
    return <div className="mx-auto max-w-7xl px-4 py-8 text-white/60">Loading trends…</div>;
  }

  if (!trendGroups) {
    return <div className="mx-auto max-w-7xl px-4 py-8 text-red-400">Unable to load trend data.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div>
        {/* Main Content */}
          {/* Header */}
          <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-4xl font-black tracking-tight text-white">Trends Today</h1>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10"
                >
                  ⚙️ Settings
                </button>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 rounded-xl border border-white/10 bg-[#111620] p-1">
              {tabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    tab === item.key
                      ? "bg-white text-[#050914] shadow-sm"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {item.label}
                  {trendCards[item.key as TrendTab].length > 0 && (
                    <span className="ml-2 text-xs text-white/50">({trendCards[item.key as TrendTab].length})</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Filter */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-[#111620] p-6">
            <div className="mb-4 flex items-center justify-between">
              <label className="text-sm font-semibold text-white/70">Minimum Hit Rate</label>
              <span className="text-2xl font-black text-emerald-400">{Math.round(minHitRate * 100)}%</span>
            </div>
            
            {/* Slider Container */}
            <div className="flex items-center gap-4">
              <span className="text-xs text-white/50">0%</span>
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(minHitRate * 100)}
                  onChange={(e) => setMinHitRate(parseInt(e.target.value) / 100)}
                  style={{
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${Math.round(minHitRate * 100)}%, #1f2937 ${Math.round(minHitRate * 100)}%, #1f2937 100%)`
                  }}
                  className="w-full cursor-pointer"
                />
              </div>
              <span className="text-xs text-white/50">100%</span>
            </div>

            {/* Result Summary */}
            <div className="mt-4 rounded-lg bg-white/5 px-3 py-2">
              <p className="text-xs text-white/60">
                Showing <span className="font-bold text-emerald-400">{currentCards.length}</span> trends with hit rate ≥ {Math.round(minHitRate * 100)}%
              </p>
            </div>
          </div>

          {/* Trends Grid */}
          {currentCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#111620] p-8 text-center text-white/40">
              No trends match your filters. Try lowering the minimum hit rate.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {currentCards.map((card) => (
                <TrendCardComponent
                  key={card.id}
                  card={card}
                  onSelect={() => setSelectedCard(card)}
                  teamLogos={teamLogos}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Modal */}
      {selectedCard && (
        <TrendDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          teamLogos={teamLogos}
        />
      )}
    </div>
  );
}

interface TrendCardComponentProps {
  card: TrendCard;
  onSelect: () => void;
  teamLogos: Record<string, { logoUrl: string; primaryColor: string }>;
}

function TrendCardComponent({
  card,
  onSelect,
  teamLogos,
}: TrendCardComponentProps) {
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);
  const confidenceColors = {
    high: "bg-emerald-500/20 border-emerald-500/50 text-emerald-200",
    medium: "bg-amber-500/20 border-amber-500/50 text-amber-200",
    low: "bg-rose-500/20 border-rose-500/50 text-rose-200",
  };

  const confidenceLabels = {
    high: "High Confidence",
    medium: "Medium Confidence",
    low: "Low Confidence",
  };

  const roiColor =
    card.projectedROI > 15
      ? "text-emerald-400"
      : card.projectedROI > 5
        ? "text-amber-400"
        : "text-rose-400";

  const teamLogo = teamLogos[card.team];
  
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-2xl border border-white/10 bg-[#111620] p-4 transition hover:border-white/20 hover:bg-white/5`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {teamLogo?.logoUrl ? (
            <img src={teamLogo.logoUrl} alt={card.team} className="h-8 w-8 shrink-0 object-contain" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{card.playerName}</span>
              <span className="text-xs text-white/50 font-semibold">{card.team}</span>
            </div>
          </div>
        </div>
        <div className="text-xs font-semibold text-white/70">
          {card.matchup}
        </div>
      </div>

      {/* Stat Label */}
      <div className="mb-3 rounded-lg bg-white/5 px-3 py-2">
        <div className="text-sm font-semibold text-white">{card.stat}</div>
      </div>

      {/* Price and Confidence */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-2xl font-black text-white">
            {card.price >= 0 ? "+" : ""}
            {card.price}
          </div>
          <div className="text-xs text-white/50">{card.sportsbook}</div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowConfidenceInfo(!showConfidenceInfo);
            }}
            className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${confidenceColors[card.confidence]}`}
          >
            {confidenceLabels[card.confidence]}
          </button>
          {showConfidenceInfo && (
            <div className="absolute right-0 top-full mt-2 z-10 w-56 rounded-lg border border-white/20 bg-[#0f1117] p-3 text-xs text-white/80 shadow-lg">
              <div className="mb-2 font-semibold text-white">Confidence Levels</div>
              <div className="space-y-2">
                <div>
                  <div className="font-semibold text-emerald-400">🟢 High Confidence</div>
                  <div>Hit rate ≥ 75% + ≥ 5 games</div>
                </div>
                <div>
                  <div className="font-semibold text-amber-400">🟡 Medium Confidence</div>
                  <div>Hit rate ≥ 60% + ≥ 3 games</div>
                </div>
                <div>
                  <div className="font-semibold text-rose-400">🔴 Low Confidence</div>
                  <div>Lower hit rate or fewer games</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hit Rate and ROI */}
      <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-white/5 p-2">
        <div>
          <div className="text-xs text-white/60">Hit Rate</div>
          <div className="text-lg font-bold text-emerald-400">{Math.round(card.hitRate * 100)}%</div>
          <div className="text-xs text-white/50">
            {card.hits}/{card.games}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/60">Projected ROI</div>
          <div className={`text-lg font-bold ${roiColor}`}>{Math.round(card.projectedROI)}%</div>
          <div className="text-xs text-white/50">Expected value</div>
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-1 border-t border-white/10 pt-3">
        {card.metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between text-xs">
            <span className="text-white/60">
              {metric.icon} {metric.label}
            </span>
            <span className="font-semibold text-white">{metric.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TrendDetailModalProps {
  card: TrendCard;
  onClose: () => void;
  teamLogos: Record<string, { logoUrl: string; primaryColor: string }>;
}

function TrendDetailModal({ card, onClose, teamLogos }: TrendDetailModalProps) {
  const detailData = generateDetailData(card);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1117] p-8"
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {(teamLogos[card.team]?.logoUrl ? (
                <img src={teamLogos[card.team].logoUrl} alt={card.team} className="h-12 w-12 shrink-0 object-contain" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-full" style={{ backgroundColor: teamLogos[card.team]?.primaryColor || "#ffffff" }} />
              ))}
              <div>
                <h1 className="text-3xl font-black text-white">{card.playerName}</h1>
                <p className="text-white/60">{card.team} • {card.matchup}</p>
              </div>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2 inline-block mt-2">
              <p className="text-sm font-semibold text-white">{card.stat}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-white/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Stats Grid */}
        <div className="mb-8 grid grid-cols-2 gap-4">
          {detailData.stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-white/10 bg-[#111620] p-4">
              <h3 className="mb-3 text-sm font-semibold text-white/60">{stat.label}</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-white/60">Games</span>
                  <span className="font-bold text-white">{stat.games}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Yards</span>
                  <span className="font-bold text-emerald-400">{stat.yards}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Attempts</span>
                  <span className="font-bold text-white">{stat.attempts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">TD</span>
                  <span className="font-bold text-sky-400">{stat.td}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Targets</span>
                  <span className="font-bold text-white">{stat.targets}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Injury Report & Weather */}
        <div className="mb-8 grid grid-cols-2 gap-4">
          {/* Injury Report */}
          <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
            <h3 className="mb-3 text-sm font-semibold text-white/60">Injury Report</h3>
            <div
              className={`mb-3 inline-block rounded-lg px-3 py-1.5 text-xs font-bold ${
                detailData.injuryReport.status === "Healthy"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : detailData.injuryReport.status === "Out"
                  ? "bg-rose-500/20 text-rose-200"
                  : "bg-amber-500/20 text-amber-200"
              }`}
            >
              {detailData.injuryReport.status}
            </div>
            <p className="text-sm text-white/80">{detailData.injuryReport.summary}</p>
          </div>

          {/* Weather */}
          <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
            <h3 className="mb-3 text-sm font-semibold text-white/60">Weather</h3>
            <div className="mb-2 text-lg font-bold text-white">{detailData.weather.summary}</div>
            <p className="text-sm text-white/80">{detailData.weather.details}</p>
          </div>
        </div>

        {/* Opponent Defensive Rank */}
        <div className="mb-8 rounded-lg border border-white/10 bg-[#111620] p-4">
          <h3 className="mb-3 text-sm font-semibold text-white/60">Opponent Defensive Rank</h3>
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-black text-white">#{detailData.defensiveRank.rank}</div>
            <p className="text-white/80">{detailData.defensiveRank.summary}</p>
          </div>
        </div>

        {/* Gamelog */}
        <div className="mb-8">
          <h3 className="mb-4 text-sm font-semibold text-white/60">Last 5 Games</h3>
          <div className="space-y-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 text-left text-white/60">Date</th>
                  <th className="px-3 py-2 text-left text-white/60">Opp</th>
                  <th className="px-3 py-2 text-left text-white/60">Result</th>
                  <th className="px-3 py-2 text-left text-white/60">Trend</th>
                  <th className="px-3 py-2 text-right text-white/60">Yards</th>
                  <th className="px-3 py-2 text-right text-white/60">TD</th>
                </tr>
              </thead>
              <tbody>
                {detailData.gamelog.map((game, idx) => (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/3">
                    <td className="px-3 py-2 text-white">{game.date}</td>
                    <td className="px-3 py-2 text-center">
                      {teamLogos[game.opponent]?.logoUrl ? (
                        <img src={teamLogos[game.opponent].logoUrl} alt={game.opponent} className="h-6 w-6 shrink-0 object-contain mx-auto" />
                      ) : (
                        <div className="h-6 w-6 shrink-0 rounded-full mx-auto" style={{ backgroundColor: teamLogos[game.opponent]?.primaryColor || "#ffffff" }} />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`font-bold ${
                          game.result === "W" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {game.result}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs font-bold ${
                          game.hit ? "text-emerald-400" : "text-white/40"
                        }`}
                      >
                        {game.hit ? "✓ HIT" : "✗ MISS"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-white">{game.yards}</td>
                    <td className="px-3 py-2 text-right text-white font-bold">{game.td}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bet Info */}
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="mb-1 text-sm text-white/60">Current Price</div>
              <div className="text-2xl font-black text-white">
                {card.price >= 0 ? "+" : ""}{card.price}
              </div>
            </div>
            <div className="border-l border-white/10"></div>
            <div>
              <div className="mb-1 text-sm text-white/60">Hit Rate</div>
              <div className="text-2xl font-black text-emerald-400">{Math.round(card.hitRate * 100)}%</div>
            </div>
            <div className="border-l border-white/10"></div>
            <div>
              <div className="mb-1 text-sm text-white/60">Projected ROI</div>
              <div
                className={`text-2xl font-black ${
                  card.projectedROI > 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {Math.round(card.projectedROI)}%
              </div>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
