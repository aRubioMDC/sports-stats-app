import type { SelectHTMLAttributes } from "react";

/** Consistently styled <select>: hides the native browser arrow (which renders
 * inconsistently, often ugly, on a dark background) in favor of one shared chevron. */
export function Select({
  className = "",
  wrapperClassName = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <div className={`relative inline-flex ${wrapperClassName}`}>
      <select
        {...props}
        className={`w-full appearance-none rounded-full border border-white/10 bg-[#12141a] py-1.5 pl-3 pr-7 text-sm font-semibold text-white/80 transition hover:border-sky-400/40 focus:border-sky-400/50 focus:outline-none disabled:opacity-70 ${className}`}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40"
      >
        <path
          d="M5.5 7.5l4.5 4.5 4.5-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
