import { POLL_INTERVAL_MS } from './config.js';
import { debugLog } from './debug.js';
import { formatOrderStatus } from './boundaries/orderFormatter.js';
import { changeOrderStatus, validateDeviceAndLoadOrders } from './services/receiverService.js';

const app = document.getElementById('app');

const state = {
  mode: 'loading', // loading | not_paired | verifying | server_error | loaded
  deviceName: '',
  orders: [],
  error: '',
  inFlight: false,
  pollId: null,
};

function render() {
  if (state.mode === 'loading') {
    app.innerHTML = '<div class="card"><div class="title">Sunmi Receiver</div><p>Chargement...</p></div>';
    return;
  }

  if (state.mode === 'verifying') {
    app.innerHTML = '<div class="card"><div class="title">Sunmi Receiver</div><p>Vérification du périphérique...</p></div>';
    return;
  }

  if (state.mode === 'not_paired') {
    app.innerHTML = `
      <div class="card">
        <div class="title">Sunmi Receiver</div>
        <p class="warning">Appareil non associé.</p>
        <p class="subtle">Associez ce périphérique via le flux de pairing (code manuel), puis revenez ici.</p>
        ${state.error ? `<p class="error">${state.error}</p>` : ''}
      </div>
    `;
    return;
  }

  if (state.mode === 'server_error') {
    app.innerHTML = `
      <div class="card">
        <div class="title">Sunmi Receiver</div>
        <p class="error">Erreur serveur</p>
        <p class="subtle">${state.error || 'Vérifiez la connectivité réseau et le backend.'}</p>
      </div>
    `;
    return;
  }

  const ordersHtml = state.orders.length === 0
    ? '<div class="card"><p class="subtle">Aucune commande en attente.</p></div>'
    : state.orders.map((order) => `
      <div class="card" data-order-id="${order.id}">
        <div class="topbar">
          <strong>${order.orderNumber || order.id}</strong>
          <span class="status-pill">${formatOrderStatus(order.status)}</span>
        </div>
        <div class="subtle">${order.customerName || 'Client'}</div>
        <div class="btn-row">
          <button class="btn-accept" data-action="accepted" data-id="${order.id}">Accepter</button>
          <button class="btn-ready" data-action="ready" data-id="${order.id}">Prêt</button>
          <button class="btn-done" data-action="completed" data-id="${order.id}">Terminé</button>
        </div>
      </div>
    `).join('');

  app.innerHTML = `
    <div class="card">
      <div class="title">Sunmi Receiver</div>
      <p class="subtle">Connecté: ${state.deviceName || 'Périphérique'}</p>
    </div>
    ${ordersHtml}
    ${state.error ? `<div class="card"><p class="error">${state.error}</p></div>` : ''}
  `;
}

async function refresh() {
  if (state.inFlight) {
    debugLog('poll_skipped_inflight');
    return;
  }

  state.inFlight = true;
  if (state.mode === 'loading') state.mode = 'verifying';

  const result = await validateDeviceAndLoadOrders();
  state.mode = result.state;
  state.deviceName = result.device?.deviceName || '';
  state.orders = result.orders || [];
  state.error = result.error || '';
  state.inFlight = false;
  render();
}

app.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const orderId = target.dataset.id;
  const status = target.dataset.action;
  if (!orderId || !status) return;

  target.setAttribute('disabled', 'true');
  const res = await changeOrderStatus(orderId, status);
  target.removeAttribute('disabled');

  if (!res.ok) {
    state.error = res.message;
    render();
    return;
  }

  await refresh();
});

function startPolling() {
  if (state.pollId) clearInterval(state.pollId);

  state.pollId = setInterval(() => {
    refresh();
  }, POLL_INTERVAL_MS);
}

window.addEventListener('beforeunload', () => {
  if (state.pollId) clearInterval(state.pollId);
});

render();
refresh();
startPolling();
