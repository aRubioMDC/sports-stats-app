export const STAT_LABELS: Record<string, string> = {
  receptions: "Receptions",
  receiving_yards: "Rec Yards",
  rushing_yards: "Rush Yards",
  passing_yards: "Pass Yards",
  team_points: "Team Points",
  game_total_points: "Game Total",
};

export function formatTrendLine(statName: string, threshold: number, direction: string): string {
  const label = STAT_LABELS[statName] ?? statName;
  return `${direction === "over" ? "Over" : "Under"} ${threshold} ${label}`;
}

/** Match-row trends are team/game markets (ML, team total, game total), not player props. */
export function formatMarketTrendLine(row: { stat_name: string; threshold: number; direction: string }): string {
  if (row.stat_name === "moneyline") return "Moneyline";
  return formatTrendLine(row.stat_name, row.threshold, row.direction);
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

