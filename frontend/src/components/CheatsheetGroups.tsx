import { useState } from "react";
import type { CheatsheetRow } from "../api";
import { formatTrendLine } from "../lib/statLabels";

interface Category {
  icon: string;
  title: string;
  rows: CheatsheetRow[];
}

function GroupColumn({ 
  icon, 
  title, 
  rows,
  teamLogos 
}: Category & { teamLogos?: Record<string, { logoUrl: string; primaryColor: string }> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#12141a] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <span className="text-xs text-white/30">Not enough data yet.</span>}
        {rows.map((row, i) => {
          const teamLogo = teamLogos?.[row.team];
          return (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                {teamLogo?.logoUrl ? (
                  <img src={teamLogo.logoUrl} alt={row.team} className="h-5 w-5 shrink-0 object-contain" />
                ) : (
                  <div className="h-5 w-5 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} title={row.team} />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{row.player_name}</div>
                  <div className="text-white/40">{formatTrendLine(row.stat_name, row.threshold, row.direction)}</div>
                </div>
              </div>
              <span className="font-semibold text-emerald-400 shrink-0">
                {row.hits}/{row.games}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Linemate-style "Cheatsheets" carousel — 3 columns per page, arrows to page through categories. */
export function CheatsheetGroups({
  recentForm,
  versusOpponent,
  alternateLines,
  homeAwaySplits,
  undersOnly,
  teamForm,
  teamLogos,
}: {
  recentForm: CheatsheetRow[];
  versusOpponent: CheatsheetRow[];
  alternateLines: CheatsheetRow[];
  homeAwaySplits: CheatsheetRow[];
  undersOnly: CheatsheetRow[];
  teamForm: CheatsheetRow[];
  teamLogos?: Record<string, { logoUrl: string; primaryColor: string }>;
}) {
  const categories: Category[] = [
    { icon: "⚡", title: "100% Recent Form", rows: recentForm },
    { icon: "🛡️", title: "100% Versus Opponent", rows: versusOpponent },
    { icon: "↗️", title: "100% Alternate Lines", rows: alternateLines },
    { icon: "📍", title: "100% Home/Away Games", rows: homeAwaySplits },
    { icon: "🔻", title: "100% Unders Only", rows: undersOnly },
    { icon: "👥", title: "100% Team Form", rows: teamForm },
  ];

  const totalPages = Math.ceil(categories.length / PAGE_SIZE);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const visible = categories.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const goToPage = (next: number) => {
    setDirection(next > page ? 1 : -1);
    setPage(next);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Cheatsheets</h2>
          <p className="text-sm text-white/50">Props that hit in 100% of games</p>
        </div>
        {totalPages > 1 && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(Math.max(0, page - 1))}
              disabled={page === 0}
              aria-label="Previous categories"
              className="rounded-full border border-white/10 px-2.5 py-1 text-white/60 transition hover:border-sky-400/40 hover:text-sky-400 disabled:opacity-30"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goToPage(Math.min(totalPages - 1, page + 1))}
              disabled={page === totalPages - 1}
              aria-label="Next categories"
              className="rounded-full border border-white/10 px-2.5 py-1 text-white/60 transition hover:border-sky-400/40 hover:text-sky-400 disabled:opacity-30"
            >
              ›
            </button>
          </div>
        )}
      </div>
      <div
        key={page}
        style={{ "--slide-from": direction >= 0 ? "20px" : "-20px" } as React.CSSProperties}
        className="animate-carousel-slide grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        {visible.map((cat) => (
          <GroupColumn key={cat.title} icon={cat.icon} title={cat.title} rows={cat.rows} teamLogos={teamLogos} />
        ))}
      </div>
    </div>
  );
}

const PAGE_SIZE = 3;

