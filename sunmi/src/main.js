import { POLL_INTERVAL_MS } from './config.js';
import { debugLog } from './debug.js';
import { formatOrderStatus, toPrintJob } from './boundaries/orderFormatter.js';
import { createPrinterAdapter } from './boundaries/printerAdapter.js';
import {
  changeOrderStatus,
  changeReservationStatus,
  loadOperationalData,
  validateDeviceSession,
} from './services/receiverService.js';
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
  reservations: [],
  error: '',
  receiverInFlight: false,
  pairingInFlight: false,
  receiverPollId: null,
  pairingPollId: null,
  pairingTimeoutId: null,
  printerMessage: '',
  prepMinutesByOrderId: {},
  printDebug: {
    at: null,
    mode: 'idle',
    method: null,
    payloadBuilt: false,
    orderNumber: null,
    lineCount: 0,
    ok: null,
    message: '',
    fallbackUsed: false,
    receiptPreview: '',
  },
};

function setPrintDebug(patch) {
  state.printDebug = {
    ...state.printDebug,
    ...patch,
    at: new Date().toISOString(),
  };
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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
    debugLog('receiver_poll_stop');
  }
}

function formatReservationStatus(status) {
  const labels = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    cancelled: 'Annulée',
  };
  return labels[status] || status;
}

function formatReservationDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('fr-CH');
}


function formatOrderType(orderType) {
  return orderType === 'delivery' ? 'Livraison' : 'À emporter';
}

function formatOrderDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('fr-CH');
}

