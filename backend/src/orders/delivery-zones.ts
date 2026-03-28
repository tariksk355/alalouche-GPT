export const DELIVERY_ZONE_RULES: Record<string, { minimumOrder: number; deliveryFee: number }> = {
  '1753': { minimumOrder: 50, deliveryFee: 5 },
  '1784': { minimumOrder: 50, deliveryFee: 5 },
  '1783': { minimumOrder: 35, deliveryFee: 3 },
  '1782': { minimumOrder: 35, deliveryFee: 3 },
  '1712': { minimumOrder: 40, deliveryFee: 3 },
  '1763': { minimumOrder: 30, deliveryFee: 3 },
  '1762': { minimumOrder: 30, deliveryFee: 3 },
  '1700': { minimumOrder: 30, deliveryFee: 3 },
  '1752': { minimumOrder: 35, deliveryFee: 3 },
  '3186': { minimumOrder: 40, deliveryFee: 3 },
  '1720': { minimumOrder: 35, deliveryFee: 3 },
  '1722': { minimumOrder: 35, deliveryFee: 3 },
};

export function normalizePostalCode(rawValue?: string | null): string {
  if (!rawValue) return '';
  const match = rawValue.match(/\b(\d{4})\b/);
  return match ? match[1] : '';
}
