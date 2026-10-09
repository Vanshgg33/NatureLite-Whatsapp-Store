export type Stage =
  | 'DRAFT'
  | 'NEEDS_PO'
  | 'AWAITING_APPROVAL'
  | 'AWAITING_DELIVERY'
  | 'PARTLY_RECEIVED'
  | 'READY_TO_CLOSE'
  | 'CLOSED'
  | 'CANCELLED';

export const STAGE_LABEL: Record<Stage, string> = {
  DRAFT: 'Draft',
  NEEDS_PO: 'Needs PO',
  AWAITING_APPROVAL: 'Awaiting approval',
  AWAITING_DELIVERY: 'Awaiting delivery',
  PARTLY_RECEIVED: 'Partly received',
  READY_TO_CLOSE: 'Ready to close',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

// bg / text per spec §4.2
export const STAGE_COLORS: Record<Stage, { bg: string; text: string }> = {
  DRAFT:             { bg: '#F3F1EA', text: '#66706A' },
  NEEDS_PO:          { bg: '#FDF3E3', text: '#8A4B06' },
  AWAITING_APPROVAL: { bg: '#EDF3FB', text: '#1F4F8A' },
  AWAITING_DELIVERY: { bg: '#F0EFEA', text: '#3E4A43' },
  PARTLY_RECEIVED:   { bg: '#F0EFEA', text: '#3E4A43' },
  READY_TO_CLOSE:    { bg: '#EAF3EE', text: '#1E5E3F' },
  CLOSED:            { bg: '#EAF3EE', text: '#1E5E3F' },
  CANCELLED:         { bg: '#F3F1EA', text: '#66706A' },
};

// Client-side fallback: map repo stored status → Stage for docs without cached stage field
export function repoStatusToStage(status: string): Stage {
  const map: Record<string, Stage> = {
    DRAFT: 'DRAFT',
    REQUESTED: 'NEEDS_PO',
    REJECTED: 'NEEDS_PO',
    PO_CREATED: 'AWAITING_APPROVAL',
    SPLIT: 'AWAITING_APPROVAL',
    APPROVED: 'AWAITING_DELIVERY',
    VENDOR_BILL_UPLOADED: 'PARTLY_RECEIVED',
    COMPLETED: 'CLOSED',
    CANCELLED: 'CANCELLED',
  };
  return map[status] ?? 'NEEDS_PO';
}

// Returns the stage for a request, using cached stage field if available
export function getStage(req: { stage?: string; status: string }): Stage {
  return (req.stage as Stage | undefined) ?? repoStatusToStage(req.status);
}

const OPEN_STAGES = new Set<Stage>([
  'NEEDS_PO', 'AWAITING_APPROVAL', 'AWAITING_DELIVERY', 'PARTLY_RECEIVED', 'READY_TO_CLOSE',
]);

const STAGE_SLA_MS: Partial<Record<Stage, number>> = {
  NEEDS_PO: 2 * 86_400_000,
  AWAITING_APPROVAL: 1 * 86_400_000,
  AWAITING_DELIVERY: 5 * 86_400_000,
  PARTLY_RECEIVED: 5 * 86_400_000,
  READY_TO_CLOSE: 1 * 86_400_000,
};

type AnyReq = {
  requiredBy?: string | Date | null;
  stageEnteredAt?: string | Date | null;
  updatedAt?: string | Date;
  createdAt?: string | Date;
  deadline?: { dueAt: string };
};

// Returns ms of overdue duration, or null if not overdue
export function getOverdueMs(req: AnyReq, stage: Stage, now = Date.now()): number | null {
  if (!OPEN_STAGES.has(stage)) return null;

  if (req.requiredBy && (stage === 'AWAITING_DELIVERY' || stage === 'PARTLY_RECEIVED')) {
    const diff = now - new Date(req.requiredBy).getTime();
    if (diff > 0) return diff;
  }

  // Legacy deadline field (still present on old docs)
  if (req.deadline?.dueAt) {
    const diff = now - new Date(req.deadline.dueAt).getTime();
    if (diff > 0) return diff;
  }

  const sla = STAGE_SLA_MS[stage];
  const enteredAt = req.stageEnteredAt ?? req.updatedAt ?? req.createdAt;
  if (sla && enteredAt) {
    const elapsed = now - new Date(enteredAt).getTime();
    if (elapsed > sla) return elapsed - sla;
  }
  return null;
}

export function getWaitMs(req: AnyReq, now = Date.now()): number {
  const enteredAt = req.stageEnteredAt ?? req.updatedAt ?? req.createdAt;
  if (!enteredAt) return 0;
  return Math.max(0, now - new Date(enteredAt).getTime());
}
