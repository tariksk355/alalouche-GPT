import { apiRequest } from './client';

export type CustomerProfile = {
  id?: string;
  email?: string;
  fullName?: string;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  deliveryInstructions?: string | null;
};

export type UpdateCustomerProfilePayload = {
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  deliveryInstructions?: string;
};

export type CustomerSession = { token: string; customer?: CustomerProfile };

export const authApi = {
  login: (payload: { email: string; password: string }) => apiRequest<CustomerSession>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  signup: (payload: { email: string; password: string; fullName: string; phone: string; marketingConsent?: boolean }) => apiRequest<CustomerSession>('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
  forgotPassword: (payload: { email: string }) => apiRequest<{ ok: boolean }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (payload: { token: string; password: string }) => apiRequest<{ ok: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
  me: (token: string) => apiRequest<{ customer: CustomerProfile }>('/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
  updateMe: (token: string, payload: UpdateCustomerProfilePayload) => apiRequest<{ customer: CustomerProfile }>('/auth/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }),
};
