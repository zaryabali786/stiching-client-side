/** Shop module (products of connected brands, one cart, one payment, one order per brand). See docs/shop-module-api.md. */

export interface ShopBrandRef {
  id: string;
  name: string;
}

export interface ShopFilters {
  brands: { id: string; name: string; count: number }[];
  categories: { name: string; count: number }[];
  collections: { name: string; count: number }[];
}

export type ShopSort = 'newest' | 'price_asc' | 'price_desc' | 'title';

export interface ShopProductCard {
  id: string;
  title: string;
  image_url: string | null;
  price_min: number;
  price_max: number;
  currency: string;
  in_stock: boolean;
  category: string | null;
  /** The cheapest variant's old price (when higher) and the discount, for the card. */
  compare_at_price?: number | null;
  discount_percent?: number | null;
  /** Values of the product's Color option, for the swatches. */
  colors?: string[];
  brand: ShopBrandRef;
}

export interface ShopVariant {
  id: string;
  title: string;
  sku?: string | null;
  options: Record<string, string>;
  price: number;
  compare_at_price: number | null;
  in_stock: boolean;
  quantity_hint: number | null;
  image_url: string | null;
}

export interface ShopProduct {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  images: string[];
  category: string | null;
  currency: string;
  in_stock: boolean;
  brand: ShopBrandRef;
  fulfilled_by: string;
  options: { name: string; values: string[] }[];
  variants: ShopVariant[];
}

export interface ShopCartItem {
  variant_id: string;
  product_id: string;
  title: string;
  variant_title: string | null;
  image_url: string | null;
  brand: ShopBrandRef;
  quantity: number;
  unit_price: number;
  currency: string;
  line_total: number;
  available: boolean;
  issue: string | null;
}

export interface ShopCartGroup {
  brand: ShopBrandRef;
  items_count: number;
  subtotal: number;
  shipping: number;
  total: number;
}

export interface ShopCart {
  items: ShopCartItem[];
  groups: ShopCartGroup[];
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  discount_total: number;
  total: number;
  currency: string | null;
  notices: string[];
  can_checkout: boolean;
  disclosure: string;
}

export interface ShopAddress {
  name: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip?: string;
  country_code: string;
}

export type ShopOrderStatus = 'pending_payment' | 'payment_failed' | 'processing' | 'confirmed' | 'partially_dispatched' | 'dispatched' | 'delivered' | 'cancelled' | 'attention';

export interface ShopOrderRow {
  id: string;
  reference: string;
  status: ShopOrderStatus;
  status_label: string;
  payment_status: 'unpaid' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  total: number;
  currency: string;
  items_count: number;
  brands: string[];
  delivery_verified: boolean;
  created_at: string;
}

export interface ShopBrandOrderItem {
  title: string;
  variant_title: string | null;
  quantity: number;
  unit_price: number;
  image_url: string | null;
}

export interface ShopBrandOrder {
  id: string;
  brand: ShopBrandRef;
  state: 'pending' | 'creating' | 'created' | 'failed' | 'cancelled';
  fulfillment_status: 'unfulfilled' | 'partial' | 'dispatched' | 'delivered';
  delivery_verified: boolean;
  tracking: { company: string | null; number: string | null; url: string | null }[];
  items: ShopBrandOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  status_label: string;
}

export interface ShopOrderDetail extends ShopOrderRow {
  address: ShopAddress | null;
  items: ShopBrandOrderItem[];
  brand_orders: ShopBrandOrder[];
  timeline: { at: string; text: string }[];
}

export interface ShopPaymentStart {
  clientSecret: string;
  paymentIntentId: string;
  publishableKey: string;
  amount: number;
  currency: string;
  reference: string;
}

export interface ShopCheckoutResult {
  order: { id: string; reference: string; total: number; currency: string };
  payment: ShopPaymentStart;
}

export interface ShopListQuery {
  page: number;
  limit?: number;
  search?: string;
  brand?: string;
  category?: string;
  collection?: string;
  sort?: ShopSort;
  min?: number;
  max?: number;
  in_stock?: boolean;
}
