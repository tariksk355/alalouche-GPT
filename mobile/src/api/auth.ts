import { apiRequest } from './client';

export type CustomerSession = { token: string; customer?: { id?: string; email?: string; fullName?: string } };

export const authApi = {
  login: (payload: { email: string; password: string }) => apiRequest<CustomerSession>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  signup: (payload: { email: string; password: string; fullName: string; phone: string; marketingConsent?: boolean }) => apiRequest<CustomerSession>('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
  forgotPassword: (payload: { email: string }) => apiRequest<{ ok: boolean }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (payload: { token: string; password: string }) => apiRequest<{ ok: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
  me: (token: string) => apiRequest<{ customer: any }>('/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
};
