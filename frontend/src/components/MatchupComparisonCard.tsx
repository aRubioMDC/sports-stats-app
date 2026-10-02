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

function TeamBanner({ abbr, color, logoUrl }: { abbr: string; color: string; logoUrl: string }) {
  return (
    <div
      className="flex flex-1 items-center justify-center gap-3 text-lg font-bold tracking-wide text-white"
      style={{ backgroundColor: color }}
    >
      {logoUrl && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/90 p-1">
          <img src={logoUrl} alt="" className="h-full w-full object-contain" />
        </span>
      )}
      {abbr}
    </div>
  );
}

export function MatchupComparisonCard({
  homeAbbr,
  awayAbbr,
  homeColor,
  awayColor,
  homeLogo,
  awayLogo,
  rows,
}: {
  homeAbbr: string;
  awayAbbr: string;
  homeColor: string;
  awayColor: string;
  homeLogo: string;
  awayLogo: string;
  rows: StatRow[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#12141a]">
      <div className="flex h-14">
        <TeamBanner abbr={awayAbbr} color={awayColor} logoUrl={awayLogo} />
        <TeamBanner abbr={homeAbbr} color={homeColor} logoUrl={homeLogo} />
      </div>
      <div>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center border-b border-white/5 px-4 py-4 last:border-0">
            <div className="flex-1 text-center">
              <div className={`text-xl font-bold ${row.leader === "away" ? "text-emerald-400" : "text-white"}`}>
                {formatValue(row.label, row.away_value)}
              </div>
              <div className="text-xs text-white/40">{ordinal(row.away_rank)}</div>
            </div>
            <div className="w-32 shrink-0 px-1 text-center text-[11px] font-semibold uppercase tracking-wide text-white/60 sm:w-48 sm:text-xs">
              {row.label}
            </div>
            <div className="flex-1 text-center">
              <div className={`text-xl font-bold ${row.leader === "home" ? "text-emerald-400" : "text-white"}`}>
                {formatValue(row.label, row.home_value)}
              </div>
              <div className="text-xs text-white/40">{ordinal(row.home_rank)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
