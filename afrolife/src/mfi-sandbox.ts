export const MFI_SANDBOX_SIMULATIONS = ['crb', 'biometrics', 'payment_rail', 'regulatory_return', 'ml_shadow'] as const;
export type MfiSandboxSimulation = typeof MFI_SANDBOX_SIMULATIONS[number];

const scenarios: Record<MfiSandboxSimulation, readonly string[]> = {
  crb: ['clear_file', 'thin_file', 'adverse_history'],
  biometrics: ['match', 'uncertain', 'no_match'],
  payment_rail: ['success', 'pending', 'failed'],
  regulatory_return: ['monthly_mfi', 'suspicious_activity_summary'],
  ml_shadow: ['synthetic_portfolio_batch'],
};

export function mfiSandboxScenarios(simulation: MfiSandboxSimulation) {
  return scenarios[simulation];
}

function syntheticChallengerBatch() {
  const sample = [
    { id: 'SYN-001', debt_service_ratio: 0.12, arrears_days_at_snapshot: 0, savings_coverage_ratio: 0.65, tenure_years: 4 },
    { id: 'SYN-002', debt_service_ratio: 0.38, arrears_days_at_snapshot: 12, savings_coverage_ratio: 0.20, tenure_years: 1 },
    { id: 'SYN-003', debt_service_ratio: 0.52, arrears_days_at_snapshot: 48, savings_coverage_ratio: 0.08, tenure_years: 0.5 },
    { id: 'SYN-004', debt_service_ratio: 0.24, arrears_days_at_snapshot: 0, savings_coverage_ratio: 0.35, tenure_years: 2 },
  ];
  const scored = sample.map((row) => {
    // Fixed illustrative logistic transform to smoke-test a scoring pipeline on synthetic, decision-time fields.
    const z = -2.5 + 4.1 * row.debt_service_ratio
      + 1.6 * Math.min(row.arrears_days_at_snapshot, 90) / 90
      - 1.2 * row.savings_coverage_ratio
      - 0.18 * Math.min(row.tenure_years, 5);
    const index = Math.round(100 / (1 + Math.exp(-z)));
    return { synthetic_id: row.id, shadow_risk_index: index, fields_used: Object.keys(row).filter((key) => key !== 'id') };
  });
  return {
    model_id: 'illustrative-logistic-challenger',
    model_version: 'sandbox-fixed-coefficients-v1',
    rows_scored: scored.length,
    rows: scored,
    metric_label: 'synthetic shadow risk index (0-100), not a probability of default',
    production_status: 'disconnected_shadow_only',
    limitations: [
      'Synthetic records and hand-set coefficients only; this is not a trained or validated model.',
      'No real member data, production features, approval, decline, pricing, or prioritization is used.',
      'Production promotion still requires leakage review, real lawful outcome data, independent validation, fairness review, and institution approval.',
    ],
  };
}

export function runMfiSandboxSimulation(simulation: MfiSandboxSimulation, scenario: string) {
  if (!scenarios[simulation].includes(scenario)) throw new TypeError('Unsupported sandbox scenario');
  let result: Record<string, unknown>;
  switch (simulation) {
    case 'crb':
      result = {
        provider: 'Mock CRB adapter', reference: `CRB-MOCK-${scenario.toUpperCase()}`,
        status: 'simulated_response', subject: { synthetic_id: 'SYN-BORROWER-001' },
        scenario, bureau_score: scenario === 'clear_file' ? 720 : scenario === 'thin_file' ? null : 480,
        tradeline_count: scenario === 'thin_file' ? 0 : 3,
        notice: 'Fictional bureau result. No bureau, credit record, or real person was queried.',
      };
      break;
    case 'biometrics':
      result = {
        provider: 'Mock identity verification adapter', reference: `BIO-MOCK-${scenario.toUpperCase()}`,
        status: scenario === 'match' ? 'simulated_match' : scenario === 'uncertain' ? 'simulated_manual_review' : 'simulated_no_match',
        subject: { synthetic_id: 'SYN-MEMBER-001' }, similarity_index: scenario === 'match' ? 98.2 : scenario === 'uncertain' ? 71.4 : 18.7,
        notice: 'Synthetic comparison only. No biometric template or KYC decision was created.',
      };
      break;
    case 'payment_rail':
      result = {
        provider: 'Mock mobile-money rail', reference: `PAY-MOCK-${scenario.toUpperCase()}`,
        status: `simulated_${scenario}`, amount: '1250.00', currency: 'ETB',
        from: 'SYN-ACCOUNT-001', to: 'SYN-ACCOUNT-002',
        notice: 'Simulated transfer only. No funds moved, provider was not called, and no ledger journal was posted.',
      };
      break;
    case 'regulatory_return':
      result = scenario === 'monthly_mfi' ? {
        template: 'Illustrative MFI monthly return', reporting_period: '2026-09', status: 'simulated_draft',
        synthetic_totals: { active_members: 1250, disbursed_loans: 430, outstanding_principal_etb: '18450000.00', par_30_pct: 6.8 },
        notice: 'Synthetic template for workflow testing. Not an NBE return and not submitted.',
      } : {
        template: 'Illustrative suspicious-activity summary', reporting_period: '2026-09', status: 'simulated_draft',
        synthetic_totals: { alerts_reviewed: 12, escalated: 2, closed_no_filing: 10 },
        notice: 'Synthetic compliance summary. Not a CTR/STR determination and not submitted to a regulator.',
      };
      break;
    case 'ml_shadow':
      result = syntheticChallengerBatch();
      break;
  }
  return {
    simulation, scenario, sandbox_only: true, real_provider_called: false,
    production_side_effects: false, real_customer_data_used: false, result,
  };
}
