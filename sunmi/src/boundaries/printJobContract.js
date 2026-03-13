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
export function normalizeOrderForDisplay(order) {
  const payload = (order?.payload && typeof order.payload === 'object') ? order.payload : {};
  const itemSource =
    Array.isArray(payload.items) ? 'payload.items'
      : Array.isArray(payload.lines) ? 'payload.lines'
        : Array.isArray(order?.items) ? 'order.items'
          : 'none';
  const rawItems = itemSource === 'payload.items'
    ? payload.items
    : itemSource === 'payload.lines'
      ? payload.lines
      : itemSource === 'order.items'
        ? order.items
        : [];

  const items = rawItems.map((item) => {
    const qty = Number(item.quantity ?? item.qty ?? item.count ?? 1);
    const unitPriceRaw = item.price ?? item.unitPrice ?? item.unit_price;
    const totalPriceRaw = item.totalPrice ?? item.total_price ?? item.lineTotal ?? item.line_total ?? item.amount;
    const unitPrice = unitPriceRaw != null ? Number(unitPriceRaw) : undefined;
    const totalPrice = totalPriceRaw != null
      ? Number(totalPriceRaw)
      : unitPrice != null ? unitPrice * qty : undefined;

    return {
      name: String(item.name || item.title || item.label || 'Article'),
      quantity: qty,
      unitPrice,
      totalPrice,
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : undefined,
      note: item.note ? String(item.note) : item.notes ? String(item.notes) : undefined,
    };
  });

  const customerPhone = typeof order?.customerPhone === 'string' ? order.customerPhone : payload.customerPhone;
  const customerAddress = typeof order?.customerAddress === 'string' ? order.customerAddress : payload.customerAddress;
  const paymentMethod = typeof order?.paymentMethod === 'string' ? order.paymentMethod : payload.paymentMethod;
  const orderType = order?.orderType || payload.orderType;
  const orderTypeLabel = orderType === 'delivery' ? 'Livraison' : orderType ? 'À emporter' : '';
  const createdAtIso = typeof order?.createdAt === 'string' ? order.createdAt : new Date().toISOString();
  const customerTotalOrderCount = Number.isFinite(Number(order?.customerTotalOrderCount))
    ? Number(order.customerTotalOrderCount)
    : Number.isFinite(Number(order?.customerOrderCount))
      ? Number(order.customerOrderCount) + 1
      : 0;

  const totals = (payload.totalAmount != null || payload.total != null) ? {
    total: Number(payload.totalAmount ?? payload.total),
    currency: payload.currency || 'CHF',
  } : undefined;

  const notesExtra = [order.notes || payload.notes || null].filter(Boolean).join(' | ') || undefined;
  const customerDisplay = `${order.customerName || 'Client'} • ${orderTypeLabel || 'Commande'}`;
  const historyCount = Number.isFinite(Number(order?.customerOrderCount))
    ? Number(order.customerOrderCount)
    : Number.isFinite(Number(customerTotalOrderCount))
      ? Math.max(customerTotalOrderCount - 1, 0)
      : 0;
  const prepDisplay = Number.isFinite(Number(order?.prepMinutes)) ? `${Number(order.prepMinutes)} min` : null;

  const displaySections = [];
  displaySections.push({ key: 'customer_type', line: customerDisplay });
  if (customerAddress) displaySections.push({ key: 'address', line: `Adresse: ${customerAddress}` });
  if (paymentMethod) displaySections.push({ key: 'payment', line: `Paiement: ${paymentMethod}` });
  displaySections.push({ key: 'ordered_at', line: `Commande: ${createdAtIso}` });
  displaySections.push({ key: 'history', line: `Historique client: ${historyCount} commande${historyCount > 1 ? 's' : ''} précédente${historyCount > 1 ? 's' : ''}` });
  if (prepDisplay) displaySections.push({ key: 'prep', line: `Préparation: ${prepDisplay}` });
  displaySections.push({ key: 'items_header', line: 'Articles:' });

  const itemDisplayLines = [];
  const receiptItemLines = [];
  items.forEach((line) => {
    const qty = Number(line.quantity || 1);
    const linePrice = Number.isFinite(Number(line.totalPrice)) ? Number(line.totalPrice) : null;
    const unitPrice = Number.isFinite(Number(line.unitPrice)) ? Number(line.unitPrice) : null;
    const priceText = linePrice != null ? `${linePrice.toFixed(2)} CHF` : unitPrice != null ? `${unitPrice.toFixed(2)} CHF` : '-';
    itemDisplayLines.push(`• ${qty} x ${line.name} — ${priceText}`);
    receiptItemLines.push(linePrice != null || unitPrice != null ? `${qty} x ${line.name}  ${(linePrice ?? unitPrice).toFixed(2)}` : `${qty} x ${line.name}`);
    (Array.isArray(line.modifiers) ? line.modifiers : []).forEach((mod) => {
      if (mod) {
        itemDisplayLines.push(`  + ${String(mod)}`);
        receiptItemLines.push(`  + ${String(mod)}`);
      }
    });
    if (line.note) {
      itemDisplayLines.push(`  note: ${line.note}`);
      receiptItemLines.push(`  note: ${line.note}`);
    }
  });
  itemDisplayLines.forEach((line) => displaySections.push({ key: 'item', line }));
  if (totals && Number.isFinite(Number(totals.total))) displaySections.push({ key: 'total', line: `Total: ${Number(totals.total).toFixed(2)} ${totals.currency || 'CHF'}` });
  if (notesExtra) displaySections.push({ key: 'notes', line: `Notes: ${notesExtra}` });

  const receiptMetaLines = displaySections
    .filter((section) => !['items_header', 'item', 'total', 'notes'].includes(section.key))
    .map((section) => section.line);

  const receiptLines = [
    String(order.orderNumber || order.id || ''),
    ...receiptMetaLines,
    '------------------------------',
    'Articles:',
    ...receiptItemLines,
    '------------------------------',
  ];
  if (totals && Number.isFinite(Number(totals.total))) receiptLines.push(`TOTAL: ${Number(totals.total).toFixed(2)} ${totals.currency || 'CHF'}`);
  if (notesExtra) receiptLines.push(`Notes: ${notesExtra}`);

  return {
    items,
    itemsSource: itemSource,
    createdAtIso,
    customerPhone,
    customerAddress,
    paymentMethod,
    orderType,
    orderTypeLabel,
    customerTotalOrderCount,
    customerOrderCount: historyCount,
    totals,
    notesExtra,
    displaySections,
    receiptLines,
  };
}

