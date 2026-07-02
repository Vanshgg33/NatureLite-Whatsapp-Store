export type DeliveryWorkflowStep =
  | 'delivery_done'
  | 'customer_ringing'
  | 'customer_cancelled'
  | 'customer_tomorrow'
  | 'unpaid'
  | 'partial_payment';

export type TimelineMetadata = {
  step?: DeliveryWorkflowStep;
  paymentMethod?: 'cash' | 'upi';
  paymentProofUrl?: string;
  deliveryProofUrl?: string;
  amountCollected?: number;
  cashAmount?: number;
  upiAmount?: number;
};

export type DeliveryWorkflowMetadata = {
  status: DeliveryWorkflowStep;
  paymentMethod?: 'cash' | 'upi';
  paymentProofUrl?: string;
  deliveryProofUrl?: string;
  amountCollected?: number;
  cashAmount?: number;
  upiAmount?: number;
  note?: string;
  updatedBy: string;
  updatedAt: Date;
};

export type OrderMetadata = {
  idempotencyKey?: string;
  requestHash?: string;
  deliveryWorkflow?: DeliveryWorkflowMetadata;
};

