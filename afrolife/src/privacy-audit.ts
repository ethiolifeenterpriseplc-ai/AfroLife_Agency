type RequestState = {
  status: string;
  assigned_to: string | null;
  response: string | null;
};

type IncidentState = {
  status: string;
  assigned_to: string | null;
  containment_actions: string | null;
  outcome: string | null;
};

export function privacyRequestChangeDetails(before: RequestState, after: RequestState) {
  return {
    before: { status: before.status, assigned_to: before.assigned_to },
    after: { status: after.status, assigned_to: after.assigned_to },
    response_changed: before.response !== after.response,
    response_length: after.response?.length ?? 0,
  };
}

export function privacyIncidentChangeDetails(before: IncidentState, after: IncidentState) {
  return {
    before: {
      status: before.status,
      assigned_to: before.assigned_to,
      containment_recorded: Boolean(before.containment_actions),
      outcome_recorded: Boolean(before.outcome),
    },
    after: {
      status: after.status,
      assigned_to: after.assigned_to,
      containment_recorded: Boolean(after.containment_actions),
      outcome_recorded: Boolean(after.outcome),
    },
    containment_changed: before.containment_actions !== after.containment_actions,
    outcome_changed: before.outcome !== after.outcome,
  };
}
