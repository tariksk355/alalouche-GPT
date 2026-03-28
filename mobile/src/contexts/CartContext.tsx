import React, { createContext, useContext, useMemo, useState } from 'react';
import { CartLine } from '../types/models';

type CartContextValue = {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, 'quantity'>) => void;
  removeLine: (lineKey: string) => void;
  updateQty: (lineKey: string, delta: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const value = useMemo<CartContextValue>(() => ({
    lines,
    addLine: (line) => setLines((prev) => {
      const existing = prev.find((item) => item.lineKey === line.lineKey);
      if (existing) return prev.map((item) => item.lineKey === line.lineKey ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { ...line, quantity: 1 }];
    }),
    removeLine: (lineKey) => setLines((prev) => prev.filter((line) => line.lineKey !== lineKey)),
    updateQty: (lineKey, delta) => setLines((prev) => prev.map((line) => line.lineKey === lineKey ? { ...line, quantity: Math.max(1, line.quantity + delta) } : line)),
    clear: () => setLines([]),
  }), [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
