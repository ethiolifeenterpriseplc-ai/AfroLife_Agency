import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingTuningFromRules, scoreMatch, weightsFromRules } from '../src/matching.js';
import type { WorkerM, RequestM } from '../src/matching.js';

const W = weightsFromRules({}); // defaults: skills 30, location 20, availability 15, experience 10, rate 10, language 10
const req: RequestM = { skills_required: ['cooking', 'cleaning'], languages_required: ['amharic'], min_experience: 2, rate_offered: 10000, territory_id: 1, territory_parent_id: 9 };
const perfect: WorkerM = { skills: ['Cooking', 'cleaning'], languages: ['Amharic', 'English'], experience_years: 5, rate_expected: 9000, availability: 'immediate', territory_id: 1, territory_parent_id: 9 };

test('a worker who meets every requirement scores 100', () => {
  assert.equal(scoreMatch(perfect, req, W).score, 100);
});

test('half the required skills lowers the score proportionally to the skills weight', () => {
  assert.equal(scoreMatch({ ...perfect, skills: ['cooking'] }, req, W).score, 84.2);
});

test('a worker in a sibling area gets half the location marks', () => {
  assert.equal(scoreMatch({ ...perfect, territory_id: 2 }, req, W).score, 89.5);
});

test('a worker asking 50% above the offer gets no rate marks', () => {
  assert.equal(scoreMatch({ ...perfect, rate_expected: 15000 }, req, W).score, 89.5);
});

test('availability reduces the score', () => {
  const later = scoreMatch({ ...perfect, availability: 'later' }, req, W).score;
  assert.ok(later < 100 && later > scoreMatch({ ...perfect, availability: 'unavailable' }, req, W).score);
});

test('weights are normalised: doubling every weight changes nothing', () => {
  const doubled = Object.fromEntries(Object.entries(W).map(([k, v]) => [k, v * 2])) as typeof W;
  assert.equal(scoreMatch({ ...perfect, skills: ['cooking'] }, req, doubled).score, 84.2);
});

test('setting a weight to zero removes that factor', () => {
  assert.equal(scoreMatch({ ...perfect, skills: [] }, req, { ...W, skills: 0 }).score, 100);
});

test('requirements left empty do not penalise anyone', () => {
  const open: RequestM = { ...req, skills_required: [], languages_required: [], min_experience: 0 };
  assert.equal(scoreMatch({ ...perfect, skills: [], languages: [], experience_years: 0 }, open, W).score, 100);
});

test('matching policy values tune location, availability, rate tolerance, and minimum score', () => {
  const policy = matchingTuningFromRules({
    match_sibling_area_factor: 0.25,
    match_availability_within_2_weeks: 0.4,
    match_availability_later: 0.1,
    match_rate_tolerance_pct: 100,
    match_minimum_score: 90,
  });
  assert.equal(scoreMatch({ ...perfect, territory_id: 2 }, req, W, policy).score, 84.2);
  assert.equal(scoreMatch({ ...perfect, availability: 'within_2_weeks' }, req, W, policy).parts.availability, 0.4);
  assert.equal(scoreMatch({ ...perfect, availability: 'later' }, req, W, policy).parts.availability, 0.1);
  assert.equal(scoreMatch({ ...perfect, rate_expected: 15000 }, req, W, policy).parts.rate, 0.5);
  assert.equal(policy.minimumScore, 90);
});
