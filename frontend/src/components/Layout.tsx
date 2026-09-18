import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import type { Sport } from "../api";

function SportDropdown() {
  const [sports, setSports] = useState<Sport[]>([{ slug: "nfl", display_name: "NFL" }]);

  useEffect(() => {
    api.getSports().then(setSports).catch(() => undefined);
  }, []);

  return (
    <select
      value="nfl"
      disabled={sports.length <= 1}
      className="rounded-full border border-white/15 bg-[#181b22] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-70"
    >
      {sports.map((s) => (
        <option key={s.slug} value={s.slug}>
          {s.display_name}
        </option>
      ))}
    </select>
  );
}

function Header() {
  const location = useLocation();
  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={`text-sm font-semibold transition ${
        location.pathname === to ? "text-white" : "text-white/50 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-white/10 bg-[#0b0d12]/95 px-4 py-3 backdrop-blur">
      <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
        <span>🏈</span> SportStats
      </Link>
      <SportDropdown />
      <nav className="ml-4 flex items-center gap-4">
        {navLink("/", "Home")}
        {navLink("/cheatsheet", "Cheatsheet")}
      </nav>
    </header>
  );
}

function LeagueSidebar() {
  const [sports, setSports] = useState<Sport[]>([{ slug: "nfl", display_name: "NFL" }]);

  useEffect(() => {
    api.getSports().then(setSports).catch(() => undefined);
  }, []);

  return (
    <aside className="hidden w-56 shrink-0 border-r border-white/10 px-3 py-4 md:block">
      <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-white/40">Leagues</h2>
      <ul className="space-y-1">
        {sports.map((s) => (
          <li key={s.slug}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg bg-sky-500/10 px-2 py-2 text-left text-sm font-semibold text-sky-300"
            >
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              {s.display_name}
            </button>
          </li>
        ))}
        <li className="px-2 pt-2 text-xs text-white/30">More leagues coming soon</li>
      </ul>
    </aside>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0b0d12] text-white">
      <Header />
      <div className="flex">
        <LeagueSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
