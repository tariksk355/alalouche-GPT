import { POLL_INTERVAL_MS } from './config.js';
import { debugLog } from './debug.js';
import { formatOrderStatus, toPrintJob } from './boundaries/orderFormatter.js';
import { createPrinterAdapter } from './boundaries/printerAdapter.js';
import { changeOrderStatus, validateDeviceAndLoadOrders } from './services/receiverService.js';
import { checkPairingStatus, submitPairingCode } from './services/pairingService.js';
import { tokenStore } from './storage/tokenStore.js';

const app = document.getElementById('app');
const printerAdapter = createPrinterAdapter();

const state = {
  mode: 'booting', // booting | not_paired | pairing_submitting | pairing_waiting | verifying | server_error | receiver_loaded
  pairingCode: '',
  pairingRequestId: null,
  pairingMessage: '',
  deviceName: '',
  orders: [],
  error: '',
  receiverInFlight: false,
  pairingInFlight: false,
  receiverPollId: null,
  pairingPollId: null,
  pairingTimeoutId: null,
  printerMessage: '',
};

function stopPairingPolling() {
  if (state.pairingPollId) {
    clearInterval(state.pairingPollId);
    state.pairingPollId = null;
  }
  if (state.pairingTimeoutId) {
    clearTimeout(state.pairingTimeoutId);
    state.pairingTimeoutId = null;
  }
}

function stopReceiverPolling() {
  if (state.receiverPollId) {
    clearInterval(state.receiverPollId);
    state.receiverPollId = null;
  }
}

function renderPairingCard() {
  return `
    <div class="card">
      <div class="title">Sunmi Receiver</div>
      <p class="warning">Appareil non associé</p>
      <p class="subtle">Entrez le code d'association fourni par l'administrateur.</p>
      <input id="pairing-code-input" class="input" placeholder="Ex: AB12CD" value="${state.pairingCode}" />
      <button id="pairing-submit-btn" class="btn-primary" ${state.mode === 'pairing_submitting' ? 'disabled' : ''}>
        ${state.mode === 'pairing_submitting' ? 'Envoi...' : "Associer l'appareil"}
      </button>
      <button id="reset-token-btn" class="btn-secondary">Réinitialiser le token local</button>
      ${state.pairingMessage ? `<p class="subtle">${state.pairingMessage}</p>` : ''}
      ${state.error ? `<p class="error">${state.error}</p>` : ''}
    </div>
  `;
}

function render() {
  if (state.mode === 'booting') {
    app.innerHTML = '<div class="card"><div class="title">Sunmi Receiver</div><p>Initialisation...</p></div>';
    return;
  }

  if (state.mode === 'not_paired' || state.mode === 'pairing_submitting') {
    app.innerHTML = renderPairingCard();
    return;
  }

  if (state.mode === 'pairing_waiting') {
    app.innerHTML = `
      <div class="card">
        <div class="title">Sunmi Receiver</div>
        <p>Association en attente de confirmation admin...</p>
        <p class="subtle">Request: ${state.pairingRequestId || '-'}</p>
        ${state.pairingMessage ? `<p class="subtle">${state.pairingMessage}</p>` : ''}
        ${state.error ? `<p class="error">${state.error}</p>` : ''}
        <button id="pairing-cancel-btn" class="btn-secondary">Annuler</button>
      </div>
    `;
    return;
  }

  if (state.mode === 'verifying') {
    app.innerHTML = '<div class="card"><div class="title">Sunmi Receiver</div><p>Vérification du périphérique...</p></div>';
    return;
  }

  if (state.mode === 'server_error') {
    app.innerHTML = `
      <div class="card">
        <div class="title">Sunmi Receiver</div>
        <p class="error">Erreur serveur</p>
        <p class="subtle">${state.error || 'Vérifiez la connectivité réseau et le backend.'}</p>
        <button id="retry-btn" class="btn-primary">Réessayer</button>
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
          <button class="btn-secondary-inline" data-action="print-test-order" data-id="${order.id}">Test print</button>
        </div>
      </div>
    `).join('');

  app.innerHTML = `
    <div class="card">
      <div class="title">Sunmi Receiver</div>
      <p class="subtle">Connecté: ${state.deviceName || 'Périphérique'}</p>
      <div class="btn-row">
        <button id="printer-info-btn" class="btn-secondary-inline">Info imprimante</button>
        <button id="printer-test-btn" class="btn-secondary-inline">Test impression</button>
      </div>
      <button id="unpair-btn" class="btn-secondary">Désassocier cet appareil</button>
    </div>
    ${ordersHtml}
    ${state.printerMessage ? `<div class="card"><p class="subtle">${state.printerMessage}</p></div>` : ''}
    ${state.error ? `<div class="card"><p class="error">${state.error}</p></div>` : ''}
  `;
}

async function refreshReceiver() {
  if (state.receiverInFlight) {
    debugLog('poll_skipped_inflight');
    return;
  }

  state.receiverInFlight = true;
  state.mode = 'verifying';
  render();

  const result = await validateDeviceAndLoadOrders();

  if (result.state === 'loaded') {
    state.mode = 'receiver_loaded';
    state.deviceName = result.device?.deviceName || '';
    state.orders = result.orders || [];
    state.error = '';
    debugLog('receiver_entered');
  } else if (result.state === 'not_paired') {
    state.mode = 'not_paired';
    state.pairingMessage = '';
    state.error = result.error || '';
    state.deviceName = '';
    state.orders = [];
    state.printerMessage = '';
    stopReceiverPolling();
  } else {
    state.mode = 'server_error';
    state.error = result.error || 'Erreur serveur.';
  }

  state.receiverInFlight = false;
  render();
}

