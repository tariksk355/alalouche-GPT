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
