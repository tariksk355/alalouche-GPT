/**
 * Print job contract (web app side).
 *
 * The web shell should produce structured print data.
 * Printer-specific rendering/ESC-POS translation must happen in adapter/native layer.
 */

/**
 * @typedef {Object} PrintJobLine
 * @property {string} name
 * @property {number} quantity
 * @property {number=} unitPrice
 * @property {number=} totalPrice
 * @property {string[]=} modifiers
 * @property {string=} note
 */

/**
 * @typedef {Object} PrintJobTotals
 * @property {number=} subtotal
 * @property {number=} tax
 * @property {number=} total
 * @property {string=} currency
 */

/**
 * @typedef {Object} PrintJobRestaurant
 * @property {string=} id
 * @property {string} name
 * @property {string=} address
 * @property {string=} phone
 */

/**
 * @typedef {Object} PrintJob
 * @property {string} printJobId
 * @property {string} createdAtIso
 * @property {PrintJobRestaurant} restaurant
 * @property {string} orderId
 * @property {string} orderNumber
 * @property {string=} customerName
 * @property {PrintJobLine[]} lines
 * @property {PrintJobTotals=} totals
 * @property {string=} notes
 * @property {{paperWidth?: '58mm'|'80mm', locale?: string}=} formattingHints
 */

/**
 * Convert receiver order payload into a structured print job.
 * No printer-specific commands are generated here.
 *
 * @param {{id:string,orderNumber?:string,customerName?:string,payload?:any,notes?:string}} order
 * @param {{id?:string,name:string,address?:string,phone?:string}} restaurant
 * @returns {PrintJob}
 */
export function buildPrintJobFromOrder(order, restaurant) {
  const payload = order?.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];

  const lines = items.map((item) => {
    const qty = Number(item.quantity || 1);
    const unitPrice = item.price != null ? Number(item.price) : undefined;
    const totalPrice = unitPrice != null ? unitPrice * qty : undefined;

    return {
      name: String(item.name || 'Article'),
      quantity: qty,
      unitPrice,
      totalPrice,
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : undefined,
      note: item.note ? String(item.note) : undefined,
    };
  });

  return {
    printJobId: `job_${order.id}_${Date.now()}`,
    createdAtIso: new Date().toISOString(),
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      address: restaurant.address,
      phone: restaurant.phone,
    },
    orderId: order.id,
    orderNumber: order.orderNumber || order.id,
    customerName: order.customerName,
    lines,
    totals: (payload.totalAmount != null || payload.total != null) ? {
      total: Number(payload.totalAmount ?? payload.total),
      currency: payload.currency || 'CHF',
    } : undefined,
    notes: [
      payload.orderType ? `Type: ${payload.orderType === 'delivery' ? 'Livraison' : 'À emporter'}` : null,
      payload.customerPhone ? `Tel: ${payload.customerPhone}` : null,
      order.notes || payload.notes || null,
    ].filter(Boolean).join(' | ') || undefined,
    formattingHints: {
      paperWidth: '58mm',
      locale: 'fr-CH',
    },
  };
}
