import { apiRequest } from './client';
import { CartLine, MenuItem } from '../types/models';

export const storefrontApi = {
  listMenu: () => apiRequest<{ items: MenuItem[] }>('/public/menu-catalog').then((d) => d.items || []),
  listOrderHistory: (token: string) => apiRequest<{ orders: any[] }>('/orders/me/history', { headers: { Authorization: `Bearer ${token}` } }).then((d) => d.orders || []),
  createOrder: (token: string | null, payload: any) => apiRequest<{ order: any }>('/orders', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload),
  }),
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
