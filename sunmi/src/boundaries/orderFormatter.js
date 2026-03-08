import { buildPrintJobFromOrder } from './printJobContract.js';

export function formatOrderStatus(status) {
  const labels = {
    new: 'Nouveau',
    accepted: 'Accepté',
    ready: 'Prêt',
    completed: 'Terminé',
    cancelled: 'Annulé',
  };

  return labels[status] || status;
}

// Boundary helper: build structured print data from receiver order.
// No printer-specific rendering in web shell.
export function toPrintJob(order, restaurant) {
  return buildPrintJobFromOrder(order, restaurant);
}
