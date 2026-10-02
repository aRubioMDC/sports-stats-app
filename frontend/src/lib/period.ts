import type { Config } from "../api";

export const APP_TIMEZONE = "America/Mexico_City";

export function formatDateInAppTimezone(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(undefined, { ...options, timeZone: APP_TIMEZONE });
}

export function formatDateTimeInAppTimezone(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString(undefined, { ...options, timeZone: APP_TIMEZONE });
}

export function formatKickoff(kickoff: string | null): string {
  if (!kickoff) return "TBD";
  return formatDateTimeInAppTimezone(new Date(kickoff), {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Turns a raw `week` bucket into the real calendar date it represents, for
 * sports with no native week concept (period_unit === "day") — null when the
 * sport doesn't work this way (e.g. NFL) or the anchor isn't available yet. */
export function periodDate(config: Config | undefined, week: number | null): Date | null {
  if (!config || config.period_unit !== "day" || !config.period_anchor_date || week == null) return null;
  const anchor = new Date(`${config.period_anchor_date}T00:00:00`);
  anchor.setDate(anchor.getDate() + week);
  return anchor;
}

/** Header/pager label for a given `week` value — a real date for day-based
 * sports (NHL), "Week N" otherwise (NFL). */
export function periodLabel(config: Config | undefined, week: number | null): string {
  const date = periodDate(config, week);
  if (date) {
    return formatDateInAppTimezone(date, { weekday: "long", month: "long", day: "numeric" });
  }
  return `Week ${week ?? ""}`;
}

/** Short label for compact spots (pager buttons, recent-games rows). */
export function periodLabelShort(config: Config | undefined, week: number | null): string {
  const date = periodDate(config, week);
  if (date) {
    return formatDateInAppTimezone(date, { month: "short", day: "numeric" });
  }
  return `Wk ${week ?? ""}`;
}

/** The real calendar year a season starts in — NFL uses a plain year (2025),
 * NHL uses a dual-year season id (20252026) that isn't directly comparable
 * to another season's id by subtraction (20262027 - 20252026 = 10001, not 1). */
export function seasonStartYear(season: number): number {
  return season > 9999 ? Math.floor(season / 10000) : season;
}
