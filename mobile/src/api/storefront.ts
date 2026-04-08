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

export type OrderingSettings = {
  categoryOrder?: string[];
  productOrderByCategory?: Record<string, string[]>;
};

export type ReservationSettings = {
  timeSlots?: string[];
  slots?: string[];
};

export type CreateReservationPayload = {
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  notes?: string;
};

export { getDeliveryRuleForPostalCode, normalizePostalCode };

export const storefrontApi = {
  listMenu: () => apiRequest<{ items: MenuItem[] }>('/public/menu-catalog').then((d) => d.items || []),
  getOrderingSettings: () => apiRequest<{ restaurant?: { orderingSettings?: OrderingSettings } }>('/public/restaurant-config')
    .then((d) => d.restaurant?.orderingSettings || {}),
  getReservationSettings: () => apiRequest<{ restaurant?: { reservationSettings?: ReservationSettings } }>('/public/restaurant-config')
    .then((d) => d.restaurant?.reservationSettings || {}),
  listOrderHistory: (token: string) => apiRequest<{ orders: any[] }>('/orders/me/history', { headers: { Authorization: `Bearer ${token}` } }).then((d) => d.orders || []),
  createOrder: (token: string | null, payload: any) => apiRequest<{ order: any }>('/orders', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload),
  }),
  createReservation: (token: string | null, payload: CreateReservationPayload) => apiRequest<{ reservation: any }>('/reservations', {
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
