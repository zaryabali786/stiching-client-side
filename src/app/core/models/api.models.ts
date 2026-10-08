import type { ClientTheme } from '../services/theme.service';
/**
 * Types mirroring backend/API.md (snake_case DB columns; camelCase only for computed summaries).
 */

// ───────────── Envelope ─────────────

export interface ApiEnvelope<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  meta?: PageMeta;
  details?: unknown[];
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface Paged<T, M extends object = object> {
  items: T[];
  meta: PageMeta & Partial<M>;
}

export interface ApiResult<T> {
  data: T;
  message: string;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

// ───────────── Auth ─────────────

export type UserRole = 'customer' | 'partner_staff' | 'admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  postal_code: string | null;
  role: UserRole;
  requested_role: UserRole | null;
  customer_code: string | null;
  /** Personal shopping address (customers): type it at any shop's checkout, the mail lands in the Inbox. */
  mailbox_address?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuthTokens {
  tokenType: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
}

export interface AuthPayload {
  user: Profile;
  tokens: AuthTokens | null;
}

export interface RegisterBody {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  postalCode?: string;
}

export interface ProfilePatch {
  fullName?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
  postalCode?: string;
}

// ───────────── Config ─────────────

export interface PlatformConfig {
  name: string;
  shipToName: string;
  shipToAddress: string;
  shipToCity: string;
  shipToPhone: string;
  partnerName: string;
  /** Card payments: the publishable key is public by design; the secret key never leaves the server. */
  payments?: { stripe: { enabled: boolean; publishableKey: string | null } };
  /** Google sign-in: the OAuth client id is public by design; the client secret stays on the server. */
  google?: { enabled: boolean; clientId: string | null };
  /** Colours and fonts chosen by the admin. */
  theme?: ClientTheme;
}

/** POST /client/orders/:id/payment-intent */
export interface PaymentStart {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  invoiceNumber: string | null;
  reference: string;
  publishableKey: string;
}

export interface PaymentConfirmation {
  paid: boolean;
  status: string;
  error?: string | null;
  settled?: boolean;
}

// ───────────── Notifications ─────────────

export type NotificationType = 'order' | 'update' | 'alert' | 'approval' | 'invoice' | 'logistics';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  order_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationMeta {
  unreadCount: number;
}

// ───────────── Orders ─────────────

export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'received'
  | 'assigned'
  | 'cutting'
  | 'stitching'
  | 'qc_passed'
  | 'customer_approval'
  | 'packed'
  | 'invoice_issued'
  | 'awaiting_payment'
  | 'paid'
  | 'at_admin_warehouse'
  | 'partner_dispatch'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface ClientOverview {
  period: 'year' | 'all';
  ordersCount: number;
  articlesStitched: number;
  articlesInProgress: number;
  avgTurnaroundDays: number | null;
  monthly: { month: string; key: string; count: number; pct: number }[];
  whoYouStitchFor: { name: string; count: number; pct: number }[];
  actionNeeded: { id: string; reference: string; brand: string; status: OrderStatus; status_label: string }[];
  unreadNotifications: number;
}

export interface OrderListRow {
  id: string;
  reference: string;
  brand: string;
  brand_order_number: string | null;
  tracking_number: string | null;
  status: OrderStatus;
  status_label: string;
  has_issue: boolean;
  /** 'email' for an order made from an email in the Inbox. */
  import_source?: 'manual' | 'invoice' | 'link' | 'email';
  created_at: string;
  destination_city: string | null;
  destination_country: string | null;
  units_count: number;
}

export interface MediaRef {
  url: string;
  type?: string;
  name?: string;
}

export interface UnitDesign {
  neckline?: string;
  sleeves?: string;
  trouser?: string;
  [key: string]: string | undefined;
}

export type ApprovalStatus = 'none' | 'pending' | 'approved' | 'changes_requested';

export interface UnitApproval {
  status: ApprovalStatus;
  photos: MediaRef[] | null;
  requested_at: string | null;
  decided_at: string | null;
  change_request: string | null;
  change_request_audio?: VoiceNote | null;
}

export interface OrderUnit {
  id: string;
  order_id: string;
  line_no: number;
  unit_title: string;
  stitching_type: string | null;
  size_chart_id: string | null;
  size_chart?: SizeChartView | null;
  product_link: string | null;
  notes: string | null;
  quantity: number;
  /** Legacy neckline/sleeves/trouser map (orders placed before article types existed). */
  design: UnitDesign | null;
  selected_articles?: SelectedArticle[] | null;
  reference_images: MediaRef[] | null;
  status: 'pending' | 'received' | 'issue';
  issue_type: string | null;
  issue_note: string | null;
  issue_audio?: VoiceNote | null;
  notes_audio?: VoiceNote | null;
  /** Per-article approval of the finished photos. */
  approval?: UnitApproval | null;
  timeline?: UnitTimelineStep[] | null;
  issue_media: MediaRef[] | null;
  received_at: string | null;
  product_image_url?: string | null;
}

export interface OrderEvent {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
}

export type InvoiceLineKind =
  | 'stitching'
  | 'accessory'
  | 'accessory_stitching'
  | 'shipping'
  | 'duties'
  | 'discount'
  | 'other';

export interface InvoiceLine {
  id: string;
  kind: InvoiceLineKind;
  label: string;
  description: string | null;
  quantity: number | null;
  customer_amount: number;
  sort_order: number;
}

export interface Invoice {
  id: string;
  number: string;
  status: 'draft' | 'issued' | 'paid';
  currency: string;
  fx_rate: number;
  subtotal_pkr: number;
  discount_pkr: number;
  total_pkr: number;
  total_foreign: number;
  notes: string | null;
  issued_at: string | null;
  paid_at: string | null;
  lines: InvoiceLine[];
}

export interface Shipment {
  id: string;
  order_id: string;
  shipped_from: 'admin_warehouse' | 'partner';
  status: 'needs_label' | 'labelled' | 'handed_to_courier' | 'delivered';
  courier: string | null;
  service: string | null;
  tracking_number: string | null;
  weight_kg: number | null;
  handed_at: string | null;
  delivered_at: string | null;
}

export interface Payment {
  id: string;
  amount_pkr: number;
  amount_foreign: number | null;
  currency: string | null;
  method: string;
  provider_ref: string | null;
  status: string;
  created_at: string;
}

export interface Order {
  id: string;
  reference: string;
  customer_id: string;
  customer_name: string | null;
  customer_code: string | null;
  brand: string;
  import_source?: 'manual' | 'invoice' | 'link' | 'email';
  brand_id?: string | null;
  brand_order_number: string | null;
  tracking_number: string | null;
  courier_id?: string | null;
  international_shipping?: boolean | null;
  status: OrderStatus;
  has_issue: boolean;
  customer_notes: string | null;
  destination_country: string | null;
  destination_city: string | null;
  destination_address: string | null;
  shipping_service: 'express' | 'standard' | null;
  due_date: string | null;
  weight_kg: number | null;
  approval_photos: MediaRef[] | null;
  change_request: string | null;
  change_request_audio?: VoiceNote | null;
  received_at: string | null;
  packed_at: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string | null;
}

/** A stitching partner the customer can choose, with the address the parcel is sent to. */
export interface ClientPartner {
  id: string;
  name: string;
  short_code: string | null;
  city: string | null;
  tagline: string | null;
  turnaround_days: number | null;
  recommended: boolean;
  receiving: { name: string; address: string; city: string; phone: string };
}

/** The partner an order belongs to, as the order detail returns it. */
export interface OrderPartner {
  id: string;
  name: string;
  short_code: string | null;
  city: string | null;
  receiving_name: string | null;
  receiving_address: string | null;
  receiving_city: string | null;
  receiving_phone: string | null;
}

export interface OrderDetail extends Order {
  status_label: string;
  partner?: OrderPartner | null;
  units: OrderUnit[];
  events: OrderEvent[];
  invoice: Invoice | null;
  shipment: Shipment | null;
  payments: Payment[] | null;
  brand_ref?: Brand | null;
  courier?: Courier | null;
}

export interface UnitInput {
  /** Existing article id when editing (updated in place). */
  id?: string;
  /** Saved reference photos to keep when editing. */
  reference_images?: { url: string; type?: string; name?: string }[];
  unit_title: string;
  product_link: string | null;
  product_image_url: string | null;
  stitching_type?: string | null;
  size_chart_id: string | null;
  notes: string | null;
  quantity: number;
  /** At most one article per article type. */
  article_ids: string[];
  /** Stored voice note reference; `null` removes a saved one, leaving it out keeps it. */
  notes_audio?: VoiceRef | null;
  reference_uploads?: { name: string; dataUrl: string }[];
}

export interface OrderInput {
  /** The stitching partner chosen for this order (omitted when the order is already submitted). */
  partner_id?: string | null;
  brand_id: string;
  courier_id: string;
  tracking_number: string | null;
  international_shipping: boolean;
  brand_order_number: string | null;
  note: string | null;
  /** Draft read from an email / invoice / links that this order was made from (marks it used). */
  import_id?: string | null;
  units: UnitInput[];
}

// ───────────── Order form catalogues (migration 0004) ─────────────

export interface Brand {
  id: string;
  name: string;
}

export interface Courier {
  id: string;
  name: string;
  requires_tracking: boolean;
}

export interface ArticleType {
  id: string;
  name: string;
  sort_order: number;
}

export interface Article {
  id: string;
  article_type_id: string;
  name: string;
  image_url: string | null;
}

/** An article chosen for one piece, as returned inside OrderDetail units. */
export interface SelectedArticle {
  article_type_id: string;
  type_name: string;
  article_id: string;
  name: string;
  image_url: string | null;
}

export interface ProductPreview {
  url: string;
  ok: boolean;
  title: string | null;
  image_url: string | null;
  brand: string | null;
  error: string | null;
}

// ───────────── Conversations ─────────────

export type MessageKind = 'text' | 'voice';

export interface MessageAudio {
  mime: string;
  duration: number;
  size: number;
  /** Signed link, valid for about an hour. */
  url: string | null;
}

export interface ChatMessage {
  id: string;
  order_id: string;
  sender_id: string;
  sender_role: UserRole;
  sender_name: string | null;
  kind: MessageKind;
  body: string | null;
  audio: MessageAudio | null;
  client_msg_id: string | null;
  /** The article this message is about; null/undefined = the order's General chat. */
  unit_id?: string | null;
  read_at: string | null;
  created_at: string;
}

/** One chat of an order (General or one article) with its unread count. */
export interface ConversationScope {
  unit_id: string | null;
  title: string;
  line_no: number | null;
  image_url: string | null;
  unread: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_role: UserRole | null;
}

export interface Conversation {
  scopes: ConversationScope[];
  unread: number;
}

/** One of my orders that has chats (`GET /client/conversations`). */
export interface OrderConversation extends Conversation {
  id: string;
  reference: string;
  brand: string;
  status: string;
  last_message_at: string | null;
}

export type TimelineStatus =
  | 'received' | 'issue' | 'issue_resolved' | 'to_assign' | 'cutting' | 'stitching' | 'qc' | 'qc_passed' | 'qc_failed'
  | 'approval_requested' | 'approved' | 'changes_requested' | 'packed' | 'shipped' | 'delivered';

/** One step of an article's own timeline (oldest first in `unit.timeline`). */
export interface UnitTimelineStep {
  status: TimelineStatus | string;
  label: string;
  note: string | null;
  at: string;
}

export interface MessagesMeta {
  nextCursor: string | null;
}

/** A voice note as stored by the API (`path` only on what we just uploaded) or as received (signed `url`). */
export interface VoiceNote {
  path?: string;
  mime: string;
  duration: number;
  size: number;
  url?: string | null;
}

/** What is sent back with a note: the reference of an uploaded clip. */
export interface VoiceRef {
  path: string;
  duration: number;
  mime: string;
  size: number;
}

export interface VoiceUpload {
  path: string;
  mime: string;
  size: number;
  duration: number;
  url: string;
}

// ───────────── Size charts ─────────────

export type NearestSize = 'XS' | 'S' | 'M' | 'L' | 'XL';
export const NEAREST_SIZES: readonly NearestSize[] = ['XS', 'S', 'M', 'L', 'XL'];

/** Shirt / kameez measurements (inches), in the order they are drawn and listed. */
export const SHIRT_FIELDS = [
  { key: 'shirt_length', label: 'Front length' },
  { key: 'shoulder', label: 'Shoulder' },
  { key: 'bust', label: 'Bust' },
  { key: 'waist', label: 'Waist' },
  { key: 'hip', label: 'Hip' },
  { key: 'bottom', label: 'Bottom (hem)' },
  { key: 'sleeve', label: 'Sleeve length' },
  { key: 'cuff_opening', label: 'Cuff opening (single)' },
  { key: 'armhole', label: 'Arm hole' },
] as const;

export const TROUSER_FIELDS = [
  { key: 'trouser_length', label: 'Length' },
  { key: 'front_rise', label: 'Front rise' },
  { key: 'back_rise', label: 'Back rise' },
  { key: 'waist_relaxed', label: 'Waist (relaxed)' },
  { key: 'trouser_hip', label: 'Hip' },
  { key: 'knee', label: 'Knee' },
  { key: 'thigh', label: 'Thigh' },
  { key: 'bottom_opening', label: 'Bottom (single)' },
] as const;

/** Keys that only exist on older charts; shown generically and kept on edit. */
export const LEGACY_FIELDS = [
  { key: 'shalwar_gheer', label: 'Shalwar gheer' },
  { key: 'neck_depth', label: 'Neck depth' },
] as const;

export type MeasurementKey =
  | (typeof SHIRT_FIELDS)[number]['key']
  | (typeof TROUSER_FIELDS)[number]['key']
  | (typeof LEGACY_FIELDS)[number]['key'];

export interface MeasurementField {
  key: MeasurementKey;
  label: string;
}

export interface MeasurementGroup {
  id: 'shirt' | 'trouser';
  title: string;
  fields: readonly MeasurementField[];
}

/** Single source of truth for the size form, the read-only views and the diagrams. */
export const MEASUREMENT_GROUPS: readonly MeasurementGroup[] = [
  { id: 'shirt', title: 'Shirt / kameez', fields: SHIRT_FIELDS },
  { id: 'trouser', title: 'Trouser', fields: TROUSER_FIELDS },
];

export const MEASUREMENT_FIELDS: readonly MeasurementField[] = [...SHIRT_FIELDS, ...TROUSER_FIELDS];

export type Measurements = Partial<Record<MeasurementKey, number>>;

export interface SizeChart {
  id: string;
  person_name: string;
  variation: string;
  name: string;
  nearest_size: NearestSize | null;
  measurements: Measurements;
  fit_feedback: string | null;
  notes: string | null;
  notes_audio?: VoiceNote | null;
  created_at: string;
  updated_at: string | null;
}

/** The order's frozen copy of a chart (`unit.size_chart`); the live chart works too. */
export type SizeChartView = Pick<SizeChart, 'person_name' | 'variation' | 'measurements'> &
  Partial<Pick<SizeChart, 'id' | 'name' | 'nearest_size' | 'notes' | 'notes_audio' | 'fit_feedback'>>;

export interface SizeChartInput {
  person_name: string;
  variation: string;
  nearest_size: NearestSize | null;
  measurements: Measurements;
  notes: string | null;
  notes_audio?: VoiceRef | null;
}

// ───────────── Inbox (migration 0010) ─────────────

export interface ImportItem {
  title: string;
  quantity: number;
  unit_price: number | null;
  url: string | null;
  image_url: string | null;
  sku: string | null;
  notes: string | null;
}

/** The order read from an email / invoice / links; prefills the new-order form. */
export interface OrderImport {
  id: string;
  source: 'invoice' | 'link' | 'email';
  status: 'processing' | 'ready' | 'failed' | 'used';
  email_from: string | null;
  email_subject: string | null;
  extracted: {
    brand: string | null;
    order_number: string | null;
    currency: string | null;
    total: number | null;
    tracking_number: string | null;
    items: ImportItem[];
  } | null;
  error: string | null;
  order_id: string | null;
}

export interface InboxRow {
  id: string;
  from: string | null;
  subject: string | null;
  preview: string;
  received_at: string;
  is_read: boolean;
  import_id: string | null;
  draft: { status: OrderImport['status']; brand: string | null; items: number } | null;
}

export interface InboxEmail {
  id: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  received_at: string;
  is_read: boolean;
  import_id: string | null;
  draft: OrderImport | null;
}

export interface Mailbox {
  address: string | null;
  enabled: boolean;
  unread: number;
}
