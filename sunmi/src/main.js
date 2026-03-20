import { POLL_INTERVAL_MS } from './config.js';
import { debugLog } from './debug.js';
import { formatOrderStatus, toPrintJob } from './boundaries/orderFormatter.js';
import { createPrinterAdapter } from './boundaries/printerAdapter.js';
import { normalizeOrderForDisplay } from './boundaries/printJobContract.js';
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
const PRINT_STATUS_POLL_INTERVAL_MS = 3000;
const PRINT_TERMINAL_STATES = new Set(['PRINTED', 'NEEDS_ATTENTION']);
const PRINT_JOB_TRACKING_STORAGE_KEY = 'receiver_print_job_tracking_v1';
const TERMINAL_JOB_RETENTION_MS = 30 * 60 * 1000;
const PRINT_STRATEGY_OVERRIDE_STORAGE_KEY = 'sunmi_print_strategy_override_v1';
const ALERT_SETTINGS_STORAGE_KEY = 'sunmi_alert_settings_v1';
const COMPLETED_ORDERS_CACHE_STORAGE_KEY = 'sunmi_completed_orders_cache_v1';
const COMPLETED_SECTION_OPEN_STORAGE_KEY = 'sunmi_completed_section_open_v1';
const PRINT_DISPATCH_DEDUP_MS = 15000;
const ATTENTION_ALERT_DURATION_MS = 7000;

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
  printStatusPollId: null,
  pairingPollId: null,
  pairingTimeoutId: null,
  printerMessage: '',
  prepMinutesByOrderId: {},
  printJobsByOrderId: {},
  printRetryInFlightByOrderId: {},
  printDispatchInFlightByOrderId: {},
  lastPrintDispatchAtByOrderId: {},
  seenOrderIds: new Set(),
  seenReservationIds: new Set(),
  hasHydratedOperationalBaseline: false,
  alertSettings: {
    soundEnabled: true,
    orderEnabled: true,
    reservationEnabled: true,
    volume: 0.2,
  },
  isSettingsPanelOpen: false,
  hasLoggedInfoImprimanteRemoval: false,
  hasLoggedQueueStatusTextRemoval: false,
  completedOrdersById: {},
  completedSectionOpen: false,
  activeAttentionAlert: null,
  attentionAlertTimeoutId: null,
  reservationUiById: {},
  reservationFeedbackTimeoutsById: {},
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

function getReservationUiState(reservationId) {
  const candidate = reservationId ? state.reservationUiById[reservationId] : null;
  return {
    pendingAction: candidate?.pendingAction || null,
    confirmCancel: candidate?.confirmCancel === true,
    successMessage: candidate?.successMessage || '',
  };
}

function setReservationUiState(reservationId, patch) {
  if (!reservationId) return;
  const current = getReservationUiState(reservationId);
  state.reservationUiById[reservationId] = {
    ...current,
    ...patch,
  };
}

function clearReservationFeedbackTimeout(reservationId) {
  const timeoutId = state.reservationFeedbackTimeoutsById[reservationId];
  if (!timeoutId) return;
  clearTimeout(timeoutId);
  delete state.reservationFeedbackTimeoutsById[reservationId];
}

function scheduleReservationSuccessClear(reservationId) {
  clearReservationFeedbackTimeout(reservationId);
  state.reservationFeedbackTimeoutsById[reservationId] = setTimeout(() => {
    const current = getReservationUiState(reservationId);
    if (!current.successMessage) return;
    setReservationUiState(reservationId, { successMessage: '' });
    render();
  }, 2500);
}

function cleanupReservationUiState(nextReservations = state.reservations) {
  const activeIds = new Set((Array.isArray(nextReservations) ? nextReservations : []).map((reservation) => reservation?.id).filter(Boolean));

  Object.keys(state.reservationUiById).forEach((reservationId) => {
    if (activeIds.has(reservationId)) return;
    delete state.reservationUiById[reservationId];
    clearReservationFeedbackTimeout(reservationId);
  });

  (Array.isArray(nextReservations) ? nextReservations : []).forEach((reservation) => {
    if (!reservation?.id) return;
    if (String(reservation.status || '').toLowerCase() !== 'pending') {
      const current = getReservationUiState(reservation.id);
      if (current.confirmCancel || current.pendingAction) {
        setReservationUiState(reservation.id, {
          confirmCancel: false,
          pendingAction: null,
        });
      }
    }
  });
}

function updateReservationLocally(reservationId, patch) {
  state.reservations = state.reservations.map((reservation) => {
    if (reservation?.id !== reservationId) return reservation;
    return {
      ...reservation,
      ...patch,
    };
  });
}

function normalizeAlertSettings(value) {
  const candidate = value && typeof value === 'object' ? value : {};
  return {
    soundEnabled: candidate.soundEnabled !== false,
    orderEnabled: candidate.orderEnabled !== false,
    reservationEnabled: candidate.reservationEnabled !== false,
    volume: Math.min(1, Math.max(0, Number.isFinite(Number(candidate.volume)) ? Number(candidate.volume) : 0.2)),
  };
}

function persistAlertSettings() {
  try {
    localStorage.setItem(ALERT_SETTINGS_STORAGE_KEY, JSON.stringify(state.alertSettings));
  } catch {
    // ignore
  }
}

function loadAlertSettings() {
  try {
    const raw = localStorage.getItem(ALERT_SETTINGS_STORAGE_KEY);
    if (!raw) {
      state.alertSettings = normalizeAlertSettings();
      debugLog('alert_settings_loaded', state.alertSettings);
      return;
    }
    state.alertSettings = normalizeAlertSettings(JSON.parse(raw));
    debugLog('alert_settings_loaded', state.alertSettings);
  } catch {
    state.alertSettings = normalizeAlertSettings();
    debugLog('alert_settings_loaded', state.alertSettings);
  }
}

function setPrintDebug(patch) {
  state.printDebug = {
    ...state.printDebug,
    ...patch,
    at: new Date().toISOString(),
  };
}

function loadCompletedOrdersCache() {
  try {
    const raw = localStorage.getItem(COMPLETED_ORDERS_CACHE_STORAGE_KEY);
    if (!raw) {
      state.completedOrdersById = {};
      return;
    }
    const parsed = JSON.parse(raw);
    state.completedOrdersById = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    state.completedOrdersById = {};
  }
}

function persistCompletedOrdersCache() {
  try {
    localStorage.setItem(COMPLETED_ORDERS_CACHE_STORAGE_KEY, JSON.stringify(state.completedOrdersById));
  } catch {
    // ignore
  }
}

