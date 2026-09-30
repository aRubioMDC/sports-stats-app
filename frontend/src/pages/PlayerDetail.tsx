import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTeams, usePlayerInfo, usePlayerCheatsheet } from "../api";
import { CheatsheetRowCard } from "../components/CheatsheetRowCard";

/**
 * A dedicated page for one real player, showing EVERY real signal computed
 * for them (not just the ones that made the site-wide top-100 cheatsheet cut)
 * — same enrichment pipeline (splits/H2H/injury/opponent-rank/market-edge/
 * Kelly), just scoped to a single player so weaker signals stay visible too.
 */
export function PlayerDetail() {
  const { playerId: playerIdParam } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const playerId = playerIdParam ? Number(playerIdParam) : null;

  const playerInfoQuery = usePlayerInfo(playerId);
  const cheatsheetQuery = usePlayerCheatsheet(playerId);
  const teamsQuery = useTeams();

  const teamLogos = useMemo(() => {
    if (!teamsQuery.data) return {};
    return teamsQuery.data.reduce(
      (acc, team) => {
        acc[team.abbreviation] = { logoUrl: team.logo_url, primaryColor: team.primary_color };
        return acc;
      },
      {} as Record<string, { logoUrl: string; primaryColor: string }>
    );
  }, [teamsQuery.data]);

  if (playerId == null || Number.isNaN(playerId)) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-white/70">
        Invalid player.{" "}
        <Link to="/cheatsheet" className="text-emerald-400 hover:underline">
          Back to Cheatsheet
        </Link>
      </div>
    );
  }

  const loading = playerInfoQuery.isLoading || cheatsheetQuery.isLoading;
  const player = playerInfoQuery.data;
  const rows = cheatsheetQuery.data ?? [];
  const teamLogo = player?.team ? teamLogos[player.team] : undefined;

  if (playerInfoQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-white/70">
        <button onClick={() => navigate(-1)} className="mb-4 text-sm text-white/50 hover:text-white">
          ‹ Back
        </button>
        <p>Player not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-white/50 hover:text-white">
        ‹ Back
      </button>

      {loading && !player ? (
        <div className="text-white/50">Loading…</div>
      ) : player ? (
        <div className="mb-6 flex items-center gap-4">
          {player.headshot_url ? (
            <img src={player.headshot_url} alt={player.full_name} className="h-16 w-16 shrink-0 rounded-full object-cover" />
          ) : teamLogo?.logoUrl ? (
            <img src={teamLogo.logoUrl} alt={player.team ?? ""} className="h-16 w-16 shrink-0 object-contain" />
          ) : (
            <div
              className="h-16 w-16 shrink-0 rounded-full"
              style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }}
            />
          )}
          <div>
            <h1 className="text-2xl font-black text-white sm:text-3xl">{player.full_name}</h1>
            <p className="text-sm text-white/60">
              {player.position}
              {player.team && ` • ${player.team}`}
            </p>
          </div>
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold text-white/50">
        All real signals ({rows.length}) — including weaker ones, no top-100 cutoff
      </h2>

      {!loading && rows.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-[#111620] p-6 text-center text-white/50">
          No recent-form signals with enough games yet for this player.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row, idx) => (
          <CheatsheetRowCard key={`${row.stat_name}-${row.threshold}-${row.direction}-${idx}`} row={row} teamLogos={teamLogos} />
        ))}
      </div>
    </div>
  );
}
