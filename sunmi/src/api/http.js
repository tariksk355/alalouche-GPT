import { API_BASE_URL } from '../config.js';

export class ApiError extends Error {
  constructor(message, code = 'REQUEST_FAILED', status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function toApiError(response, body) {
  return new ApiError(body?.message || body?.error || `HTTP ${response.status}`, body?.error || `HTTP_${response.status}`, response.status, body || null);
}

export async function requestJson(path, options = {}) {
  const { headers: optionHeaders = {}, ...fetchOptions } = options;
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...optionHeaders,
      },
    });
  } catch (e) {
    throw new ApiError('Backend unavailable. Check network or API URL.', 'NETWORK_ERROR', 0, e);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok || (body && body.ok === false)) {
    throw toApiError(response, body);
  }

  if (body && typeof body === 'object' && 'data' in body) return body.data;
  return body;
}
