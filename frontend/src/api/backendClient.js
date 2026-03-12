import { getTenantRequestHeaders } from '@/lib/tenantRuntime';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const defaultHeaders = {
    ...getTenantRequestHeaders(),
    ...(options.headers || {}),
  };

  if (!isFormData && !defaultHeaders['Content-Type']) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: defaultHeaders,
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || 'Request failed');
    error.code = data.error || `HTTP_${response.status}`;
    throw error;
  }

  return data;
}

export const backendClient = {
  request,
  apiBaseUrl: API_BASE_URL,
};
