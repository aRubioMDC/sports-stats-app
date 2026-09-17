import type { HeadToHeadResult } from "../api";

export function HeadToHeadTable({ results }: { results: HeadToHeadResult[] }) {
  if (results.length === 0) {
    return <p className="text-sm text-white/40">No previous meetings found.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-white/40">
          <th className="pb-2 font-medium">Season</th>
          <th className="pb-2 font-medium">Matchup</th>
          <th className="pb-2 font-medium text-right">Score</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={`${r.season}-${r.week}`} className="border-t border-white/5">
            <td className="py-2 text-white/70">{r.season} · Wk {r.week}</td>
            <td className="py-2 text-white/70">{r.away_team} @ {r.home_team}</td>
            <td className="py-2 text-right font-semibold text-white">
              {r.away_score} - {r.home_score}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
