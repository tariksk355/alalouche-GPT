import { apiRequest } from './client';
import { CartLine, MenuItem } from '../types/models';
import { getDeliveryRuleForPostalCode, normalizePostalCode } from '../../../shared/deliveryZones';

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

export { getDeliveryRuleForPostalCode, normalizePostalCode };

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
