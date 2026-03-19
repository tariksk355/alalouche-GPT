import { API_BASE_URL, API_BASE_URL_SOURCE, buildApiUrl } from './config';

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
  const message = data?.message || data?.error || `Request failed (${response.status})`;
  const code = data?.error || `HTTP_${response.status}`;
  return new ApiError(message, code, response.status, data || null);
}

export async function requestJson(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let response;
  const requestUrl = buildApiUrl(path);
  try {
    response = await fetch(requestUrl, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new ApiError(
      `Unable to reach the backend service at ${requestUrl}. Check ${API_BASE_URL_SOURCE} (resolved to ${API_BASE_URL}).`,
      'NETWORK_ERROR',
      0,
      error,
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw toApiError(response, data);
  }

  if (data && typeof data === 'object' && data.ok === false) {
    throw toApiError(response, data);
  }

  if (data && typeof data === 'object' && 'data' in data) {
    return data.data;
  }

  return data;
}