function startReceiverPolling() {
  stopReceiverPolling();
  state.receiverPollId = setInterval(() => {
    if (state.mode !== 'receiver_loaded') return;
    refreshReceiver();
  }, POLL_INTERVAL_MS);
}

async function startPairingSubmit() {
  const code = state.pairingCode;
  state.mode = 'pairing_submitting';
  state.error = '';
  state.pairingMessage = '';
  render();

  const res = await submitPairingCode(code);

  if (!res.ok) {
    state.mode = 'not_paired';
    state.error = res.message;
    render();
    return;
  }

  state.pairingRequestId = res.pairingRequestId;
  state.mode = 'pairing_waiting';
  state.pairingMessage = 'Demande envoyée. En attente de confirmation...';
  debugLog('pairing_request_submitted', { pairingRequestId: res.pairingRequestId });
  render();
  startPairingPolling();
}

function startPairingPolling() {
  stopPairingPolling();
  state.pairingInFlight = false;

  state.pairingPollId = setInterval(async () => {
    if (state.mode !== 'pairing_waiting') return;
    if (state.pairingInFlight) return;
    state.pairingInFlight = true;

    debugLog('pairing_waiting_tick', { pairingRequestId: state.pairingRequestId });

    const result = await checkPairingStatus(state.pairingRequestId);

    if (result.status === 'paired') {
      stopPairingPolling();
      debugLog('pairing_verified');
      state.mode = 'verifying';
      state.error = '';
      state.pairingMessage = '';
      render();
      await refreshReceiver();
      startReceiverPolling();
    } else if (result.status === 'expired') {
      stopPairingPolling();
      state.mode = 'not_paired';
      state.error = result.message;
      state.pairingMessage = '';
      render();
    } else if (result.status === 'error') {
      state.error = result.message;
      render();
    }

    state.pairingInFlight = false;
  }, 3000);

  state.pairingTimeoutId = setTimeout(() => {
    stopPairingPolling();
    if (state.mode === 'pairing_waiting') {
      state.mode = 'not_paired';
      state.error = "Délai dépassé. Veuillez régénérer un code d'association.";
      state.pairingMessage = '';
      render();
    }
  }, 10 * 60 * 1000);
}

async function showPrinterInfo() {
  const info = await printerAdapter.getPrinterInfo();
  state.printerMessage = `Imprimante: mode=${info.mode}, available=${info.available}${info.message ? `, message=${info.message}` : ''}`;
  render();
}

async function runPrintTest(order) {
  const printJob = toPrintJob(order || {
    id: 'test-order',
    orderNumber: 'TEST-001',
    customerName: 'Test Client',
    payload: {
      items: [{ name: 'Article test', quantity: 1, price: 0 }],
      total: 0,
      currency: 'CHF',
    },
  }, {
    name: 'À la Louche',
  });

  const res = await printerAdapter.printReceipt(printJob);

  if (res.ok) {
    state.printerMessage = 'Impression envoyée avec succès.';
  } else {
    state.printerMessage = `Impression indisponible: ${res.code || 'UNKNOWN'} - ${res.message || ''}`;
  }
  render();
}

app.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === 'pairing-code-input') {
    state.pairingCode = target.value.toUpperCase();
  }
});

app.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.id === 'pairing-submit-btn') {
    await startPairingSubmit();
    return;
  }

  if (target.id === 'pairing-cancel-btn') {
    stopPairingPolling();
    state.mode = 'not_paired';
    state.pairingMessage = '';
    state.error = '';
    render();
    return;
  }

  if (target.id === 'reset-token-btn' || target.id === 'unpair-btn') {
    tokenStore.clear();
    state.mode = 'not_paired';
    state.deviceName = '';
    state.orders = [];
    state.error = '';
    state.pairingMessage = '';
    state.printerMessage = '';
    stopReceiverPolling();
    stopPairingPolling();
    render();
    return;
  }

  if (target.id === 'retry-btn') {
    await refreshReceiver();
    return;
  }

  if (target.id === 'printer-info-btn') {
    await showPrinterInfo();
    return;
  }

  if (target.id === 'printer-test-btn') {
    await runPrintTest(state.orders[0]);
    return;
  }

  const orderId = target.dataset.id;
  const status = target.dataset.action;
  if (!orderId || !status) return;

  if (status === 'print-test-order') {
    const order = state.orders.find((item) => item.id === orderId);
    await runPrintTest(order);
    return;
  }

  target.setAttribute('disabled', 'true');
  const res = await changeOrderStatus(orderId, status);
  target.removeAttribute('disabled');

  if (!res.ok) {
    state.error = res.message;
    if (res.code === 'DEVICE_AUTH_REQUIRED') {
      state.mode = 'not_paired';
      stopReceiverPolling();
    }
    render();
    return;
  }

  await refreshReceiver();
});

window.addEventListener('beforeunload', () => {
  stopReceiverPolling();
  stopPairingPolling();
});

async function boot() {
  debugLog('app_boot');
  render();

  if (!tokenStore.get()) {
    state.mode = 'not_paired';
    render();
    return;
  }

  await refreshReceiver();
  if (state.mode === 'receiver_loaded') {
    startReceiverPolling();
  }
}

boot();
