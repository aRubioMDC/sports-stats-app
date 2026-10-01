import { useMemo } from "react";
import { useTeams } from "../api";

export interface TeamLogoInfo {
  logoUrl: string;
  primaryColor: string;
}

/** Team abbreviation -> logo/color lookup, computed once per teams fetch.
 * Previously recomputed identically in Home.tsx, Trends.tsx, Cheatsheet.tsx,
 * and PlayerDetail.tsx. */
export function useTeamLogos(): Record<string, TeamLogoInfo> {
  const teamsQuery = useTeams();
  return useMemo(() => {
    if (!teamsQuery.data) return {};
    return teamsQuery.data.reduce(
      (acc, team) => {
        acc[team.abbreviation] = { logoUrl: team.logo_url, primaryColor: team.primary_color };
        return acc;
      },
      {} as Record<string, TeamLogoInfo>
    );
  }, [teamsQuery.data]);
}
