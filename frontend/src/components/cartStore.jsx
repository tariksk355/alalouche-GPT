import { getLegacyStorageKey, storageKeyFor } from '@/lib/storageKeys';

const KEY_TYPE = 'cart';

function getCurrentCartKey() {
  return storageKeyFor(KEY_TYPE);
}

function migrateLegacyCartIfNeeded() {
  const newKey = getCurrentCartKey();
  const current = sessionStorage.getItem(newKey);
  if (current) return;

  const legacyKey = getLegacyStorageKey('cart');
  if (!legacyKey) return;

  const legacy = sessionStorage.getItem(legacyKey);
  if (!legacy) return;

  sessionStorage.setItem(newKey, legacy);
  sessionStorage.removeItem(legacyKey);
}

export function getCart() {
  migrateLegacyCartIfNeeded();
  try {
    return JSON.parse(sessionStorage.getItem(getCurrentCartKey()) || '[]');
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  sessionStorage.setItem(getCurrentCartKey(), JSON.stringify(cart));
}

export function addItem(item) {
  const cart = getCart();
  const existing = cart.find((c) => c.id === item.id);
  const updated = existing
    ? cart.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))
    : [...cart, { ...item, quantity: 1 }];
  saveCart(updated);
  return updated;
}

export function removeItem(id) {
  const cart = getCart();
  const existing = cart.find((c) => c.id === id);
  const updated = existing?.quantity === 1 ? cart.filter((c) => c.id !== id) : cart.map((c) => (c.id === id ? { ...c, quantity: c.quantity - 1 } : c));
  saveCart(updated);
  return updated;
}

export function clearCart() {
  sessionStorage.removeItem(getCurrentCartKey());
  const legacyKey = getLegacyStorageKey('cart');
  if (legacyKey) sessionStorage.removeItem(legacyKey);
}

export function cartCount(cart) {
  return cart.reduce((s, i) => s + i.quantity, 0);
}
