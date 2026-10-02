import { pctSignalMark } from "../lib/statLabels";

/** Glyph plus screen-reader label that backs up the emerald/amber/rose hit-rate color. */
export function SignalMark({ pct }: { pct: number }) {
  const { glyph, label } = pctSignalMark(pct);
  return (
    <>
      <span aria-hidden="true" className="mr-0.5 text-[0.7em]">
        {glyph}
      </span>
      <span className="sr-only">{label}: </span>
    </>
  );
}
