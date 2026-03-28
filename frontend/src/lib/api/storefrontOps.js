import { backendClient } from '@/api/backendClient';
import { fetchCustomerMe, getStoredCustomerSession } from '@/lib/customerAuth';
import { storageKeyFor } from '@/lib/storageKeys';

const CHECKOUT_DEFAULTS_KEY_TYPE = 'checkout_defaults';

function customerAuthHeaders() {
  const session = getStoredCustomerSession();
  if (!session?.token) return {};
  return {
    Authorization: `Bearer ${session.token}`,
  };
}

function formatSavedDeliveryAddress(customer) {
  const line1 = typeof customer?.addressLine1 === 'string' ? customer.addressLine1.trim() : '';
  const line2 = typeof customer?.addressLine2 === 'string' ? customer.addressLine2.trim() : '';
  const postalCode = typeof customer?.postalCode === 'string' ? customer.postalCode.trim() : '';
  const city = typeof customer?.city === 'string' ? customer.city.trim() : '';

  const locality = [postalCode, city].filter(Boolean).join(' ');
  return [line1, line2, locality].filter(Boolean).join(', ');
}

function requireCustomerAuthHeaders() {
  const session = getStoredCustomerSession();
  if (!session?.token) {
    const error = new Error('Connexion client requise.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

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
    customer_postal_code: payload.customerPostalCode || null,
    order_type: payload.orderType || 'takeaway',
    payment_method: payload.paymentMethod || 'cash',
    subtotal_amount: Number((order.subtotalAmount ?? payload.subtotalAmount ?? order.totalAmount) || 0),
    discount_amount: Number((order.discountAmount ?? payload.discountAmount) || 0),
    delivery_fee_amount: Number(payload.deliveryFeeAmount || 0),
    promotion_code: order.promotionCode || payload?.promotion?.code || null,
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

export async function previewStorefrontPromotion(payload) {
  const data = await backendClient.request('/orders/promotion-preview', {
    method: 'POST',
    headers: customerAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return data.data.promotion;
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
      customer_address: formatSavedDeliveryAddress(customer),
    };
  } catch {
    const fallbackCustomer = session.customer;
    if (!fallbackCustomer) return null;
    return {
      customer_name: fallbackCustomer.fullName || '',
      customer_email: fallbackCustomer.email || '',
      customer_phone: fallbackCustomer.phone || '',
      customer_address: formatSavedDeliveryAddress(fallbackCustomer),
    };
  }
}


export function getStoredCheckoutDefaults() {
  try {
    const raw = localStorage.getItem(storageKeyFor(CHECKOUT_DEFAULTS_KEY_TYPE));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      customer_address: parsed.customer_address || '',
      customer_postal_code: parsed.customer_postal_code || '',
      order_type: parsed.order_type === 'delivery' ? 'delivery' : 'takeaway',
      payment_method: parsed.payment_method === 'card' ? 'card' : 'cash',
    };
  } catch {
    return null;
  }
}

export function saveCheckoutDefaults(payload) {
  const defaults = {
    customer_address: payload.customer_address || '',
    customer_postal_code: payload.customer_postal_code || '',
    order_type: payload.order_type === 'delivery' ? 'delivery' : 'takeaway',
    payment_method: payload.payment_method === 'card' ? 'card' : 'cash',
  };

  try {
    localStorage.setItem(storageKeyFor(CHECKOUT_DEFAULTS_KEY_TYPE), JSON.stringify(defaults));
  } catch {
    // noop
  }
}

export async function listMyOrderHistory() {
  const data = await backendClient.request('/orders/me/history', {
    headers: requireCustomerAuthHeaders(),
  });
  return (data.data.orders || []).map(normalizeStorefrontOrder);
}