function clearCompletedOrdersCache() {
  state.completedOrdersById = {};
  try {
    localStorage.removeItem(COMPLETED_ORDERS_CACHE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function loadCompletedSectionOpenState() {
  try {
    const raw = localStorage.getItem(COMPLETED_SECTION_OPEN_STORAGE_KEY);
    state.completedSectionOpen = raw === 'true';
  } catch {
    state.completedSectionOpen = false;
  }
  console.debug(`[sunmi-receiver] completed_section_state_restored open=${state.completedSectionOpen}`);
}

function persistCompletedSectionOpenState() {
  try {
    localStorage.setItem(COMPLETED_SECTION_OPEN_STORAGE_KEY, state.completedSectionOpen ? 'true' : 'false');
  } catch {
    // ignore
  }
  console.debug(`[sunmi-receiver] completed_section_state_persisted open=${state.completedSectionOpen}`);
}

function clearAttentionAlert() {
  if (state.attentionAlertTimeoutId) {
    clearTimeout(state.attentionAlertTimeoutId);
    state.attentionAlertTimeoutId = null;
  }
  state.activeAttentionAlert = null;
}

async function playAttentionBeep(type, id) {
  const isTypeEnabled = type === 'order' ? state.alertSettings.orderEnabled : state.alertSettings.reservationEnabled;
  if (!state.alertSettings.soundEnabled || !isTypeEnabled) {
    if (type === 'order') {
      console.debug(`[sunmi-receiver] order_beep_skipped_sound_disabled orderId=${id}`);
    } else {
      console.debug(`[sunmi-receiver] reservation_beep_skipped_sound_disabled reservationId=${id}`);
    }
    return;
  }

  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    if (context.state === 'suspended') {
      await context.resume();
    }

    const pattern = type === 'order'
      ? [
        { f: 880, d: 0.13, g: 0.18 },
        { f: 660, d: 0.13, g: 0.18 },
        { f: 990, d: 0.22, g: 0.24 },
      ]
      : [
        { f: 620, d: 0.14, g: 0.16 },
        { f: 740, d: 0.14, g: 0.16 },
      ];

    let t = context.currentTime;
    for (const note of pattern) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type === 'order' ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(note.f, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(note.g * state.alertSettings.volume, t + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, t + note.d);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(t);
      osc.stop(t + note.d + 0.02);
      t += note.d + 0.06;
    }

    const settleMs = Math.ceil((t - context.currentTime) * 1000) + 80;
    setTimeout(() => {
      context.close().catch(() => {});
    }, settleMs);

    if (type === 'order') {
      console.debug(`[sunmi-receiver] order_beep_played orderId=${id}`);
    } else {
      console.debug(`[sunmi-receiver] reservation_beep_played reservationId=${id}`);
    }
  } catch (error) {
    debugLog('attention_beep_failed', { type, id, message: error?.message || 'unknown' });
  }
}

function showAttentionAlert(type, item) {
  const isTypeEnabled = type === 'order' ? state.alertSettings.orderEnabled : state.alertSettings.reservationEnabled;
  if (!state.alertSettings.soundEnabled || !isTypeEnabled) {
    return;
  }

  const id = item?.id || '';
  clearAttentionAlert();
  state.activeAttentionAlert = {
    type,
    id,
    title: type === 'order' ? 'Nouvelle commande' : 'Nouvelle réservation',
    subtitle: type === 'order' ? (item?.orderNumber || id) : (item?.customerName || item?.id || 'Nouvelle demande'),
    createdAt: Date.now(),
  };

  if (type === 'order') {
    console.debug(`[sunmi-receiver] order_alert_shown orderId=${id}`);
  } else {
    console.debug(`[sunmi-receiver] reservation_alert_shown reservationId=${id}`);
  }

  playAttentionBeep(type, id);
  state.attentionAlertTimeoutId = setTimeout(() => {
    clearAttentionAlert();
    render();
  }, ATTENTION_ALERT_DURATION_MS);
}

function detectAndTriggerNewEventAlerts(nextOrders, nextReservations) {
  const orderIds = new Set((Array.isArray(nextOrders) ? nextOrders : []).map((order) => order?.id).filter(Boolean));
  const reservationIds = new Set((Array.isArray(nextReservations) ? nextReservations : []).map((reservation) => reservation?.id).filter(Boolean));

  if (!state.hasHydratedOperationalBaseline) {
    state.seenOrderIds = orderIds;
    state.seenReservationIds = reservationIds;
    state.hasHydratedOperationalBaseline = true;
    return;
  }

  const newlyDetectedOrders = [];
  for (const order of (Array.isArray(nextOrders) ? nextOrders : [])) {
    const id = order?.id;
    if (!id) continue;
    if (state.seenOrderIds.has(id)) {
      console.debug(`[sunmi-receiver] alert_suppressed_already_seen type=order id=${id}`);
      continue;
    }
    state.seenOrderIds.add(id);
    console.debug(`[sunmi-receiver] new_order_detected orderId=${id}`);
    newlyDetectedOrders.push(order);
  }

  const newlyDetectedReservations = [];
  for (const reservation of (Array.isArray(nextReservations) ? nextReservations : [])) {
    const id = reservation?.id;
    if (!id) continue;
    if (state.seenReservationIds.has(id)) {
      console.debug(`[sunmi-receiver] alert_suppressed_already_seen type=reservation id=${id}`);
      continue;
    }
    state.seenReservationIds.add(id);
    console.debug(`[sunmi-receiver] new_reservation_detected reservationId=${id}`);
    newlyDetectedReservations.push(reservation);
  }

  if (newlyDetectedOrders.length > 0) {
    showAttentionAlert('order', newlyDetectedOrders[0]);
  } else if (newlyDetectedReservations.length > 0) {
    showAttentionAlert('reservation', newlyDetectedReservations[0]);
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resolveForcedOutputStrategy() {
  const urlParams = new URLSearchParams(window.location.search || '');
  const fromQuery = (urlParams.get('printStrategy') || '').trim();
  if (fromQuery) return { value: fromQuery, source: 'query.printStrategy' };

  const fromWindow = (window.__SUNMI_PRINT_STRATEGY_OVERRIDE__ || '').trim?.() || '';
  if (fromWindow) return { value: fromWindow, source: 'window.__SUNMI_PRINT_STRATEGY_OVERRIDE__' };

  try {
    const fromStorage = (localStorage.getItem(PRINT_STRATEGY_OVERRIDE_STORAGE_KEY) || '').trim();
    if (fromStorage) return { value: fromStorage, source: `localStorage.${PRINT_STRATEGY_OVERRIDE_STORAGE_KEY}` };
  } catch {
    // ignore
  }

  return { value: '', source: '' };
}

function resolveOneOrderDiagnosticStrategy() {
  const key = '__SUNMI_ONE_ORDER_DIAGNOSTIC_STRATEGY__';
  const candidate = window[key];
  if (typeof candidate === 'string' && candidate.trim()) {
    const value = candidate.trim();
    window[key] = '';
    return { value, source: `window.${key}(string_once)` };
  }
  if (candidate === true) {
    window[key] = false;
    return { value: 'direct_self_check_then_minimal_text', source: `window.${key}(boolean_once)` };
  }
  return { value: '', source: '' };
}

function applyOutputStrategyOverride(printJob) {
  const oneOrder = resolveOneOrderDiagnosticStrategy();
  const global = resolveForcedOutputStrategy();
  const forcedOneOrder = oneOrder.value;
  const forcedGlobal = global.value;
  const forced = forcedOneOrder || forcedGlobal;
  if (!printJob || typeof printJob !== 'object') return { printJob, outputStrategy: '' };

  const currentHints = (printJob.formattingHints && typeof printJob.formattingHints === 'object') ? printJob.formattingHints : {};
  const currentForce = typeof printJob.forceOutputStrategy === 'string' ? printJob.forceOutputStrategy.trim() : '';
  const currentTopLevelOutput = typeof printJob.outputStrategy === 'string' ? printJob.outputStrategy.trim() : '';
  const currentTopLevelNative = typeof printJob.nativePrintStrategy === 'string' ? printJob.nativePrintStrategy.trim() : '';
  const currentNativeHint = typeof currentHints.nativePrintStrategy === 'string' ? currentHints.nativePrintStrategy.trim() : '';
  const fromPayload = typeof currentHints.outputStrategy === 'string' ? currentHints.outputStrategy.trim() : '';
  const outputStrategy = forced || currentForce || fromPayload || currentNativeHint || currentTopLevelOutput || currentTopLevelNative;

  debugLog('print_strategy_before_normalization_json', JSON.stringify({
    forcedOneOrderSource: oneOrder.source,
    forcedOneOrder,
    forcedGlobalSource: global.source,
    forcedGlobal,
    forcedEffective: forced,
    currentForce,
    currentTopLevelOutput,
    currentTopLevelNative,
    formattingHintsOutputStrategy: fromPayload,
    formattingHintsNativePrintStrategy: currentNativeHint,
  }));

  if (!outputStrategy) {
    return { printJob: { ...printJob, formattingHints: { ...currentHints } }, outputStrategy: '' };
  }

  const nextHints = {
    ...currentHints,
    outputStrategy,
    nativePrintStrategy: outputStrategy,
  };

  const nextPrintJob = {
    ...printJob,
    outputStrategy,
    formattingHints: nextHints,
  };

  if (forced) {
    nextPrintJob.forceOutputStrategy = outputStrategy;
  } else if (currentForce) {
    nextPrintJob.forceOutputStrategy = currentForce;
  }

  debugLog('print_strategy_after_normalization_json', JSON.stringify({
    outputStrategyTopLevel: nextPrintJob.outputStrategy || '',
    forceOutputStrategy: nextPrintJob.forceOutputStrategy || '',
    'formattingHints.outputStrategy': nextPrintJob.formattingHints?.outputStrategy || '',
    'formattingHints.nativePrintStrategy': nextPrintJob.formattingHints?.nativePrintStrategy || '',
    strategyCopiedIntoPayload: Boolean(
      nextPrintJob.forceOutputStrategy
      || nextPrintJob.outputStrategy
      || nextPrintJob.formattingHints?.outputStrategy
      || nextPrintJob.formattingHints?.nativePrintStrategy,
    ),
  }));

  return {
    printJob: nextPrintJob,
    outputStrategy,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}



function normalizePrintUiState(nativeState) {
  if (nativeState === 'RETRY_SCHEDULED') return 'QUEUED';
  if (['QUEUED', 'PRINTING', 'PRINTED', 'NEEDS_ATTENTION'].includes(nativeState)) return nativeState;
  return null;
}

function printStateMessage(uiState) {
  if (uiState === 'PRINTING') return 'Impression en cours...';
  if (uiState === 'PRINTED') return 'Imprimé';
  if (uiState === 'NEEDS_ATTENTION') return 'Impression échouée. Réessayez.';
  return '';
}

function isArchitectureUnsuitableResult(result) {
  return result?.errorCode === 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE'
    || result?.code === 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE'
    || result?.architectureStatus === 'UNSUITABLE_BRIDGE_AIDL_V2S';
}

function classifyPrintResult(result) {
  const architectureUnsuitable = isArchitectureUnsuitableResult(result);
  const classification = {
    architectureUnsuitable,
    terminalState: architectureUnsuitable ? 'NEEDS_ATTENTION' : null,
    retryable: architectureUnsuitable ? false : Boolean(result?.retryable ?? true),
    needsAttention: architectureUnsuitable ? true : Boolean(result?.needsAttention),
    operatorActionRequired: architectureUnsuitable ? true : Boolean(result?.operatorActionRequired),
    recommendedAction: architectureUnsuitable
      ? (result?.recommendedAction || 'Use dedicated native print service/app for this device')
      : (result?.recommendedAction || ''),
    reasonCode: architectureUnsuitable ? 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE' : (result?.errorCode || result?.code || ''),
  };
  debugLog('print_result_classification', classification);
  return classification;
}

function applyBlockedPrintState(orderId, result, messagePrefix = 'Impression bloquée') {
  const classification = classifyPrintResult(result);
  if (!classification.architectureUnsuitable) return false;
  const blockedMessage = `${messagePrefix}: ${classification.recommendedAction}`;
  state.printJobsByOrderId[orderId] = {
    orderId,
    jobId: result?.jobId || null,
    nativeState: 'NEEDS_ATTENTION',
    uiState: 'NEEDS_ATTENTION',
    transientUnavailable: false,
    nonRetryable: true,
    blockedReasonCode: classification.reasonCode,
    blockedReasonMessage: classification.recommendedAction,
    message: blockedMessage,
    updatedAt: Date.now(),
  };
  debugLog('print_job_terminal_state_reason', {
    orderId,
    terminalState: 'NEEDS_ATTENTION',
    reasonCode: classification.reasonCode,
    retryable: classification.retryable,
    needsAttention: classification.needsAttention,
    operatorActionRequired: classification.operatorActionRequired,
  });
  debugLog('receiver_ui_print_blocked_reason', {
    orderId,
    reasonCode: classification.reasonCode,
    recommendedAction: classification.recommendedAction,
  });
  state.printerMessage = blockedMessage;
  persistPrintJobTracking();
  return true;
}

function safeReadPrintJobTrackingStorage() {
  try {
    const raw = localStorage.getItem(PRINT_JOB_TRACKING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function persistPrintJobTracking() {
  try {
    const compact = {};
    Object.entries(state.printJobsByOrderId || {}).forEach(([orderId, entry]) => {
      if (!entry?.jobId) return;
      compact[orderId] = {
        orderId,
        jobId: String(entry.jobId),
        nativeState: entry.nativeState || null,
        uiState: entry.uiState || null,
        updatedAt: Number(entry.updatedAt || Date.now()),
        nonRetryable: Boolean(entry.nonRetryable),
        blockedReasonCode: entry.blockedReasonCode || null,
        blockedReasonMessage: entry.blockedReasonMessage || null,
      };
    });
    localStorage.setItem(PRINT_JOB_TRACKING_STORAGE_KEY, JSON.stringify(compact));
  } catch {
    // ignore persistence failures to keep receiver flow resilient
  }
}

function clearPersistedPrintJobTracking() {
  try {
    localStorage.removeItem(PRINT_JOB_TRACKING_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function cleanupStaleTrackedPrintJobs() {
  const now = Date.now();
  let changed = false;
  Object.entries(state.printJobsByOrderId || {}).forEach(([orderId, entry]) => {
    if (!entry) return;
    const updatedAt = Number(entry.updatedAt || 0);
    const isTerminal = PRINT_TERMINAL_STATES.has(String(entry.nativeState || '').toUpperCase());
    if (isTerminal && updatedAt > 0 && now - updatedAt > TERMINAL_JOB_RETENTION_MS) {
      delete state.printJobsByOrderId[orderId];
      delete state.printRetryInFlightByOrderId[orderId];
      changed = true;
    }
  });
  if (changed) {
    persistPrintJobTracking();
  }
}

function hydratePrintJobTrackingFromStorage() {
  const stored = safeReadPrintJobTrackingStorage();
  const hydrated = {};
  Object.entries(stored).forEach(([orderId, entry]) => {
    if (!entry?.jobId) return;
    const nativeState = String(entry.nativeState || 'QUEUED').toUpperCase();
    const uiState = normalizePrintUiState(String(entry.uiState || nativeState).toUpperCase()) || normalizePrintUiState(nativeState) || 'QUEUED';
    hydrated[orderId] = {
      orderId,
      jobId: String(entry.jobId),
      nativeState,
      uiState,
      transientUnavailable: false,
      message: printStateMessage(uiState),
      updatedAt: Number(entry.updatedAt || Date.now()),
      nonRetryable: Boolean(entry.nonRetryable),
      blockedReasonCode: entry.blockedReasonCode || null,
      blockedReasonMessage: entry.blockedReasonMessage || null,
    };
  });
  state.printJobsByOrderId = hydrated;
  cleanupStaleTrackedPrintJobs();
}

async function reconcilePrintJobTrackingWithNative() {
  const tracked = Object.values(state.printJobsByOrderId || {});
  if (!tracked.length) return;

  let changed = false;
  for (const entry of tracked) {
    if (!entry?.jobId || !entry?.orderId) continue;
    const status = await printerAdapter.getPrintStatus(entry.jobId);
    if (status?.ok) {
      debugLog('normalized_native_print_result_json', safeStringify(status));
      const classification = classifyPrintResult(status);
      const nativeState = String(status.state || '').toUpperCase();
      if ((nativeState === 'NEEDS_ATTENTION' && status?.errorCode === 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE') || classification.architectureUnsuitable) {
        state.printJobsByOrderId[entry.orderId] = {
          ...entry,
          nativeState: 'NEEDS_ATTENTION',
          uiState: 'NEEDS_ATTENTION',
          transientUnavailable: false,
          nonRetryable: true,
          blockedReasonCode: 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE',
          blockedReasonMessage: classification.recommendedAction,
          message: `Impression bloquée: ${classification.recommendedAction}`,
          updatedAt: Number(status.updatedAt || Date.now()),
        };
        debugLog('print_job_terminal_state_reason', {
          orderId: entry.orderId,
          terminalState: 'NEEDS_ATTENTION',
          reasonCode: 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE',
        });
      } else {
        const uiState = normalizePrintUiState(nativeState) || entry.uiState || 'QUEUED';
        state.printJobsByOrderId[entry.orderId] = {
          ...entry,
          nativeState: nativeState || entry.nativeState,
          uiState,
          transientUnavailable: false,
          message: printStateMessage(uiState),
          updatedAt: Number(status.updatedAt || Date.now()),
        };
      }
      changed = true;
      continue;
    }

    if (status?.code === 'PRINT_JOB_NOT_FOUND') {
      delete state.printJobsByOrderId[entry.orderId];
      delete state.printRetryInFlightByOrderId[entry.orderId];
      changed = true;
      continue;
    }

    state.printJobsByOrderId[entry.orderId] = {
      ...entry,
      transientUnavailable: true,
      message: entry.message || printStateMessage(entry.uiState),
    };
    changed = true;
  }

  cleanupStaleTrackedPrintJobs();
  if (changed) {
    persistPrintJobTracking();
    render();
  }
}

function ensurePrintJobTracking(orderId, jobId) {
  if (!orderId || !jobId) return;
  const existing = state.printJobsByOrderId[orderId] || {};
  state.printJobsByOrderId[orderId] = {
    orderId,
    jobId,
    nativeState: existing.nativeState || 'QUEUED',
    uiState: existing.uiState || 'QUEUED',
    transientUnavailable: false,
    message: existing.message || printStateMessage('QUEUED'),
    updatedAt: Date.now(),
  };
  persistPrintJobTracking();
}

async function pollPrintStatusesOnce() {
  const tracked = Object.values(state.printJobsByOrderId || {});
  if (!tracked.length) return;

  let changed = false;
  for (const entry of tracked) {
    if (!entry?.jobId) continue;
    if (PRINT_TERMINAL_STATES.has(entry.nativeState)) continue;

    const status = await printerAdapter.getPrintStatus(entry.jobId);
    if (status?.ok) {
      debugLog('normalized_native_print_result_json', safeStringify(status));
      const classification = classifyPrintResult(status);
      const nativeState = String(status.state || '').toUpperCase();
      if ((nativeState === 'NEEDS_ATTENTION' && status?.errorCode === 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE') || classification.architectureUnsuitable) {
        state.printJobsByOrderId[entry.orderId] = {
          ...entry,
          nativeState: 'NEEDS_ATTENTION',
          uiState: 'NEEDS_ATTENTION',
          transientUnavailable: false,
          nonRetryable: true,
          blockedReasonCode: 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE',
          blockedReasonMessage: classification.recommendedAction,
          message: `Impression bloquée: ${classification.recommendedAction}`,
          updatedAt: Number(status.updatedAt || Date.now()),
        };
        debugLog('print_job_terminal_state_reason', {
          orderId: entry.orderId,
          terminalState: 'NEEDS_ATTENTION',
          reasonCode: 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE',
        });
      } else {
        const uiState = normalizePrintUiState(nativeState);
        state.printJobsByOrderId[entry.orderId] = {
          ...entry,
          nativeState: nativeState || entry.nativeState,
          uiState: uiState || entry.uiState,
          transientUnavailable: false,
          message: (uiState && printStateMessage(uiState)) || entry.message || '',
          updatedAt: Number(status.updatedAt || Date.now()),
        };
      }
      changed = true;
      continue;
    }

    state.printJobsByOrderId[entry.orderId] = {
      ...entry,
      transientUnavailable: true,
      message: entry.message || printStateMessage(entry.uiState),
    };
    changed = true;
  }

  if (changed) render();
  if (changed) persistPrintJobTracking();
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
  if (state.printStatusPollId) {
    clearInterval(state.printStatusPollId);
    state.printStatusPollId = null;
  }
}


function formatZurichDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d).replace(',', '');
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
  return formatZurichDateTime(iso);
}

function getReservationActionSuccessLabel(status) {
  return status === 'confirmed' ? 'Réservation confirmée.' : 'Réservation annulée.';
}

async function handleReservationStatusAction(reservationId, status) {
  if (!reservationId || !['confirmed', 'cancelled'].includes(status)) return;

  const currentUi = getReservationUiState(reservationId);
  if (currentUi.pendingAction) return;

  setReservationUiState(reservationId, {
    pendingAction: status,
    confirmCancel: false,
    successMessage: '',
  });
  state.error = '';
  render();

  const res = await changeReservationStatus(reservationId, status);

  if (!res.ok) {
    setReservationUiState(reservationId, { pendingAction: null });
    state.error = res.message;
    if (res.code === 'DEVICE_AUTH_REQUIRED') {
      state.mode = 'not_paired';
      stopReceiverPolling();
    }
    render();
    return;
  }

  const updatedAtIso = new Date().toISOString();
  updateReservationLocally(reservationId, {
    status,
    statusUpdatedAt: updatedAtIso,
    updatedAt: updatedAtIso,
  });
  setReservationUiState(reservationId, {
    pendingAction: null,
    confirmCancel: false,
    successMessage: getReservationActionSuccessLabel(status),
  });
  scheduleReservationSuccessClear(reservationId);
  cleanupReservationUiState();
  render();

  await refreshOperations();
}


function formatOrderType(orderType) {
  return orderType === 'delivery' ? 'Livraison' : 'À emporter';
}

function formatOrderDate(iso) {
  return formatZurichDateTime(iso);
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

  const completedOrdersFromBackend = state.orders.filter((order) => String(order?.status || '').toLowerCase() === 'completed');
  const activeOrders = state.orders.filter((order) => String(order?.status || '').toLowerCase() !== 'completed');
  const completedOrdersFromCache = Object.values(state.completedOrdersById || {});
  const completedById = {};
  for (const order of completedOrdersFromCache) {
    if (order?.id) completedById[order.id] = order;
  }
  for (const order of completedOrdersFromBackend) {
    if (order?.id) completedById[order.id] = order;
  }
  const completedOrders = Object.values(completedById).sort((a, b) => {
    const aTs = new Date(a?.updatedAt || a?.statusUpdatedAt || a?.createdAt || 0).getTime() || 0;
    const bTs = new Date(b?.updatedAt || b?.statusUpdatedAt || b?.createdAt || 0).getTime() || 0;
    return bTs - aTs;
  });

  console.debug(`[sunmi-receiver] active_orders_count count=${activeOrders.length}`);
  console.debug(`[sunmi-receiver] completed_orders_from_backend count=${completedOrdersFromBackend.length}`);
  console.debug(`[sunmi-receiver] completed_orders_local_cache count=${completedOrdersFromCache.length}`);
  console.debug(`[sunmi-receiver] completed_orders_count count=${completedOrders.length}`);
  console.debug(`[sunmi-receiver] completed_section_rendered open=${state.completedSectionOpen} completedCount=${completedOrders.length}`);
  console.debug('[sunmi-receiver] completed_section_dom_mode mode=custom_collapsible');

  const renderOrderCard = (order, options = {}) => {
    const isCompleted = Boolean(options.isCompleted);
    if (isCompleted) {
      console.debug(`[sunmi-receiver] completed_order_rendered orderId=${order?.id || ''}`);
    } else {
      console.debug(`[sunmi-receiver] active_order_rendered orderId=${order?.id || ''}`);
    }

    const displayModel = normalizeOrderForDisplay(order);
    const duplicateFieldCheck = {
      paymentShown: Boolean(displayModel.paymentMethod),
      paymentInNotesExtra: /Paiement:/i.test(displayModel.notesExtra || ''),
      addressShown: Boolean(displayModel.customerAddress),
      addressInNotesExtra: /Adresse:/i.test(displayModel.notesExtra || ''),
    };
    debugLog('ui_duplicate_field_check', {
      orderId: order.id,
      duplicateFieldCheck,
    });

    const sectionRowsHtml = displayModel.displaySections.length
      ? displayModel.displaySections.map((section, idx) => {
        const marginStyle = idx === 0 ? '' : ' style="margin-top:6px;"';
        return `<div class="subtle"${marginStyle}>${escapeHtml(section.line)}</div>`;
      }).join('')
      : '<div class="subtle" style="margin-top:8px;">Détails indisponibles</div>';

    const printJob = state.printJobsByOrderId[order.id];
    const printUiState = printJob?.uiState ? normalizePrintUiState(printJob.uiState) : null;
    const printMessage = printUiState ? printStateMessage(printUiState) : '';

    return `
      <div class="card" data-order-id="${order.id}">
        <div class="topbar">
          <strong>${order.orderNumber || order.id}</strong>
          <span class="status-pill">${formatOrderStatus(order.status)}</span>
        </div>
        <div class="print-state-row">${printUiState === 'NEEDS_ATTENTION' ? `<span class="print-status-pill print-status-pill-${printUiState.toLowerCase()}">${printMessage}</span>` : ''}${printUiState === 'NEEDS_ATTENTION' && printJob?.jobId && !printJob?.nonRetryable ? `<button class="btn-secondary-inline print-retry-btn" data-action="retry-print" data-job-id="${printJob.jobId}" data-id="${order.id}" ${state.printRetryInFlightByOrderId[order.id] ? 'disabled' : ''}>Réessayer</button>` : ''}<button class="btn-secondary-inline print-retry-btn" data-action="reprint-order" data-id="${order.id}" ${state.printDispatchInFlightByOrderId[order.id] ? 'disabled' : ''}>Reimprimer</button></div>
        ${printJob?.nonRetryable ? `<div class="subtle print-status-unavailable">Impression bloquée: ${escapeHtml(printJob.blockedReasonMessage || 'Action opérateur requise.')}</div>` : ''}
        ${printJob?.transientUnavailable ? '<div class="subtle print-status-unavailable">Statut impression temporairement indisponible.</div>' : ''}
        ${sectionRowsHtml}
        ${isCompleted ? '' : `
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
        `}
      </div>
    `;
  };

  const activeOrdersHtml = activeOrders.length === 0
    ? '<div class="card"><p class="subtle">Aucune commande en cours.</p></div>'
    : activeOrders.map((order) => renderOrderCard(order, { isCompleted: false })).join('');

  const completedOrdersHtml = completedOrders.length === 0
    ? '<div class="card"><p class="subtle">Aucune commande terminée.</p></div>'
    : completedOrders.map((order) => renderOrderCard(order, { isCompleted: true })).join('');
  cleanupReservationUiState();
  const upcomingReservations = state.reservations.filter((reservation) => String(reservation?.status || '').toLowerCase() === 'pending');
  const processedReservations = state.reservations.filter((reservation) => String(reservation?.status || '').toLowerCase() !== 'pending');

  const renderReservationCard = (reservation) => {
    const reservationUi = getReservationUiState(reservation.id);
    const isPendingAction = Boolean(reservationUi.pendingAction);
    const isConfirmingCancel = reservationUi.confirmCancel && !isPendingAction && String(reservation.status || '').toLowerCase() === 'pending';
    const actionFeedbackHtml = isPendingAction
      ? `<div class="reservation-feedback reservation-feedback-loading">${reservationUi.pendingAction === 'confirmed' ? 'Confirmation en cours...' : 'Annulation en cours...'}</div>`
      : reservationUi.successMessage
        ? `<div class="reservation-feedback reservation-feedback-success">${escapeHtml(reservationUi.successMessage)}</div>`
        : '';

    const actionAreaHtml = String(reservation.status || '').toLowerCase() !== 'pending'
      ? '<div class="subtle reservation-processed-note">Réservation déjà traitée.</div>'
      : isConfirmingCancel
        ? `
          <div class="reservation-cancel-confirm">
            <div class="reservation-feedback reservation-feedback-warning">Confirmer l'annulation ?</div>
            <div class="btn-row">
              <button class="btn-danger" data-action="reservation_cancel_confirm" data-id="${reservation.id}" ${isPendingAction ? 'disabled' : ''}>Confirmer annulation</button>
              <button class="btn-secondary-inline" data-action="reservation_cancel_abort" data-id="${reservation.id}" ${isPendingAction ? 'disabled' : ''}>Retour</button>
            </div>
          </div>
        `
        : `
          <div class="btn-row">
            <button class="btn-accept" data-action="reservation_confirmed" data-id="${reservation.id}" ${isPendingAction ? 'disabled' : ''}>${reservationUi.pendingAction === 'confirmed' ? 'Confirmation...' : 'Confirmer'}</button>
            <button class="btn-secondary-inline" data-action="reservation_cancel_request" data-id="${reservation.id}" ${isPendingAction ? 'disabled' : ''}>Annuler</button>
          </div>
        `;

    return `
      <div class="card" data-reservation-id="${reservation.id}">
        <div class="topbar">
          <strong>${reservation.customerName || reservation.id}</strong>
          <span class="status-pill">${formatReservationStatus(reservation.status)}</span>
        </div>
        <div class="subtle">${reservation.guestCount || '-'} couverts • ${formatReservationDate(reservation.reservationDate)}</div>
        ${reservation.customerPhone ? `<div class="subtle">Téléphone: ${escapeHtml(reservation.customerPhone)}</div>` : ''}
        ${reservation.customerEmail ? `<div class="subtle">Email: ${escapeHtml(reservation.customerEmail)}</div>` : ''}
        ${reservation.notes ? `<div class="subtle">Note: ${escapeHtml(reservation.notes)}</div>` : ''}
        ${actionFeedbackHtml}
        ${actionAreaHtml}
      </div>
    `;
  };

  const upcomingReservationsHtml = upcomingReservations.length === 0
    ? '<div class="card"><p class="subtle">Aucune réservation en attente.</p></div>'
    : upcomingReservations.map((reservation) => renderReservationCard(reservation)).join('');

  const processedReservationsHtml = processedReservations.length === 0
    ? '<div class="card"><p class="subtle">Aucune réservation traitée.</p></div>'
    : processedReservations.map((reservation) => renderReservationCard(reservation)).join('');

  const attentionOverlay = state.activeAttentionAlert
    ? `
      <div class="attention-overlay attention-overlay-${state.activeAttentionAlert.type}" data-action="dismiss-attention-alert">
        <div class="attention-overlay-card">
          <div class="attention-overlay-title">${escapeHtml(state.activeAttentionAlert.title)}</div>
          <div class="attention-overlay-subtitle">${escapeHtml(state.activeAttentionAlert.subtitle || '')}</div>
          <button class="attention-overlay-dismiss" data-action="dismiss-attention-alert">Fermer</button>
        </div>
      </div>
    `
    : '';

  const settingsPanelHtml = state.isSettingsPanelOpen
    ? `
      <div class="receiver-settings-overlay" data-action="close-settings-panel">
        <div class="receiver-settings-panel" role="dialog" aria-modal="true" aria-label="Paramètres alertes">
          <div class="receiver-settings-header">
            <strong>Paramètres</strong>
            <button class="receiver-settings-close" data-action="close-settings-panel" aria-label="Fermer les paramètres">✕</button>
          </div>
          <p class="subtle">Contrôlez les alertes visuelles et sonores.</p>
          <div class="alert-settings-grid">
            <label class="alert-toggle-row" for="alert-sound-enabled">
              <span>Son global</span>
              <input id="alert-sound-enabled" type="checkbox" data-action="toggle-alert" data-alert-type="sound" ${state.alertSettings.soundEnabled ? 'checked' : ''} />
            </label>
            <label class="alert-toggle-row" for="alert-order-enabled">
              <span>Commandes</span>
              <input id="alert-order-enabled" type="checkbox" data-action="toggle-alert" data-alert-type="order" ${state.alertSettings.orderEnabled ? 'checked' : ''} />
            </label>
            <label class="alert-toggle-row" for="alert-reservation-enabled">
              <span>Réservations</span>
              <input id="alert-reservation-enabled" type="checkbox" data-action="toggle-alert" data-alert-type="reservation" ${state.alertSettings.reservationEnabled ? 'checked' : ''} />
            </label>
            <label class="alert-volume-row" for="alert-volume-input">
              <span>Volume: ${Math.round(state.alertSettings.volume * 100)}%</span>
              <input id="alert-volume-input" type="range" min="0" max="100" step="5" data-action="set-alert-volume" value="${Math.round(state.alertSettings.volume * 100)}" />
            </label>
          </div>
        </div>
      </div>
    `
    : '';

  if (state.isSettingsPanelOpen) {
    debugLog('receiver_settings_rendered', { soundEnabled: state.alertSettings.soundEnabled });
  }
  if (!state.hasLoggedInfoImprimanteRemoval) {
    debugLog('info_imprimante_removed_from_ui', true);
    state.hasLoggedInfoImprimanteRemoval = true;
  }
  if (!state.hasLoggedQueueStatusTextRemoval) {
    debugLog('queue_status_text_removed_from_ui', true);
    state.hasLoggedQueueStatusTextRemoval = true;
  }

  app.innerHTML = `
    <div class="card receiver-header-card">
      <div class="receiver-header-topline">
        <div class="title">Sunmi Receiver</div>
        <button class="receiver-settings-icon-btn" data-action="open-settings-panel" aria-label="Ouvrir les paramètres">⚙️</button>
      </div>
      <p class="subtle">Connecté: ${state.deviceName || 'Périphérique'}</p>
      <button id="unpair-btn" class="btn-secondary">Désassocier cet appareil</button>
    </div>

    <div class="card">
      <div class="title">Commandes en cours</div>
      <p class="subtle">Gestion opérationnelle des commandes</p>
    </div>
    ${activeOrdersHtml}

    <div class="card completed-orders-details">
      <button class="completed-orders-summary" data-action="toggle-completed-section" aria-expanded="${state.completedSectionOpen ? 'true' : 'false'}">
        <span>Terminées (${completedOrders.length})</span>
        <span>${state.completedSectionOpen ? '▾' : '▸'}</span>
      </button>
      ${state.completedSectionOpen
    ? `<div><div class="subtle">Historique des commandes terminées avec réimpression rapide.</div>${completedOrdersHtml}</div>`
    : ''}
    </div>

    <div class="card">
      <div class="title">Réservations</div>
      <p class="subtle">Confirmer rapidement les réservations en attente, avec confirmation légère avant annulation.</p>
    </div>

    <div class="card reservation-section-card">
      <div class="reservation-section-header">
        <div class="reservation-section-title">À venir</div>
        <span class="status-pill">${upcomingReservations.length}</span>
      </div>
      <p class="subtle">Réservations en attente d'action.</p>
    </div>
    ${upcomingReservationsHtml}

    <div class="card reservation-section-card">
      <div class="reservation-section-header">
        <div class="reservation-section-title">Traitées</div>
        <span class="status-pill">${processedReservations.length}</span>
      </div>
      <p class="subtle">Réservations déjà confirmées ou annulées.</p>
    </div>
    ${processedReservationsHtml}

    ${state.error ? `<div class="card"><p class="error">${state.error}</p></div>` : ''}
    ${attentionOverlay}
    ${settingsPanelHtml}
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
    state.printJobsByOrderId = {};
    state.printRetryInFlightByOrderId = {};
    state.printDispatchInFlightByOrderId = {};
    state.lastPrintDispatchAtByOrderId = {};
    state.seenOrderIds = new Set();
    state.seenReservationIds = new Set();
    state.hasHydratedOperationalBaseline = false;
    clearAttentionAlert();
    clearCompletedOrdersCache();
    clearPersistedPrintJobTracking();
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
    const nextOrders = result.orders || [];
    const nextReservations = result.reservations || [];
    const backendCompletedOrders = nextOrders.filter((order) => String(order?.status || '').toLowerCase() === 'completed');
    const activeOrderIds = new Set(nextOrders.map((order) => order?.id).filter(Boolean));
    for (const activeOrderId of activeOrderIds) {
      if (state.completedOrdersById[activeOrderId]) {
        delete state.completedOrdersById[activeOrderId];
      }
    }
    for (const completedOrder of backendCompletedOrders) {
      if (!completedOrder?.id) continue;
      state.completedOrdersById[completedOrder.id] = {
        ...state.completedOrdersById[completedOrder.id],
        ...completedOrder,
      };
    }
    persistCompletedOrdersCache();
    console.debug(`[sunmi-receiver] completed_orders_from_backend count=${backendCompletedOrders.length}`);
    console.debug(`[sunmi-receiver] completed_orders_local_cache count=${Object.keys(state.completedOrdersById).length}`);
    detectAndTriggerNewEventAlerts(nextOrders, nextReservations);
    state.orders = nextOrders;
    state.reservations = nextReservations;
    cleanupReservationUiState(nextReservations);
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
    state.printJobsByOrderId = {};
    state.printRetryInFlightByOrderId = {};
    state.printDispatchInFlightByOrderId = {};
    state.lastPrintDispatchAtByOrderId = {};
    state.seenOrderIds = new Set();
    state.seenReservationIds = new Set();
    state.hasHydratedOperationalBaseline = false;
    clearCompletedOrdersCache();
    clearAttentionAlert();
    clearPersistedPrintJobTracking();
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

function startPrintStatusPolling() {
  if (state.printStatusPollId) {
    clearInterval(state.printStatusPollId);
  }
  state.printStatusPollId = setInterval(() => {
    if (state.mode !== 'receiver_loaded') return;
    pollPrintStatusesOnce();
  }, PRINT_STATUS_POLL_INTERVAL_MS);
}

function startReceiverPolling() {
  stopReceiverPolling();
  debugLog('receiver_poll_start', { intervalMs: POLL_INTERVAL_MS });
  state.receiverPollId = setInterval(() => {
    if (state.mode !== 'receiver_loaded') return;
    refreshOperations();
  }, POLL_INTERVAL_MS);
  startPrintStatusPolling();
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
  clearAttentionAlert();
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

async function printOrderTicket(order, options = {}) {
  const isReprint = Boolean(options?.reprint);
  const orderId = order?.id || order?.orderId || '';
  const now = Date.now();

  if (!isReprint && orderId) {
    if (state.printDispatchInFlightByOrderId[orderId]) {
      debugLog('print_dispatch_suppressed_inflight', { orderId });
      state.printerMessage = `Impression déjà en cours pour ${order.orderNumber || orderId}.`;
      render();
      return;
    }
    const lastDispatchedAt = Number(state.lastPrintDispatchAtByOrderId[orderId] || 0);
    if (lastDispatchedAt > 0 && now - lastDispatchedAt < PRINT_DISPATCH_DEDUP_MS) {
      debugLog('print_dispatch_suppressed_dedup', { orderId, dedupMs: PRINT_DISPATCH_DEDUP_MS });
      state.printerMessage = `Impression déjà envoyée récemment pour ${order.orderNumber || orderId}.`;
      render();
      return;
    }
  }

  if (orderId) {
    state.printDispatchInFlightByOrderId[orderId] = true;
  }

  const displayModel = normalizeOrderForDisplay(order);
  const rawPrintJob = toPrintJob(order, {
    name: 'À la Louche',
  });
  const strategyApplied = applyOutputStrategyOverride(rawPrintJob);
  const printJob = strategyApplied.printJob;
  const outputStrategy = strategyApplied.outputStrategy;

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

  const forcedStrategyMeta = resolveForcedOutputStrategy();
  const debugOutputStrategy = outputStrategy || 'default(text_single_block_center_rawfeed)';
  debugLog('web_to_native_print_strategy_json', JSON.stringify({
    orderId: order.id,
    orderNumber: printJob.orderNumber || order.orderNumber || order.id || null,
    outputStrategy: debugOutputStrategy,
    actualPayloadOutputStrategy: outputStrategy || '',
    forcedBy: forcedStrategyMeta.value ? 'override' : 'payload_or_default',
    forcedGlobalSource: forcedStrategyMeta.source,
    usedSyntheticDefaultForDebugOnly: !outputStrategy,
  }));

  debugLog('print_job_dispatch', {
    fromFunction: isReprint ? 'reprintOrderTicket' : 'printAcceptedOrder',
    orderId: printJob.orderId,
    orderNumber: printJob.orderNumber,
    lineCount: Array.isArray(printJob.lines) ? printJob.lines.length : 0,
    hasTotals: Boolean(printJob.totals && printJob.totals.total != null),
    displayModelItemCount: Array.isArray(displayModel.items) ? displayModel.items.length : 0,
    printItemsSource: printJob.itemsSource || 'unknown',
    outputStrategy: outputStrategy || null,
  });
  debugLog('ui_order_normalized_for_display', safeStringify({
    orderId: order.id,
    itemsSource: displayModel.itemsSource,
    itemCount: displayModel.items.length,
    items: displayModel.items,
    totals: displayModel.totals || null,
    notesExtra: displayModel.notesExtra || null,
  }));
  debugLog('ui_vs_print_item_parity', safeStringify({
    uiItemCount: displayModel.items.length,
    printLineCount: Array.isArray(printJob.lines) ? printJob.lines.length : 0,
    uiItemNames: displayModel.items.map((line) => line.name),
    printItemNames: Array.isArray(printJob.lines) ? printJob.lines.map((line) => line.name) : [],
    uiItemPrices: displayModel.items.map((line) => line.totalPrice ?? line.unitPrice ?? null),
    printItemPrices: Array.isArray(printJob.lines) ? printJob.lines.map((line) => line.totalPrice ?? line.unitPrice ?? null) : [],
  }));
  debugLog('print_job_dispatch_json', safeStringify(printJob));
  debugLog('print_payload_source_marker', safeStringify({
    printed_from_display_model: Boolean(printJob.printed_from_display_model),
    hasDisplayModel: Boolean(printJob.displayModel),
    displayModelKeys: printJob.displayModel ? Object.keys(printJob.displayModel) : [],
  }));

  try {
    const res = await printerAdapter.printReceipt(printJob);
    debugLog('print_job_result', res);
    debugLog('print_job_result_json', safeStringify(res));
    debugLog('normalized_native_print_result_json', safeStringify(res));

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

    if (applyBlockedPrintState(order.id, res)) {
      // blocked non-retryable architecture classification
    } else if (res.ok && res.jobId) {
      ensurePrintJobTracking(order.id, res.jobId);
      state.printerMessage = isReprint
        ? `Commande ${order.orderNumber || order.id}: réimpression mise en file d'impression.`
        : `Commande ${order.orderNumber || order.id}: ticket en file d'impression.`;
      pollPrintStatusesOnce();
    } else if (res.ok) {
      state.printerMessage = isReprint
        ? `Réimpression envoyée pour ${order.orderNumber || order.id}.`
        : `Impression envoyée pour ${order.orderNumber || order.id}.`;
    } else {
      state.printerMessage = isReprint
        ? `Réimpression indisponible: ${res.code || 'UNKNOWN'} - ${res.message || ''}`
        : `Commande acceptée, mais impression indisponible: ${res.code || 'UNKNOWN'} - ${res.message || ''}`;
    }

    if (res?.ok && orderId) {
      state.lastPrintDispatchAtByOrderId[orderId] = Date.now();
    }
    render();
  } finally {
    if (orderId) {
      state.printDispatchInFlightByOrderId[orderId] = false;
    }
  }
}

app.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === 'pairing-code-input') {
    state.pairingCode = target.value.toUpperCase();
    return;
  }

  if (target.dataset.action === 'set-alert-volume') {
    const nextVolume = Math.min(1, Math.max(0, Number(target.value) / 100));
    state.alertSettings.volume = nextVolume;
    persistAlertSettings();
    debugLog('alert_settings_updated', state.alertSettings);
    render();
  }
});

app.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const completedToggle = target.closest('[data-action="toggle-completed-section"]');
  if (completedToggle instanceof HTMLElement) {
    const nextOpen = !state.completedSectionOpen;
    console.debug(`[sunmi-receiver] completed_section_toggle_clicked nextOpen=${nextOpen}`);
    state.completedSectionOpen = nextOpen;
    persistCompletedSectionOpenState();
    render();
    return;
  }

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
    state.printJobsByOrderId = {};
    state.printRetryInFlightByOrderId = {};
    state.printDispatchInFlightByOrderId = {};
    state.lastPrintDispatchAtByOrderId = {};
    state.seenOrderIds = new Set();
    state.seenReservationIds = new Set();
    state.hasHydratedOperationalBaseline = false;
    clearAttentionAlert();
    clearCompletedOrdersCache();
    clearPersistedPrintJobTracking();
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

  if (target.dataset.action === 'dismiss-attention-alert') {
    clearAttentionAlert();
    render();
    return;
  }

  if (target.dataset.action === 'toggle-alert' && target instanceof HTMLInputElement) {
    const type = target.dataset.alertType;
    if (type === 'sound') {
      state.alertSettings.soundEnabled = target.checked;
    } else if (type === 'order') {
      state.alertSettings.orderEnabled = target.checked;
    } else if (type === 'reservation') {
      state.alertSettings.reservationEnabled = target.checked;
    } else {
      return;
    }
    persistAlertSettings();
    debugLog('alert_settings_updated', state.alertSettings);
    render();
    return;
  }

  if (target.dataset.action === 'open-settings-panel') {
    state.isSettingsPanelOpen = true;
    debugLog('receiver_settings_opened');
    render();
    return;
  }

  if (target.dataset.action === 'close-settings-panel') {
    state.isSettingsPanelOpen = false;
    debugLog('receiver_settings_closed');
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

  if (target.dataset.action === 'retry-print' && target.dataset.jobId && target.dataset.id) {
    const orderIdForRetry = target.dataset.id;
    const tracked = state.printJobsByOrderId[orderIdForRetry];
    if (tracked?.nonRetryable || tracked?.blockedReasonCode === 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE') {
      debugLog('retry_suppressed_nonretryable_architecture', {
        orderId: orderIdForRetry,
        jobId: target.dataset.jobId,
        reasonCode: tracked?.blockedReasonCode || 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE',
      });
      state.printerMessage = `Réessai désactivé: ${tracked?.blockedReasonMessage || 'Use dedicated native print service/app for this device'}`;
      render();
      return;
    }
    state.printRetryInFlightByOrderId[orderIdForRetry] = true;
    render();

    try {
      const retryRes = await printerAdapter.retryPrint(target.dataset.jobId);
      if (retryRes?.ok) {
        const existing = state.printJobsByOrderId[orderIdForRetry] || {};
        state.printJobsByOrderId[orderIdForRetry] = {
          ...existing,
          orderId: orderIdForRetry,
          jobId: target.dataset.jobId,
          nativeState: 'QUEUED',
          uiState: 'QUEUED',
          transientUnavailable: false,
          message: printStateMessage('QUEUED'),
          updatedAt: Date.now(),
        };
        persistPrintJobTracking();
        state.printerMessage = "Ticket remis en file d'impression.";
      } else if (applyBlockedPrintState(orderIdForRetry, retryRes, 'Réessai bloqué')) {
        debugLog('retry_suppressed_nonretryable_architecture', {
          orderId: orderIdForRetry,
          jobId: target.dataset.jobId,
          reasonCode: retryRes?.errorCode || retryRes?.code || 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE',
        });
      } else {
        state.printerMessage = `Impossible de relancer l'impression: ${retryRes?.message || retryRes?.code || 'UNKNOWN'}`;
      }
      pollPrintStatusesOnce();
    } finally {
      state.printRetryInFlightByOrderId[orderIdForRetry] = false;
      render();
    }
    return;
  }


  if (target.dataset.action === 'reprint-order' && target.dataset.id) {
    console.debug(`[sunmi-receiver] reprint_button_clicked orderId=${target.dataset.id}`);
    const orderForReprint = state.orders.find((item) => item.id === target.dataset.id);
    if (!orderForReprint) {
      state.printerMessage = 'Commande introuvable pour la réimpression.';
      render();
      return;
    }

    console.debug(`[sunmi-receiver] reprint_dispatch_started orderId=${orderForReprint.id}`);
    await printOrderTicket(orderForReprint, { reprint: true });
    return;
  }

  const reservationAction = target.dataset.action;
  const reservationId = target.dataset.id;
  if (reservationAction === 'reservation_cancel_request' && reservationId) {
    setReservationUiState(reservationId, { confirmCancel: true, successMessage: '' });
    state.error = '';
    render();
    return;
  }

  if (reservationAction === 'reservation_cancel_abort' && reservationId) {
    setReservationUiState(reservationId, { confirmCancel: false });
    state.error = '';
    render();
    return;
  }

  if ((reservationAction === 'reservation_confirmed' || reservationAction === 'reservation_cancel_confirm') && reservationId) {
    const status = reservationAction === 'reservation_confirmed' ? 'confirmed' : 'cancelled';
    await handleReservationStatusAction(reservationId, status);
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
  if (status === 'completed') {
    console.debug(`[sunmi-receiver] order_marked_completed_clicked orderId=${orderId}`);
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

  if (status === 'completed') {
    const sourceOrder = state.orders.find((item) => item.id === orderId) || {};
    const completedSnapshot = {
      ...sourceOrder,
      ...(res.order || {}),
      id: orderId,
      status: 'completed',
      statusUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.completedOrdersById[orderId] = completedSnapshot;
    persistCompletedOrdersCache();
    console.debug(`[sunmi-receiver] order_marked_completed_success orderId=${orderId} status=${completedSnapshot.status}`);
  }

  if (status === 'accepted') {
    const acceptedOrder = state.orders.find((item) => item.id === orderId);
    const liveAcceptedOrder = res.order || acceptedOrder;
    if (liveAcceptedOrder) {
      await printOrderTicket({
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
  loadAlertSettings();
  loadCompletedOrdersCache();
  loadCompletedSectionOpenState();
  hydratePrintJobTrackingFromStorage();
  render();

  if (!tokenStore.get()) {
    state.mode = 'not_paired';
    render();
    return;
  }

  const validated = await validateDeviceOnceAndEnterReceiver();
  if (!validated) return;

  await refreshOperations();
  await reconcilePrintJobTrackingWithNative();
  if (state.mode === 'receiver_loaded') {
    startReceiverPolling();
  }
}

boot();
