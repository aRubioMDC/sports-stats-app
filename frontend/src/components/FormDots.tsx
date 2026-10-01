/** Last-N-games W/L/T indicator dots — shared by MatchRow (board) and GameDetail
 * (team snapshot), previously duplicated identically in both files. */
export function FormDots({ form }: { form: string[] }) {
  if (form.length === 0) {
    return <span className="text-xs text-white/30">—</span>;
  }
  return (
    <div className="flex gap-1">
      {form.map((result, i) => (
        <span
          key={i}
          title={result === "W" ? "Win" : result === "L" ? "Loss" : "Tie"}
          className={`h-2.5 w-2.5 rounded-full ${
            result === "W" ? "bg-emerald-400" : result === "L" ? "bg-red-500" : "bg-white/30"
          }`}
        />
      ))}
    </div>
  );
}
