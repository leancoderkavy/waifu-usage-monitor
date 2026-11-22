import type { TourStep } from "./components/FeatureTour";

/** Content key so a parent re-creating an equal steps array doesn't reset an open tour. */
export function tourStepsKey(steps: TourStep[]): string {
  return JSON.stringify(steps.map((s) => [s.target, s.title, s.body]));
}

/**
 * Keep only steps whose target is on screen and keep the reader's place: the
 * index stays where it was, clamped to the steps that remain. Used when a tour
 * opens (index 0) and whenever its steps change while it is open, e.g. the
 * music card switching from transport controls to the Open Apple Music button.
 */
export function resolveTourSteps(
  steps: TourStep[],
  index: number,
  exists: (target: string) => boolean,
): { ready: TourStep[]; index: number } {
  const ready = steps.filter((s) => exists(s.target));
  return { ready, index: Math.max(0, Math.min(index, ready.length - 1)) };
}
