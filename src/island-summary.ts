import type { Meter, Provider, Report } from "./types";

export interface IslandSummary {
  provider: Provider;
  left: number | null;
  limitLabel: string | null;
  windowLabel: string | null;
  sessionLeft: number | null;
  weeklyLeft: number | null;
}

const left = (meter: Meter) => Math.max(0, 100 - meter.usedPercent);
const least = (meters: Meter[]) => meters.length ? Math.min(...meters.map(left)) : null;

export function summarizeIslandProvider(reports: Report[], provider: Provider): IslandSummary {
  const meters = reports
    .filter((report) => report.provider === provider && report.ok)
    .flatMap((report) => report.meters.filter((meter) => meter.unit === "percent" || (meter.limit ?? 0) > 0));
  const limiting = meters.reduce<Meter | null>((worst, meter) =>
    !worst || left(meter) < left(worst) ? meter : worst, null);
  const claude = provider === "claude";
  const session = claude ? meters.filter((meter) => meter.key === "five_hour" || meter.key.startsWith("session:")) : [];
  const weekly = claude ? meters.filter((meter) => meter.key === "seven_day" || meter.key.startsWith("weekly_all:")) : [];
  return {
    provider,
    left: limiting ? left(limiting) : null,
    limitLabel: limiting?.label ?? null,
    windowLabel: limiting?.windowSecs === 18_000 ? "5h" : limiting?.windowSecs === 604_800 ? "7d" : null,
    sessionLeft: least(session),
    weeklyLeft: least(weekly),
  };
}
