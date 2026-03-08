const KEY = "alalouche_cart";

export function getCart() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

export function saveCart(cart) {
  sessionStorage.setItem(KEY, JSON.stringify(cart));
}

export function addItem(item) {
  const cart = getCart();
  const existing = cart.find(c => c.id === item.id);
  const updated = existing
    ? cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
    : [...cart, { ...item, quantity: 1 }];
  saveCart(updated);
  return updated;
}

export function removeItem(id) {
  const cart = getCart();
  const existing = cart.find(c => c.id === id);
  const updated = existing?.quantity === 1
    ? cart.filter(c => c.id !== id)
    : cart.map(c => c.id === id ? { ...c, quantity: c.quantity - 1 } : c);
  saveCart(updated);
  return updated;
}

export function clearCart() {
  sessionStorage.removeItem(KEY);
}

export function cartCount(cart) {
  return cart.reduce((s, i) => s + i.quantity, 0);
}