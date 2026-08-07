function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function detailRow(label, value) {
  if (value == null || String(value).trim() === '') return '';
  return `<div class="incoming-detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function money(value, currency = 'CHF') {
  return `${Number(value).toFixed(2)} ${escapeHtml(currency)}`;
}

export function renderIncomingOrderModal({ alert, order, displayModel, prepMinutes, confirming, error, labels }) {
  const items = displayModel.items.map((item) => {
    const price = Number.isFinite(Number(item.totalPrice))
      ? money(item.totalPrice, displayModel.totals?.currency)
      : Number.isFinite(Number(item.unitPrice)) ? money(item.unitPrice, displayModel.totals?.currency) : '';
    const modifiers = (item.modifiers || []).map((modifier) => `<li>${escapeHtml(modifier)}</li>`).join('');
    const note = item.note ? `<div class="incoming-item-note">${escapeHtml(item.note)}</div>` : '';
    return `<div class="incoming-item"><div class="incoming-item-main"><strong>${escapeHtml(item.quantity)} × ${escapeHtml(item.name)}</strong>${price ? `<span>${price}</span>` : ''}</div>${modifiers ? `<ul>${modifiers}</ul>` : ''}${note}</div>`;
  }).join('');
  const totals = displayModel.totals;
  const hasDiscount = Number.isFinite(Number(totals?.discount)) && Number(totals.discount) > 0;

  return `<div class="attention-overlay attention-overlay-order" role="dialog" aria-modal="true" aria-labelledby="incoming-order-title">
    <div class="incoming-modal-card">
      <header class="incoming-modal-header"><div class="incoming-modal-icon" aria-hidden="true">🔔</div><div><div id="incoming-order-title" class="incoming-modal-title">${escapeHtml(labels.title)}</div><div class="incoming-modal-reference">${escapeHtml(order.orderNumber || order.id)}</div></div></header>
      <div class="incoming-modal-body">
        <section class="incoming-section"><h3>${escapeHtml(labels.prepTime)}</h3><div class="incoming-prep-grid">${[15, 30, 45, 60].map((minutes) => `<button type="button" class="prep-chip ${prepMinutes === minutes ? 'active' : ''}" data-action="set-popup-prep" data-minutes="${minutes}" ${confirming ? 'disabled' : ''}>${minutes} min</button>`).join('')}</div></section>
        <section class="incoming-section"><h3>${escapeHtml(labels.orderDetails)}</h3>${detailRow(labels.customer, order.customerName)}${detailRow(labels.orderType, displayModel.orderTypeLabel)}${detailRow(labels.payment, displayModel.paymentMethod)}${detailRow(labels.phone, displayModel.customerPhone)}${detailRow(labels.address, displayModel.customerAddress)}</section>
        ${items ? `<section class="incoming-section"><h3>${escapeHtml(labels.items)}</h3>${items}</section>` : ''}
        ${totals && Number.isFinite(Number(totals.total)) ? `<section class="incoming-section incoming-totals">${hasDiscount && Number.isFinite(Number(totals.subtotal)) ? detailRow(labels.subtotal, money(totals.subtotal, totals.currency)) : ''}${hasDiscount && totals.promotionCode ? detailRow(labels.promotion, totals.promotionCode) : ''}${hasDiscount ? detailRow(labels.discount, `-${money(totals.discount, totals.currency)}`) : ''}${detailRow(labels.total, money(totals.total, totals.currency))}</section>` : ''}
        ${displayModel.notesExtra ? `<section class="incoming-section"><h3>${escapeHtml(labels.notes)}</h3><div class="incoming-notes">${escapeHtml(displayModel.notesExtra)}</div></section>` : ''}
        ${error ? `<div class="incoming-modal-error" role="alert">${escapeHtml(error)}</div>` : ''}
      </div>
      <footer class="incoming-modal-footer"><button type="button" class="incoming-confirm" data-action="confirm-incoming" data-alert-key="${escapeHtml(alert.key)}" ${confirming ? 'disabled' : ''}>${escapeHtml(confirming ? labels.confirming : labels.confirm)}</button></footer>
    </div>
  </div>`;
}

export function renderIncomingReservationModal({ alert, reservation, formattedDate, confirming, error, labels }) {
  return `<div class="attention-overlay attention-overlay-reservation" role="dialog" aria-modal="true" aria-labelledby="incoming-reservation-title">
    <div class="incoming-modal-card">
      <header class="incoming-modal-header"><div class="incoming-modal-icon" aria-hidden="true">📅</div><div><div id="incoming-reservation-title" class="incoming-modal-title">${escapeHtml(labels.title)}</div></div></header>
      <div class="incoming-modal-body"><section class="incoming-section"><h3>${escapeHtml(labels.details)}</h3>${detailRow(labels.customer, reservation.customerName)}${detailRow(labels.dateTime, formattedDate)}${detailRow(labels.guests, reservation.guestCount)}${detailRow(labels.phone, reservation.customerPhone)}${detailRow(labels.email, reservation.customerEmail)}${reservation.notes ? `<div class="incoming-notes-block"><strong>${escapeHtml(labels.notes)}</strong><div class="incoming-notes">${escapeHtml(reservation.notes)}</div></div>` : ''}</section>${error ? `<div class="incoming-modal-error" role="alert">${escapeHtml(error)}</div>` : ''}</div>
      <footer class="incoming-modal-footer"><button type="button" class="incoming-confirm" data-action="confirm-incoming" data-alert-key="${escapeHtml(alert.key)}" ${confirming ? 'disabled' : ''}>${escapeHtml(confirming ? labels.confirming : labels.confirm)}</button></footer>
    </div>
  </div>`;
}
