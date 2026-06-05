export type DeliveryWorkflowStep =
  | 'delivery_done'
  | 'customer_ringing'
  | 'customer_cancelled'
  | 'customer_tomorrow';

export type TimelineMetadata = {
  step?: DeliveryWorkflowStep;
  paymentMethod?: 'cash' | 'upi';
  paymentProofUrl?: string;
  deliveryProofUrl?: string;
};

export type DeliveryWorkflowMetadata = {
  status: DeliveryWorkflowStep;
  paymentMethod?: 'cash' | 'upi';
  paymentProofUrl?: string;
  deliveryProofUrl?: string;
  note?: string;
  updatedBy: string;
  updatedAt: Date;
};

export type OrderMetadata = {
  idempotencyKey?: string;
  requestHash?: string;
  deliveryWorkflow?: DeliveryWorkflowMetadata;
};

