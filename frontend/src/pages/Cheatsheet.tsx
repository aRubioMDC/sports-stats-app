import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { CheatsheetRow } from "../api";
import { CheatsheetRowCard } from "../components/CheatsheetRowCard";
import { Select } from "../components/Select";

export function Cheatsheet() {
  const [rows, setRows] = useState<CheatsheetRow[]>([]);
  const [minHitRate, setMinHitRate] = useState(1.0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getCheatsheet(minHitRate, 3)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [minHitRate]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/" className="text-sm text-sky-400 hover:underline">
        ← Back to schedule
      </Link>
      <h1 className="mt-4 mb-1 text-xl font-bold text-white">Hit-Rate Cheatsheet</h1>
      <p className="mb-6 text-sm text-white/50">Props that have hit consistently in recent games.</p>

      <label className="mb-4 block text-sm text-white/60">
        Minimum hit rate
        <Select
          value={minHitRate}
          onChange={(e) => setMinHitRate(Number(e.target.value))}
          wrapperClassName="ml-2 align-middle"
        >
          <option value={1.0}>100%</option>
          <option value={0.8}>80%+</option>
          <option value={0.6}>60%+</option>
        </Select>
      </label>

      {loading && <p className="text-white/50">Loading…</p>}
      <div className="space-y-2">
        {rows.map((row, i) => (
          <CheatsheetRowCard key={`${row.player_name}-${row.stat_name}-${row.threshold}-${i}`} row={row} />
        ))}
        {!loading && rows.length === 0 && <p className="text-white/40">No props match this filter.</p>}
      </div>
    </div>
  );
}
