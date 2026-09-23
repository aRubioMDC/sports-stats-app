import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import type { Sport } from "../api";
import { Select } from "./Select";

function SportDropdown() {
  const [sports, setSports] = useState<Sport[]>([{ slug: "nfl", display_name: "NFL" }]);

  useEffect(() => {
    api.getSports().then(setSports).catch(() => undefined);
  }, []);

  return (
    <Select value="nfl" disabled={sports.length <= 1} className="bg-[#181b22]">
      {sports.map((s) => (
        <option key={s.slug} value={s.slug}>
          {s.display_name}
        </option>
      ))}
    </Select>
  );
}

function Header() {
  const location = useLocation();
  const isActive = (to: string) => (to === "/" ? location.pathname === to : location.pathname.startsWith(to));

  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={`rounded-full px-2.5 py-1.5 text-sm font-semibold transition ${
        isActive(to) ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 bg-[#0b0d12]/95 px-4 py-3 backdrop-blur">
      <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
        <span>🏈</span> SportStats
      </Link>
      <SportDropdown />
      <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/3 p-1 sm:ml-4">
        {navLink("/", "Home")}
        {navLink("/trends", "Trends")}
        {navLink("/cheatsheet", "Cheatsheet")}
      </nav>
    </header>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0b0d12] text-white">
      <Header />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
