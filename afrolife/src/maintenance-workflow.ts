export const MAINTENANCE_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  open: ['triaged', 'cancelled'],
  triaged: ['assigned', 'cancelled'],
  assigned: ['accepted', 'in_progress', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['awaiting_review', 'cancelled'],
  awaiting_review: ['completed', 'rework_required'],
  rework_required: ['in_progress', 'cancelled'],
};

export function canTransitionMaintenance(from: string, to: string): boolean {
  return MAINTENANCE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function requiresMaintenanceReview(status: string): boolean {
  return status === 'completed' || status === 'rework_required';
}
