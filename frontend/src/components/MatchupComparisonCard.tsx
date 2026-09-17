import type { StatRow } from "../api";

function formatValue(label: string, value: number): string {
  if (label === "Time of Possession Per Game") {
    const minutes = Math.floor(value / 60);
    const seconds = Math.round(value % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  if (label === "Total Turnover Differential") {
    return value > 0 ? `+${value}` : `${value}`;
  }
  return `${value}`;
}

function ordinal(n: number): string {
  const s = ["TH", "ST", "ND", "RD"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function MatchupComparisonCard({
  homeAbbr,
  awayAbbr,
  homeColor,
  awayColor,
  rows,
}: {
  homeAbbr: string;
  awayAbbr: string;
  homeColor: string;
  awayColor: string;
  rows: StatRow[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#12141a]">
      <div className="flex h-14">
        <div
          className="flex flex-1 items-center justify-center text-lg font-bold tracking-wide text-white"
          style={{ backgroundColor: awayColor }}
        >
          {awayAbbr}
        </div>
        <div
          className="flex flex-1 items-center justify-center text-lg font-bold tracking-wide text-white"
          style={{ backgroundColor: homeColor }}
        >
          {homeAbbr}
        </div>
      </div>
      <div>
        {rows.map((row) => (
          <div key={row.label} className="relative flex items-center border-b border-white/5 px-4 py-4 last:border-0">
            <span
              className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${row.leader === "away" ? "bg-sky-400" : "opacity-0"}`}
            />
            <div className="flex-1 text-center">
              <div className="text-xl font-bold text-white">{formatValue(row.label, row.away_value)}</div>
              <div className="text-xs text-white/40">{ordinal(row.away_rank)}</div>
            </div>
            <div className="w-48 shrink-0 text-center text-xs font-semibold uppercase tracking-wide text-white/60">
              {row.label}
            </div>
            <div className="flex-1 text-center">
              <div className="text-xl font-bold text-white">{formatValue(row.label, row.home_value)}</div>
              <div className="text-xs text-white/40">{ordinal(row.home_rank)}</div>
            </div>
            <span
              className={`absolute right-0 top-2 bottom-2 w-1 rounded-l ${row.leader === "home" ? "bg-sky-400" : "opacity-0"}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