export function normalizeOrderForPrint(order) {
  return normalizeOrderForDisplay(order);
}

export function buildPrintJobFromOrder(order, restaurant) {
  const displayModel = normalizeOrderForDisplay(order);

  return {
    printJobId: `job_${order.id}_${Date.now()}`,
    schemaVersion: '1.1',
    createdAtIso: displayModel.createdAtIso,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      address: restaurant.address,
      phone: restaurant.phone,
    },
    orderId: order.id,
    order_id: order.id,
    orderNumber: order.orderNumber || order.id,
    order_number: order.orderNumber || order.id,
    customerName: order.customerName,
    customer_name: order.customerName,
    customerTotalOrderCount: displayModel.customerTotalOrderCount,
    customer_total_order_count: displayModel.customerTotalOrderCount,
    itemsSource: displayModel.itemsSource,
    lines: displayModel.items,
    items: displayModel.items,
    totals: displayModel.totals,
    notes: displayModel.notesExtra,
    printed_from_display_model: true,
    displayModel: {
      itemsSource: displayModel.itemsSource,
      displaySections: displayModel.displaySections,
      receiptLines: displayModel.receiptLines,
      items: displayModel.items,
      totals: displayModel.totals,
      notesExtra: displayModel.notesExtra,
    },
    formattingHints: {
      paperWidth: '58mm',
      locale: 'fr-CH',
      outputStrategy: 'bitmap_experiment',
    },
  };
}
