import type { Meter, Provider, Report } from "./types";

export interface IslandSummary {
  provider: Provider;
  left: number | null;
  limitLabel: string | null;
  windowLabel: string | null;
  sessionLeft: number | null;
  weeklyLeft: number | null;
  account: string | null;
}

const left = (meter: Meter) => Math.max(0, 100 - meter.usedPercent);
const least = (meters: Meter[]) => meters.length ? Math.min(...meters.map(left)) : null;

function summarizeAccount(reports: Report[], provider: Provider): IslandSummary {
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
    account: null,
  };
}

const rank = (summary: IslandSummary) => [summary.left ?? -1, summary.weeklyLeft ?? -1, summary.sessionLeft ?? -1];
const better = (a: IslandSummary, b: IslandSummary) => {
  const [x, y] = [rank(a), rank(b)];
  const i = x.findIndex((value, index) => value !== y[index]);
  return i >= 0 && x[i] > y[i];
};

// Each account is summarized by its own tightest limit; the island then shows the
// account with the highest remaining percentage, since that is the one still usable.
export function summarizeIslandProvider(reports: Report[], provider: Provider): IslandSummary {
  const ids = [...new Set(reports.filter((report) => report.provider === provider).map((report) => report.accountId))];
  if (ids.length <= 1) return summarizeAccount(reports, provider);
  const best = ids
    .map((id) => {
      const own = reports.filter((report) => report.accountId === id);
      return { ...summarizeAccount(own, provider), account: own.find((report) => report.provider === provider)?.label || id };
    })
    .reduce((top, summary) => better(summary, top) ? summary : top);
  return best.left == null && best.sessionLeft == null && best.weeklyLeft == null ? summarizeAccount(reports, provider) : best;
}
