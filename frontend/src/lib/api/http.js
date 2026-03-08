import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(message, code = 'REQUEST_FAILED', status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function toApiError(response, data) {
  const message = data?.message || data?.error || `HTTP ${response.status}`;
  const code = data?.error || `HTTP_${response.status}`;
  return new ApiError(message, code, response.status, data);
}

export async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw toApiError(response, data);
  }

  return data?.data ?? null;
}
