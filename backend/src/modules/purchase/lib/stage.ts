export type Stage =
  | 'DRAFT'
  | 'NEEDS_PO'
  | 'AWAITING_APPROVAL'
  | 'AWAITING_DELIVERY'
  | 'PARTLY_RECEIVED'
  | 'READY_TO_CLOSE'
  | 'CLOSED'
  | 'CANCELLED';

export type POBucket =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PARTLY_RECEIVED'
  | 'RECEIVED'
  | 'REJECTED'
  | 'CANCELLED';

// Map a child PurchaseRequest's stored status to a POBucket
export function statusToBucket(status: string): POBucket {
  const map: Record<string, POBucket> = {
    PO_CREATED: 'PENDING_APPROVAL',
    REJECTED: 'REJECTED',
    APPROVED: 'APPROVED',
    VENDOR_BILL_UPLOADED: 'PARTLY_RECEIVED',
    COMPLETED: 'RECEIVED',
    CANCELLED: 'CANCELLED',
  };
  return map[status] ?? 'PENDING_APPROVAL';
}

// Synthesise a pos array for non-SPLIT (single-vendor) parents
export function parentStatusToPos(status: string): { bucket: POBucket }[] {
  if (status === 'REQUESTED' || status === 'DRAFT') return [];
  return [{ bucket: statusToBucket(status) }];
}

// The one place that decides a request's stage.
export function deriveRequestStage(
  req: { status: string; closedAt?: Date | null },
  pos: { bucket: POBucket }[],
): Stage {
  if (req.status === 'CANCELLED') return 'CANCELLED';
  if (req.status === 'COMPLETED' || req.closedAt) return 'CLOSED';
  if (req.status === 'DRAFT') return 'DRAFT';

  const live = pos.filter(p => p.bucket !== 'CANCELLED' && p.bucket !== 'REJECTED');
  if (live.length === 0) return 'NEEDS_PO';
  if (live.some(p => p.bucket === 'DRAFT' || p.bucket === 'PENDING_APPROVAL')) return 'AWAITING_APPROVAL';
  if (live.every(p => p.bucket === 'RECEIVED')) return 'READY_TO_CLOSE';
  if (live.some(p => p.bucket === 'PARTLY_RECEIVED' || p.bucket === 'RECEIVED')) return 'PARTLY_RECEIVED';
  return 'AWAITING_DELIVERY';
}

const OPEN_STAGES = new Set<Stage>([
  'NEEDS_PO', 'AWAITING_APPROVAL', 'AWAITING_DELIVERY', 'PARTLY_RECEIVED', 'READY_TO_CLOSE',
]);

// ponytail: SLAs in config object so they can be tuned without touching logic
export const STAGE_SLA_MS: Partial<Record<Stage, number>> = {
  NEEDS_PO: 2 * 86_400_000,
  AWAITING_APPROVAL: 1 * 86_400_000,
  AWAITING_DELIVERY: 5 * 86_400_000,
  PARTLY_RECEIVED: 5 * 86_400_000,
  READY_TO_CLOSE: 1 * 86_400_000,
};

type TimestampedReq = {
  requiredBy?: Date | null;
  stageEnteredAt?: Date | null;
  updatedAt?: Date;
  createdAt?: Date;
};

export function isOverdue(req: TimestampedReq, stage: Stage, now: Date): boolean {
  if (!OPEN_STAGES.has(stage)) return false;

  if (req.requiredBy && (stage === 'AWAITING_DELIVERY' || stage === 'PARTLY_RECEIVED')) {
    if (now > new Date(req.requiredBy)) return true;
  }

  const sla = STAGE_SLA_MS[stage];
  const enteredAt = req.stageEnteredAt ?? req.updatedAt ?? req.createdAt;
  if (sla && enteredAt) {
    return now.getTime() - new Date(enteredAt).getTime() > sla;
  }
  return false;
}

export function waitMs(req: TimestampedReq, now: Date): number {
  const enteredAt = req.stageEnteredAt ?? req.updatedAt ?? req.createdAt;
  if (!enteredAt) return 0;
  return Math.max(0, now.getTime() - new Date(enteredAt).getTime());
}
