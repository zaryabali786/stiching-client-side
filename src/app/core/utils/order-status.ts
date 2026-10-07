import { OrderStatus } from '../models/api.models';

/**
 * Semantic status tones (DESIGN.md §3) — one meaning per colour, always paired with text:
 *  neutral = waiting on someone else · blue = in progress · amber = needs YOUR action
 *  green = done / paid · purple = in transit · red = problem
 */
export type StatusTone = 'neutral' | 'blue' | 'amber' | 'green' | 'purple' | 'red';

const TONES: Record<OrderStatus, StatusTone> = {
  draft: 'amber',
  submitted: 'neutral',
  received: 'blue',
  assigned: 'blue',
  cutting: 'blue',
  stitching: 'blue',
  qc_passed: 'blue',
  customer_approval: 'amber',
  packed: 'blue',
  invoice_issued: 'amber',
  awaiting_payment: 'amber',
  paid: 'green',
  at_admin_warehouse: 'purple',
  partner_dispatch: 'purple',
  shipped: 'purple',
  delivered: 'green',
  cancelled: 'red',
};

/** Statuses where the customer has to do something (pay / approve). */
export function needsCustomerAction(status: string | null | undefined): boolean {
  return status === 'draft' || status === 'customer_approval' || status === 'invoice_issued' || status === 'awaiting_payment';
}

export function statusTone(status: string | null | undefined): StatusTone {
  return (status && TONES[status as OrderStatus]) || 'neutral';
}

/** Human fallback when an API row has no status_label. */
export function humanizeStatus(status: string | null | undefined): string {
  if (!status) return '';
  const s = status.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Progress tracker steps (customer-facing). */
export const PROGRESS_STEPS = ['Submitted', 'Received', 'Stitching', 'Packed', 'Paid', 'Shipped', 'Delivered'] as const;

const STEP_INDEX: Record<OrderStatus, number> = {
  draft: -1,
  submitted: 0,
  received: 1,
  assigned: 1,
  cutting: 2,
  stitching: 2,
  qc_passed: 2,
  customer_approval: 2,
  packed: 3,
  invoice_issued: 3,
  awaiting_payment: 3,
  paid: 4,
  at_admin_warehouse: 4,
  partner_dispatch: 4,
  shipped: 5,
  delivered: 6,
  cancelled: -1,
};

export function progressIndex(status: OrderStatus): number {
  return STEP_INDEX[status] ?? 0;
}

/** Short, friendly hint for what happens next in each status. */
export function statusHint(status: OrderStatus): string {
  switch (status) {
    case 'draft':
      return 'We made this draft from your email. Add your courier and sizes, then submit it.';
    case 'submitted':
      return 'Waiting for your parcel to arrive at our atelier.';
    case 'received':
    case 'assigned':
      return 'Parcel received — your articles are queued for cutting.';
    case 'cutting':
    case 'stitching':
      return 'Our tailors are stitching your articles.';
    case 'qc_passed':
      return 'Stitching done and quality checked.';
    case 'customer_approval':
      return 'Please review the photos and approve your outfits.';
    case 'packed':
      return 'Packed — your invoice is being prepared.';
    case 'invoice_issued':
    case 'awaiting_payment':
      return 'Your invoice is ready. Pay to release dispatch.';
    case 'paid':
    case 'at_admin_warehouse':
    case 'partner_dispatch':
      return 'Paid — preparing your parcel for the courier.';
    case 'shipped':
      return 'On its way to you.';
    case 'delivered':
      return 'Delivered. We hope you love it!';
    case 'cancelled':
      return 'This order was cancelled.';
  }
}
