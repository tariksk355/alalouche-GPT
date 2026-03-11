import { backendClient } from '@/api/backendClient';
import { fetchCustomerMe, getStoredCustomerSession } from '@/lib/customerAuth';

function customerAuthHeaders() {
  const session = getStoredCustomerSession();
  if (!session?.token) return {};
  return {
    Authorization: `Bearer ${session.token}`,
  };
}

export function normalizeStorefrontOrder(order) {
  const payload = order?.payload && typeof order.payload === 'object' ? order.payload : {};
  return {
    ...order,
    order_number: order.orderNumber,
    customer_name: order.customerName,
    customer_email: order.customerEmail,
    customer_phone: payload.customerPhone || null,
    customer_address: payload.customerAddress || null,
    order_type: payload.orderType || 'takeaway',
    payment_method: payload.paymentMethod || 'cash',
    total_amount: Number(order.totalAmount || 0),
    items: Array.isArray(payload.items) ? payload.items : [],
    notes: payload.notes || null,
    created_date: order.createdAt,
    prep_time_minutes: order.prepMinutes,
    ready_at: payload.readyAt || null,
  };
}

export async function listMenuCatalog() {
  const data = await backendClient.request('/public/menu-catalog');
  return data.data.items || [];
}

export async function createStorefrontOrder(payload) {
  const data = await backendClient.request('/orders', {
    method: 'POST',
    headers: customerAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return normalizeStorefrontOrder(data.data.order);
}

export async function getStorefrontOrder(orderNumber) {
  const data = await backendClient.request(`/orders/${encodeURIComponent(orderNumber)}`);
  return normalizeStorefrontOrder(data.data.order);
}

export async function getStorefrontCustomerPrefill() {
  const session = getStoredCustomerSession();
  if (!session?.token) return null;

  try {
    const customer = await fetchCustomerMe(session.token);
    return {
      customer_name: customer.fullName || '',
      customer_email: customer.email || '',
      customer_phone: customer.phone || '',
      customer_address: '',
    };
  } catch {
    return null;
  }
}
