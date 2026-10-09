// Pure scoring: no database or framework imports, so it is easy to test and tune.

export type Factor = 'skills' | 'location' | 'availability' | 'experience' | 'rate' | 'language';
export type Weights = Record<Factor, number>;
export interface MatchingTuning {
  minimumScore: number;
  siblingAreaFactor: number;
  withinTwoWeeks: number;
  laterAvailability: number;
  rateTolerancePct: number;
}

export interface WorkerM {
  skills: string[]; languages: string[]; experience_years: number; rate_expected: number;
  availability: string; territory_id: number | null; territory_parent_id: number | null;
}
export interface RequestM {
  skills_required: string[]; languages_required: string[]; min_experience: number;
  rate_offered: number; territory_id: number | null; territory_parent_id: number | null;
}

const norm = (a: string[]) => a.map((x) => x.trim().toLowerCase());
/** Share of the needed items the worker has (1 when nothing is required). */
const overlap = (need: string[], have: string[]) => {
  if (!need.length) return 1;
  const h = new Set(norm(have));
  const n = norm(need);
  return n.filter((x) => h.has(x)).length / n.length;
};
const DEFAULT_TUNING: MatchingTuning = {
  minimumScore: 0,
  siblingAreaFactor: 0.5,
  withinTwoWeeks: 0.6,
  laterAvailability: 0.2,
  rateTolerancePct: 50,
};

export function matchingTuningFromRules(rl: Record<string, number>): MatchingTuning {
  return {
    minimumScore: rl.match_minimum_score ?? DEFAULT_TUNING.minimumScore,
    siblingAreaFactor: rl.match_sibling_area_factor ?? DEFAULT_TUNING.siblingAreaFactor,
    withinTwoWeeks: rl.match_availability_within_2_weeks ?? DEFAULT_TUNING.withinTwoWeeks,
    laterAvailability: rl.match_availability_later ?? DEFAULT_TUNING.laterAvailability,
    rateTolerancePct: rl.match_rate_tolerance_pct ?? DEFAULT_TUNING.rateTolerancePct,
  };
}

export function weightsFromRules(rl: Record<string, number>): Weights {
  return {
    skills: rl.match_w_skills ?? 30, location: rl.match_w_location ?? 20, availability: rl.match_w_availability ?? 15,
    experience: rl.match_w_experience ?? 10, rate: rl.match_w_rate ?? 10, language: rl.match_w_language ?? 10,
  };
}

export function scoreMatch(w: WorkerM, r: RequestM, wt: Weights, tuning = DEFAULT_TUNING) {
  const sameArea = w.territory_id != null && w.territory_id === r.territory_id;
  const sibling = w.territory_parent_id != null && w.territory_parent_id === r.territory_parent_id;
  const parts: Record<Factor, number> = {
    skills: overlap(r.skills_required, w.skills),
    location: sameArea ? 1 : sibling ? tuning.siblingAreaFactor : 0,
    availability: w.availability === 'immediate' ? 1
      : w.availability === 'within_2_weeks' ? tuning.withinTwoWeeks
        : w.availability === 'later' ? tuning.laterAvailability : 0,
    experience: r.min_experience > 0 ? Math.min(1, w.experience_years / r.min_experience) : 1,
    rate: r.rate_offered <= 0 || w.rate_expected <= r.rate_offered ? 1
      : Math.max(0, 1 - (100 * (w.rate_expected - r.rate_offered)) / (r.rate_offered * tuning.rateTolerancePct)),
    language: overlap(r.languages_required, w.languages),
  };
  const total = Object.values(wt).reduce((a, b) => a + b, 0);
  const sum = (Object.keys(parts) as Factor[]).reduce((a, k) => a + wt[k] * parts[k], 0);
  return { score: total > 0 ? Math.round((sum / total) * 1000) / 10 : 0, parts };
}
