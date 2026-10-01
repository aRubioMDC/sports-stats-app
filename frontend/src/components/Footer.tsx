import { Link } from "react-router-dom";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-[#0b0d12] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">Navigation</h3>
            <ul className="space-y-1 text-xs text-white/60">
              <li>
                <Link to="/" className="transition hover:text-emerald-400">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/trends" className="transition hover:text-emerald-400">
                  Trends
                </Link>
              </li>
              <li>
                <Link to="/cheatsheet" className="transition hover:text-emerald-400">
                  Cheatsheet
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">Legal</h3>
            <ul className="space-y-1 text-xs text-white/60">
              <li>
                <Link to="/privacy" className="transition hover:text-emerald-400">
                  Privacy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="transition hover:text-emerald-400">
                  Terms
                </Link>
              </li>
              <li>
                <Link to="/disclaimer" className="transition hover:text-emerald-400">
                  Disclaimer
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">Resources</h3>
            <ul className="space-y-1 text-xs text-white/60">
              <li>
                <a href="https://www.ncpgambling.org/" target="_blank" rel="noopener noreferrer" className="transition hover:text-emerald-400">
                  Responsible Gaming
                </a>
              </li>
              <li>
                <a href="https://github.com/aRubioMDC/hitrate" target="_blank" rel="noopener noreferrer" className="transition hover:text-emerald-400">
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">Contact</h3>
            <ul className="space-y-1 text-xs text-white/60">
              <li>
                <a href="mailto:privacy@hitrate.app" className="transition hover:text-emerald-400">
                  Privacy
                </a>
              </li>
              <li>
                <a href="mailto:legal@hitrate.app" className="transition hover:text-emerald-400">
                  Legal
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 text-center text-xs text-white/50">
          <p>© {currentYear} HitRate. All rights reserved.</p>
          <p className="mt-1">
            HitRate is informational only. It is not financial or betting advice. Play responsibly.
          </p>
        </div>
      </div>
    </footer>
  );
}
