export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export interface LadderRow {
  key: string | number;
  label: string;
  left: number;
  right: number;
  isMarket?: boolean;
}

/** Two-outcome ladder (over/under, cover/no-cover); the bar is the left outcome's share, the tick the market's. */
export function SplitLadder({
  rows,
  lineHeader,
  leftHeader,
  rightHeader,
  marketLeft,
}: {
  rows: LadderRow[];
  lineHeader: string;
  leftHeader: string;
  rightHeader: string;
  marketLeft?: number | null;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] text-white/40">
          <th className="pb-1 pl-2 text-left font-medium">{lineHeader}</th>
          <th className="pb-1 text-right font-medium">{leftHeader}</th>
          <th className="pb-1">
            <span className="sr-only">Share of {leftHeader.toLowerCase()}</span>
          </th>
          <th className="pb-1 pr-2 text-left font-medium">{rightHeader}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className={row.isMarket ? "bg-white/5" : undefined}>
            <td className="whitespace-nowrap rounded-l-md py-1.5 pl-2 pr-3 font-semibold text-white">
              {row.label}
              {row.isMarket && <span className="ml-1.5 text-[10px] font-normal text-white/50">Mkt</span>}
            </td>
            <td className="w-10 py-1.5 text-right font-semibold text-white">{pct(row.left)}</td>
            <td className="w-full px-3">
              <div aria-hidden="true" className="relative h-1.5 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white/60" style={{ width: `${row.left * 100}%` }} />
                {row.isMarket && marketLeft != null && (
                  <div
                    className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-white"
                    style={{ left: `calc(${marketLeft * 100}% - 1px)` }}
                  />
                )}
              </div>
            </td>
            <td className="w-10 rounded-r-md py-1.5 pr-2 text-left text-white/60">{pct(row.right)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MarginSide({
  value,
  max,
  color,
  side,
}: {
  value: number;
  max: number;
  color: string;
  side: "away" | "home";
}) {
  const track = (
    <div aria-hidden="true" className={`flex h-2 flex-1 rounded-full bg-white/5 ${side === "away" ? "justify-end" : ""}`}>
      <div
        className="h-full rounded-full ring-1 ring-inset ring-white/20"
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, backgroundColor: color }}
      />
    </div>
  );
  const number = <span className="w-9 text-sm font-semibold text-white">{pct(value)}</span>;
  return side === "away" ? (
    <div className="flex items-center gap-2">
      {number}
      {track}
    </div>
  ) : (
    <div className="flex items-center gap-2">
      {track}
      {number}
    </div>
  );
}

/** Diverging bars: how likely each side is to win by each margin band. */
export function MarginBars({
  buckets,
  awayAbbr,
  homeAbbr,
  awayColor,
  homeColor,
}: {
  buckets: Array<{ label: string; home: number; away: number }>;
  awayAbbr: string;
  homeAbbr: string;
  awayColor: string;
  homeColor: string;
}) {
  const max = Math.max(0, ...buckets.flatMap((b) => [b.home, b.away]));
  return (
    <div className="grid grid-cols-[1fr_3rem_1fr] items-center gap-x-2 gap-y-1.5">
      <span className="text-right text-[11px] text-white/40">{awayAbbr} wins by</span>
      <span />
      <span className="text-[11px] text-white/40">{homeAbbr} wins by</span>
      {buckets.map((bucket) => (
        <div key={bucket.label} className="contents">
          <MarginSide value={bucket.away} max={max} color={awayColor} side="away" />
          <span className="text-center text-xs font-semibold text-white/60">{bucket.label}</span>
          <MarginSide value={bucket.home} max={max} color={homeColor} side="home" />
        </div>
      ))}
    </div>
  );
}
