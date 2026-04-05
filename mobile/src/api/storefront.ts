import { apiRequest } from './client';
import { CartLine, MenuItem } from '../types/models';

export type DeliveryRule = {
  minimumOrder: number;
  deliveryFee: number;
};

export type PromotionPreview = {
  promotionCode: string;
  discountAmount: number;
  subtotalAmount: number;
  totalAmount: number;
};

export const DELIVERY_ZONE_RULES: Record<string, DeliveryRule> = {
  '1753': { minimumOrder: 50, deliveryFee: 5 },
  '1784': { minimumOrder: 50, deliveryFee: 5 },
  '1783': { minimumOrder: 35, deliveryFee: 3 },
  '1782': { minimumOrder: 35, deliveryFee: 3 },
  '1712': { minimumOrder: 40, deliveryFee: 3 },
  '1763': { minimumOrder: 30, deliveryFee: 3 },
  '1762': { minimumOrder: 30, deliveryFee: 3 },
  '1700': { minimumOrder: 30, deliveryFee: 3 },
  '1752': { minimumOrder: 35, deliveryFee: 3 },
  '3186': { minimumOrder: 40, deliveryFee: 3 },
  '1720': { minimumOrder: 35, deliveryFee: 3 },
  '1722': { minimumOrder: 35, deliveryFee: 3 },
};

export function normalizePostalCode(rawValue?: string | null): string {
  if (typeof rawValue !== 'string') return '';
  const match = rawValue.match(/\b(\d{4})\b/);
  return match ? match[1] : '';
}

export function getDeliveryRuleForPostalCode(rawValue?: string | null): (DeliveryRule & { postalCode: string }) | null {
  const postalCode = normalizePostalCode(rawValue);
  if (!postalCode) return null;
  const rule = DELIVERY_ZONE_RULES[postalCode];
  if (!rule) return null;
  return { postalCode, ...rule };
}

export const storefrontApi = {
  listMenu: () => apiRequest<{ items: MenuItem[] }>('/public/menu-catalog').then((d) => d.items || []),
  listOrderHistory: (token: string) => apiRequest<{ orders: any[] }>('/orders/me/history', { headers: { Authorization: `Bearer ${token}` } }).then((d) => d.orders || []),
  createOrder: (token: string | null, payload: any) => apiRequest<{ order: any }>('/orders', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload),
  }),
  previewPromotion: (token: string | null, payload: any) => apiRequest<{ promotion: PromotionPreview }>('/orders/promotion-preview', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload),
  }).then((d) => d.promotion),
  buildOrderPayload: (lines: CartLine[]) => ({
    items: lines.map((line) => ({
      id: line.id,
      name: line.name,
      price: line.price,
      quantity: line.quantity,
      selectedOptions: line.selectedOptions,
    })),
  }),
};