function prepMinutesForOrder(order) {
  const selected = state.prepMinutesByOrderId[order.id];
  if ([15, 30, 45, 60].includes(Number(selected))) return Number(selected);
  if ([15, 30, 45, 60].includes(Number(order.prepMinutes))) return Number(order.prepMinutes);
  return 30;
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
        <div class="subtle">${order.customerName || 'Client'} • ${formatOrderType(order.orderType)}</div>
        ${order.customerAddress ? `<div class="subtle">Adresse: ${order.customerAddress}</div>` : ''}
        ${order.paymentMethod ? `<div class="subtle">Paiement: ${order.paymentMethod}</div>` : ''}
        <div class="subtle">Commande: ${formatOrderDate(order.createdAt)}</div>
        <div class="subtle">Historique client: ${Number(order.customerOrderCount || 0)} commande${Number(order.customerOrderCount || 0) > 1 ? 's' : ''} précédente${Number(order.customerOrderCount || 0) > 1 ? 's' : ''}</div>
        <div class="subtle">Préparation: ${order.prepMinutes ? `${order.prepMinutes} min` : `${prepMinutesForOrder(order)} min (proposé)`}</div>
        <div class="prep-row">
          <span class="subtle">Temps prep</span>
          <div class="chip-row">
            ${[15, 30, 45, 60].map((minutes) => `<button class="prep-chip ${prepMinutesForOrder(order) === minutes ? 'active' : ''}" data-action="set-prep" data-id="${order.id}" data-minutes="${minutes}">${minutes} min</button>`).join('')}
          </div>
        </div>
        <div class="btn-row">
          <button class="btn-accept" data-action="accepted" data-id="${order.id}">Accepter & imprimer</button>
          <button class="btn-ready" data-action="ready" data-id="${order.id}">Prêt</button>
          <button class="btn-done" data-action="completed" data-id="${order.id}">Terminé</button>
        </div>
      </div>
    `).join('');

  const reservationsHtml = state.reservations.length === 0
    ? '<div class="card"><p class="subtle">Aucune réservation en cours.</p></div>'
    : state.reservations.map((reservation) => `
      <div class="card" data-reservation-id="${reservation.id}">
        <div class="topbar">
          <strong>${reservation.customerName || reservation.id}</strong>
          <span class="status-pill">${formatReservationStatus(reservation.status)}</span>
        </div>
        <div class="subtle">${reservation.guestCount || '-'} couverts • ${formatReservationDate(reservation.reservationDate)}</div>
        ${reservation.notes ? `<div class="subtle">Note: ${reservation.notes}</div>` : ''}
        <div class="btn-row">
          <button class="btn-accept" data-action="reservation_confirmed" data-id="${reservation.id}">Confirmer</button>
          <button class="btn-secondary-inline" data-action="reservation_cancelled" data-id="${reservation.id}">Annuler</button>
        </div>
      </div>
    `).join('');

  const printDebug = state.printDebug;
  const printDebugHtml = `
    <div class="card debug-card">
      <div class="title">Debug impression (temporaire)</div>
      <p class="subtle">Utiliser pour diagnostic on-device sans logcat.</p>
      <div class="debug-grid">
        <div><span class="subtle">Heure:</span> <strong>${printDebug.at ? formatOrderDate(printDebug.at) : '-'}</strong></div>
        <div><span class="subtle">État:</span> <strong>${printDebug.mode || '-'}</strong></div>
        <div><span class="subtle">Bridge method:</span> <strong>${printDebug.method || '-'}</strong></div>
        <div><span class="subtle">Payload construit:</span> <strong>${printDebug.payloadBuilt ? 'oui' : 'non'}</strong></div>
        <div><span class="subtle">Commande:</span> <strong>${printDebug.orderNumber || '-'}</strong></div>
        <div><span class="subtle">Lignes:</span> <strong>${Number(printDebug.lineCount || 0)}</strong></div>
        <div><span class="subtle">Résultat natif:</span> <strong>${printDebug.ok === null ? '-' : (printDebug.ok ? 'succès' : 'erreur')}</strong></div>
        <div><span class="subtle">Fallback:</span> <strong>${printDebug.fallbackUsed ? 'oui' : 'non'}</strong></div>
      </div>
      ${printDebug.message ? `<p class="subtle">Message: ${printDebug.message}</p>` : ''}
      ${printDebug.receiptPreview ? `<p class="subtle">Prévisualisation ticket (natif):</p><pre class="debug-pre">${escapeHtml(printDebug.receiptPreview)}</pre>` : ''}
      <button id="clear-print-debug-btn" class="btn-secondary-inline">Effacer debug impression</button>
    </div>
  `;

  app.innerHTML = `
    <div class="card">
      <div class="title">Sunmi Receiver</div>
      <p class="subtle">Connecté: ${state.deviceName || 'Périphérique'}</p>
      <div class="btn-row">
        <button id="printer-info-btn" class="btn-secondary-inline">Info imprimante</button>
              </div>
      <button id="unpair-btn" class="btn-secondary">Désassocier cet appareil</button>
    </div>

    <div class="card">
      <div class="title">Commandes</div>
      <p class="subtle">Gestion opérationnelle des commandes</p>
    </div>
    ${ordersHtml}

    <div class="card">
      <div class="title">Réservations</div>
      <p class="subtle">Confirmer ou annuler les réservations</p>
    </div>
    ${reservationsHtml}

    ${printDebugHtml}

    ${state.printerMessage ? `<div class="card"><p class="subtle">${state.printerMessage}</p></div>` : ''}
    ${state.error ? `<div class="card"><p class="error">${state.error}</p></div>` : ''}
  `;
}

async function validateDeviceOnceAndEnterReceiver() {
  debugLog('device_validation_started');
  state.mode = 'verifying';
  render();

  const validation = await validateDeviceSession();

  if (validation.state === 'validated') {
    state.mode = 'receiver_loaded';
    state.deviceName = validation.device?.deviceName || '';
    state.error = '';
    debugLog('device_validation_success', { deviceName: state.deviceName || 'unknown' });
    render();
    return true;
  }

  if (validation.state === 'not_paired') {
    state.mode = 'not_paired';
    state.pairingMessage = '';
    state.error = validation.error || '';
    state.deviceName = '';
    state.orders = [];
    state.reservations = [];
    state.printerMessage = '';
    state.prepMinutesByOrderId = {};
    stopReceiverPolling();
    debugLog('device_validation_not_paired', { message: state.error || 'no_message' });
    render();
    return false;
  }

  state.mode = 'server_error';
  state.error = validation.error || 'Erreur serveur.';
  debugLog('device_validation_server_error', { message: state.error || 'unknown_error' });
  render();
  return false;
}

async function refreshOperations() {
  if (state.receiverInFlight) {
    debugLog('poll_skipped_inflight');
    return;
  }

  if (state.mode !== 'receiver_loaded') {
    debugLog('poll_skipped_mode', { mode: state.mode });
    return;
  }

  state.receiverInFlight = true;
  debugLog('operations_poll_tick');

  const result = await loadOperationalData();

  if (result.state === 'loaded') {
    state.orders = result.orders || [];
    state.reservations = result.reservations || [];
    const nextPrep = {};
    for (const order of state.orders) {
      const existing = state.prepMinutesByOrderId[order.id];
      nextPrep[order.id] = [15, 30, 45, 60].includes(Number(existing)) ? Number(existing) : ([15, 30, 45, 60].includes(Number(order.prepMinutes)) ? Number(order.prepMinutes) : 30);
    }
    state.prepMinutesByOrderId = nextPrep;
    state.error = '';
    debugLog('operations_poll_success', {
      orders: state.orders.length,
      reservations: state.reservations.length,
    });
  } else if (result.state === 'not_paired') {
    state.mode = 'not_paired';
    state.pairingMessage = '';
    state.error = result.error || '';
    state.deviceName = '';
    state.orders = [];
    state.reservations = [];
    state.printerMessage = '';
    state.prepMinutesByOrderId = {};
    stopReceiverPolling();
    debugLog('operations_poll_auth_failed', { message: state.error || 'token_invalid' });
  } else {
    // Keep receiver UI stable; only report background polling error.
    state.error = result.error || 'Erreur serveur.';
    debugLog('operations_poll_server_error', { message: state.error || 'unknown_error' });
  }

  state.receiverInFlight = false;
  render();
}

function startReceiverPolling() {
  stopReceiverPolling();
  debugLog('receiver_poll_start', { intervalMs: POLL_INTERVAL_MS });
  state.receiverPollId = setInterval(() => {
    if (state.mode !== 'receiver_loaded') return;
    refreshOperations();
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
      await validateDeviceOnceAndEnterReceiver();
      if (state.mode === 'receiver_loaded') {
        await refreshOperations();
        startReceiverPolling();
      }
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

async function printAcceptedOrder(order) {
  const printJob = toPrintJob(order, {
    name: 'À la Louche',
  });

  const resolvedMethod = typeof window.SunmiBridge?.printReceipt === 'function'
    ? 'printReceipt'
    : typeof window.SunmiBridge?.printOrder === 'function'
      ? 'printOrder'
      : typeof window.SunmiBridge?.print === 'function'
        ? 'print'
        : null;

  setPrintDebug({
    mode: 'dispatching',
    method: resolvedMethod,
    payloadBuilt: Boolean(printJob),
    orderNumber: printJob?.orderNumber || order.orderNumber || order.id || null,
    lineCount: Array.isArray(printJob?.lines) ? printJob.lines.length : 0,
    ok: null,
    message: '',
    fallbackUsed: false,
    receiptPreview: '',
  });
  render();

  debugLog('print_job_dispatch', {
    orderId: printJob.orderId,
    orderNumber: printJob.orderNumber,
    lineCount: Array.isArray(printJob.lines) ? printJob.lines.length : 0,
    hasTotals: Boolean(printJob.totals && printJob.totals.total != null),
  });
  debugLog('print_job_dispatch_json', safeStringify(printJob));

  const res = await printerAdapter.printReceipt(printJob);
  debugLog('print_job_result', res);
  debugLog('print_job_result_json', safeStringify(res));

  setPrintDebug({
    mode: 'native_response',
    method: res?.bridgeMethod || resolvedMethod,
    payloadBuilt: true,
    orderNumber: printJob?.orderNumber || order.orderNumber || order.id || null,
    lineCount: Array.isArray(printJob?.lines) ? printJob.lines.length : 0,
    ok: Boolean(res?.ok),
    message: `${res?.code || 'UNKNOWN'}${res?.message ? ` - ${res.message}` : ''}`,
    fallbackUsed: false,
    receiptPreview: typeof res?.renderedReceiptText === 'string' ? res.renderedReceiptText : '',
  });

  if (res.ok) {
    state.printerMessage = `Impression envoyée pour ${order.orderNumber || order.id}.`;
  } else {
    state.printerMessage = `Commande acceptée, mais impression indisponible: ${res.code || 'UNKNOWN'} - ${res.message || ''}`;
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
    state.reservations = [];
    state.error = '';
    state.pairingMessage = '';
    state.printerMessage = '';
    state.prepMinutesByOrderId = {};
    stopReceiverPolling();
    stopPairingPolling();
    render();
    return;
  }

  if (target.id === 'retry-btn') {
    if (state.mode === 'receiver_loaded') {
      await refreshOperations();
    } else {
      const validated = await validateDeviceOnceAndEnterReceiver();
      if (validated) {
        await refreshOperations();
        startReceiverPolling();
      }
    }
    return;
  }

  if (target.id === 'printer-info-btn') {
    await showPrinterInfo();
    return;
  }

  if (target.id === 'clear-print-debug-btn') {
    state.printDebug = {
      at: null,
      mode: 'idle',
      method: null,
      payloadBuilt: false,
      orderNumber: null,
      lineCount: 0,
      ok: null,
      message: '',
      fallbackUsed: false,
      receiptPreview: '',
    };
    render();
    return;
  }



  if (target.dataset.action === 'set-prep' && target.dataset.id) {
    const minutes = Number(target.dataset.minutes || 0);
    if ([15, 30, 45, 60].includes(minutes)) {
      state.prepMinutesByOrderId[target.dataset.id] = minutes;
      state.error = '';
      render();
    }
    return;
  }
  const reservationAction = target.dataset.action;
  const reservationId = target.dataset.id;
  if (reservationAction === 'reservation_confirmed' || reservationAction === 'reservation_cancelled') {
    const status = reservationAction === 'reservation_confirmed' ? 'confirmed' : 'cancelled';
    const res = await changeReservationStatus(reservationId, status);
    if (!res.ok) {
      state.error = res.message;
      if (res.code === 'DEVICE_AUTH_REQUIRED') {
        state.mode = 'not_paired';
        stopReceiverPolling();
      }
      render();
      return;
    }

    await refreshOperations();
    return;
  }

  const orderId = target.dataset.id;
  const status = target.dataset.action;
  if (!orderId || !status) return;


  if (!['accepted', 'ready', 'completed'].includes(status)) {
    return;
  }

  let prepMinutes;
  if (status === 'accepted') {
    prepMinutes = state.prepMinutesByOrderId[orderId] || undefined;
  }

  target.setAttribute('disabled', 'true');
  const res = await changeOrderStatus(orderId, status, prepMinutes);
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

  if (status === 'accepted') {
    const acceptedOrder = state.orders.find((item) => item.id === orderId);
    const liveAcceptedOrder = res.order || acceptedOrder;
    if (liveAcceptedOrder) {
      await printAcceptedOrder({
        ...(acceptedOrder || {}),
        ...(liveAcceptedOrder || {}),
        payload: (liveAcceptedOrder && liveAcceptedOrder.payload) || acceptedOrder?.payload,
        prepMinutes: prepMinutes || (liveAcceptedOrder?.prepMinutes ?? acceptedOrder?.prepMinutes),
      });
    }
  }

  await refreshOperations();
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

  const validated = await validateDeviceOnceAndEnterReceiver();
  if (!validated) return;

  await refreshOperations();
  if (state.mode === 'receiver_loaded') {
    startReceiverPolling();
  }
}

boot();
