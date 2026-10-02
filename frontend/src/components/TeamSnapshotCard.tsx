import { FormDots } from "./FormDots";

/** NFL.com-style "at a glance" team card: logo, recent form, PPG/YPG with
 * league rank. Extracted from GameDetail.tsx (was used twice inline). */
export function TeamSnapshotCard({
  abbreviation,
  logoUrl,
  primaryColor,
  form,
  ppg,
  ppgRank,
  ypg,
  ypgRank,
  isDayBased,
}: {
  abbreviation: string;
  logoUrl: string;
  primaryColor: string;
  form: string[];
  ppg: number | undefined;
  ppgRank: number | undefined;
  ypg: number | undefined;
  ypgRank: number | undefined;
  isDayBased: boolean;
}) {
  // NHL reuses the same generic stat fields for different real-world stats
  // (points_per_game -> standings points pace, yards_per_game -> goals-for pace).
  const ppgLabel = isDayBased ? "PTS Pace" : "PPG";
  const ypgLabel = isDayBased ? "GF/GP" : "YPG";
  const hasAnySnapshotValue = ppg != null || ypg != null;
  return (
    <div className="flex-1 rounded-xl border border-white/10 bg-[#12141a] p-4">
      <div className="mb-3 flex items-center gap-2.5">
        {logoUrl ? (
          <img src={logoUrl} alt={abbreviation} className="h-9 w-9 shrink-0 object-contain" />
        ) : (
          <span className="h-9 w-9 shrink-0 rounded-full" style={{ backgroundColor: primaryColor }} />
        )}
        <div>
          <div className="text-base font-bold text-white">{abbreviation}</div>
          <FormDots form={form} />
        </div>
      </div>
      {!hasAnySnapshotValue && (
        <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-center text-[11px] text-white/55">
          Not enough games yet to compute team pace stats.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-center">
        <div>
          <div className="text-lg font-black text-white">{ppg ?? "N/A"}</div>
          <div className="text-[10px] uppercase tracking-wide text-white/40">
            {ppgLabel} {ppgRank != null && `· #${ppgRank}`}
          </div>
        </div>
        <div>
          <div className="text-lg font-black text-white">{ypg ?? "N/A"}</div>
          <div className="text-[10px] uppercase tracking-wide text-white/40">
            {ypgLabel} {ypgRank != null && `· #${ypgRank}`}
          </div>
        </div>
      </div>
    </div>
  );
}
