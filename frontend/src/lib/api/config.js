export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin';
