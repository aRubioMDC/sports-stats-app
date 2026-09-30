import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "bankroll_usd";
const DEFAULT_BANKROLL = 1000;

interface BankrollContextValue {
  bankroll: number;
  setBankroll: (value: number) => void;
}

const BankrollContext = createContext<BankrollContextValue | null>(null);

// Session-local only — no accounts, no real money tracking. Just lets the
// Kelly-fraction suggestions below show a dollar amount instead of a bare %.
export function BankrollProvider({ children }: { children: ReactNode }) {
  const [bankroll, setBankrollState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BANKROLL;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(bankroll));
  }, [bankroll]);

  const setBankroll = (value: number) => {
    setBankrollState(Number.isFinite(value) && value >= 0 ? value : 0);
  };

  return <BankrollContext.Provider value={{ bankroll, setBankroll }}>{children}</BankrollContext.Provider>;
}

export function useBankroll(): BankrollContextValue {
  const ctx = useContext(BankrollContext);
  if (!ctx) throw new Error("useBankroll must be used within a BankrollProvider");
  return ctx;
}
