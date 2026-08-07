import assert from 'node:assert/strict';
import test from 'node:test';

import { renderIncomingOrderModal, renderIncomingReservationModal } from '../src/alerts/incomingItemModal.js';

const common = {
  customer: 'Client', phone: 'Téléphone', email: 'Email', notes: 'Note', confirm: 'CONFIRMER', confirming: 'Confirmation...',
};

test('order modal renders normalized items and totals while escaping PII', () => {
  const html = renderIncomingOrderModal({
    alert: { key: 'order:o1' },
    order: { id: 'o1', orderNumber: 'A-1', customerName: '<Client>' },
    displayModel: {
      items: [{ quantity: 2, name: 'Plat & dessert', totalPrice: 24, modifiers: ['Sauce <forte>'], note: 'Sans "sel"' }],
      totals: { subtotal: 30, discount: 6, total: 24, currency: 'CHF', promotionCode: 'PROMO' },
      orderTypeLabel: 'Livraison', paymentMethod: 'Carte', customerPhone: '+41 00', customerAddress: 'Rue <1>', notesExtra: 'Sonnez & attendez',
    },
    prepMinutes: 30,
    confirming: false,
    error: '',
    labels: { ...common, title: 'Nouvelle commande', prepTime: 'Temps', orderDetails: 'Détails', orderType: 'Type', payment: 'Paiement', address: 'Adresse', items: 'Articles', subtotal: 'Sous-total', promotion: 'Promotion', discount: 'Réduction', total: 'Total' },
  });
  assert.match(html, /2 × Plat &amp; dessert/);
  assert.match(html, /Sauce &lt;forte&gt;/);
  assert.match(html, /24\.00 CHF/);
  assert.match(html, /Rue &lt;1&gt;/);
  assert.doesNotMatch(html, /<Client>/);
  assert.match(html, /prep-chip active[^>]*data-minutes="30"/);
});

test('reservation modal omits absent optional fields and disables confirmation in flight', () => {
  const html = renderIncomingReservationModal({
    alert: { key: 'reservation:r1' },
    reservation: { id: 'r1', customerName: 'A & B', reservationDate: 'unused', guestCount: 4, customerPhone: '', customerEmail: null, notes: '<table>' },
    formattedDate: '08.08.2026 19:00',
    confirming: true,
    error: 'Erreur <réseau>',
    labels: { ...common, title: 'Nouvelle réservation', details: 'Détails', dateTime: 'Date', guests: 'Personnes' },
  });
  assert.match(html, /A &amp; B/);
  assert.doesNotMatch(html, /Téléphone/);
  assert.doesNotMatch(html, />Email</);
  assert.match(html, /&lt;table&gt;/);
  assert.match(html, /Erreur &lt;réseau&gt;/);
  assert.match(html, /data-action="confirm-incoming"[^>]*disabled/);
});
