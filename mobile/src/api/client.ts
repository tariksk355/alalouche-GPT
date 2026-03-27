const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://app.kodlantis-test.com';

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || `HTTP_${res.status}`);
  }
  return json?.data as T;
}
