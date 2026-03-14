import { debugLog } from '../debug.js';

/**
 * Printer adapter contract for Sunmi web shell.
 *
 * IMPORTANT:
 * - Browser JS alone cannot directly control Sunmi thermal printer hardware.
 * - Real hardware access requires a native Android WebView bridge + Sunmi SDK binding.
 */

/**
 * @typedef {Object} PrinterInfo
 * @property {'web'|'native_bridge'} mode
 * @property {boolean} available
 * @property {string=} model
 * @property {string=} firmwareVersion
 * @property {boolean=} sdkDetected
 * @property {string=} message
 */

/**
 * @typedef {Object} PrinterResult
 * @property {boolean} ok
 * @property {string=} code
 * @property {string=} message
 * @property {string=} errorCode
 * @property {boolean=} acceptedByBridge
 * @property {boolean=} nativeDispatchAttempted
 * @property {boolean=} acceptanceOnly
 * @property {boolean=} physicalPrintUnverified
 * @property {string=} architectureStatus
 * @property {boolean=} retryable
 * @property {boolean=} needsAttention
 * @property {boolean=} operatorActionRequired
 * @property {string=} recommendedAction
 */


function mapReceiverPrintContract(result) {
  const res = (result && typeof result === 'object') ? { ...result } : {};
  const architectureUnsuitable =
    res.errorCode === 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE'
    || res.code === 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE'
    || res.architectureStatus === 'UNSUITABLE_BRIDGE_AIDL_V2S';

  if (res.commandId && !res.jobId) {
    res.jobId = res.commandId;
  }

  if (architectureUnsuitable) {
    res.ok = false;
    res.errorCode = 'V2S_BRIDGE_ARCHITECTURE_UNSUITABLE';
    res.retryable = false;
    res.needsAttention = true;
    res.operatorActionRequired = true;
    res.recommendedAction = 'Use dedicated native print service/app for this device';
    if (typeof res.acceptedByBridge !== 'boolean') res.acceptedByBridge = true;
    if (typeof res.nativeDispatchAttempted !== 'boolean') res.nativeDispatchAttempted = false;
    if (typeof res.acceptanceOnly !== 'boolean') res.acceptanceOnly = true;
    if (typeof res.physicalPrintUnverified !== 'boolean') res.physicalPrintUnverified = true;
  }

  return res;
}

/**
 * @typedef {Object} PrinterAdapter
 * @property {() => Promise<boolean>} isAvailable
 * @property {(printJob: import('./printJobContract.js').PrintJob) => Promise<PrinterResult>} printReceipt
 * @property {(jobId: string) => Promise<PrinterResult>} getPrintStatus
 * @property {(jobId: string) => Promise<PrinterResult>} retryPrint
 * @property {() => Promise<PrinterResult>} openCashDrawer
 * @property {() => Promise<PrinterInfo>} getPrinterInfo
 */

function safeParseBridgeResponse(raw, fallback) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // ignore
  }
  return fallback;
}

function createNativeBridgePrinterAdapter(nativeBridge) {
  function resolvePrintMethod() {
    if (typeof nativeBridge.submitPrintCommand === 'function') return 'submitPrintCommand';
    if (typeof nativeBridge.printReceipt === 'function') return 'printReceipt';
    if (typeof nativeBridge.printOrder === 'function') return 'printOrder';
    if (typeof nativeBridge.print === 'function') return 'print';
    return null;
  }

  function invokePrint(printJob) {
    const outputStrategy = typeof printJob?.formattingHints?.outputStrategy === 'string' ? printJob.formattingHints.outputStrategy : '';
    const nativePrintStrategy = typeof printJob?.formattingHints?.nativePrintStrategy === 'string' ? printJob.formattingHints.nativePrintStrategy : '';
    const forceOutputStrategy = typeof printJob?.forceOutputStrategy === 'string' ? printJob.forceOutputStrategy : '';
    const outputStrategyTopLevel = typeof printJob?.outputStrategy === 'string' ? printJob.outputStrategy : '';
    debugLog('js_bridge_print_strategy_json', JSON.stringify({
      outputStrategy: outputStrategy || 'default(text_single_block_center_rawfeed)',
      outputStrategyTopLevel: outputStrategyTopLevel || '',
      nativePrintStrategy: nativePrintStrategy || '',
      forceOutputStrategy: forceOutputStrategy || '',
      hasFormattingHints: Boolean(printJob?.formattingHints),
      printJobId: printJob?.printJobId || null,
      orderId: printJob?.orderId || null,
    }));

    const payload = JSON.stringify(printJob);
    const methodName = resolvePrintMethod();

    if (methodName === 'submitPrintCommand') {
      debugLog('submit_print_command_payload_trace', {
        forceOutputStrategy: forceOutputStrategy || '',
        outputStrategyTopLevel: outputStrategyTopLevel || '',
        formattingHintsOutputStrategy: outputStrategy || '',
        formattingHintsNativePrintStrategy: nativePrintStrategy || '',
        payload: printJob,
      });
    }

    if (!methodName) {
      return {
        ok: false,
        code: 'BRIDGE_METHOD_MISSING',
        message: 'No native print method found on bridge.',
      };
    }

    const raw = nativeBridge[methodName]?.(payload);
    const parsed = safeParseBridgeResponse(raw, null);
    if (parsed && typeof parsed === 'object') {
      return mapReceiverPrintContract({
        ...parsed,
        bridgeMethod: methodName,
      });
    }

    return mapReceiverPrintContract({
      ok: false,
      code: 'BRIDGE_BAD_RESPONSE',
      message: `Invalid native bridge response for ${methodName}.`,
      bridgeMethod: methodName,
    });
  }

  function invokeGetPrintStatus(jobId) {
    const statusMethod = typeof nativeBridge.getPrintCommandStatus === 'function'
      ? 'getPrintCommandStatus'
      : typeof nativeBridge.getPrintStatus === 'function'
        ? 'getPrintStatus'
        : null;

    if (!statusMethod) {
      return {
        ok: false,
        code: 'BRIDGE_METHOD_MISSING',
        message: 'Print status method unavailable on native bridge.',
      };
    }

    const statusPayload = statusMethod === 'getPrintCommandStatus' ? { commandId: jobId } : { jobId };
    const raw = nativeBridge[statusMethod]?.(JSON.stringify(statusPayload));
    const parsed = safeParseBridgeResponse(raw, null);
    if (parsed && typeof parsed === 'object') {
      return mapReceiverPrintContract(parsed);
    }

    return mapReceiverPrintContract({
      ok: false,
      code: 'BRIDGE_BAD_RESPONSE',
      message: 'Invalid native bridge response for getPrintStatus.',
    });
  }

  function invokeRetryPrint(jobId) {
    if (!jobId) {
      return {
        ok: false,
        code: 'INVALID_JOB_ID',
        message: 'jobId is required for retryPrint.',
      };
    }

    const retryMethod = typeof nativeBridge.retryPrintCommand === 'function'
      ? 'retryPrintCommand'
      : typeof nativeBridge.retryPrint === 'function'
        ? 'retryPrint'
        : null;

    if (!retryMethod) {
      return {
        ok: false,
        code: 'BRIDGE_METHOD_MISSING',
        message: 'Retry print method unavailable on native bridge.',
      };
    }

    const retryPayload = retryMethod === 'retryPrintCommand' ? { commandId: jobId } : { jobId };
    const raw = nativeBridge[retryMethod]?.(JSON.stringify(retryPayload));
    const parsed = safeParseBridgeResponse(raw, null);
    if (parsed && typeof parsed === 'object') {
      return mapReceiverPrintContract(parsed);
    }

    return mapReceiverPrintContract({
      ok: false,
      code: 'BRIDGE_BAD_RESPONSE',
      message: 'Invalid native bridge response for retryPrint.',
    });
  }

  return {
    async isAvailable() {
      const res = safeParseBridgeResponse(nativeBridge.isAvailable?.('{}'), {
        ok: false,
        available: false,
      });
      return Boolean(res.available);
    },

    async printReceipt(printJob) {
      return invokePrint(printJob);
    },

    async getPrintStatus(jobId) {
      return invokeGetPrintStatus(jobId);
    },

    async retryPrint(jobId) {
      return invokeRetryPrint(jobId);
    },

    async openCashDrawer() {
      const raw = nativeBridge.openCashDrawer?.('{}');
      return safeParseBridgeResponse(raw, {
        ok: false,
        code: 'BRIDGE_BAD_RESPONSE',
        message: 'Invalid native bridge response for openCashDrawer.',
      });
    },

    async getPrinterInfo() {
      const raw = nativeBridge.getPrinterInfo?.('{}');
      return safeParseBridgeResponse(raw, {
        mode: 'native_bridge',
        available: false,
        message: 'Invalid native bridge response for getPrinterInfo.',
      });
    },
  };
}

function createUnavailableWebPrinterAdapter() {
  return {
    async isAvailable() {
      return false;
    },

    async printReceipt() {
      return mapReceiverPrintContract({
        ok: false,
        code: 'PRINTER_UNAVAILABLE',
        message: 'Direct Sunmi printer access is unavailable in pure web mode.',
      });
    },

    async getPrintStatus() {
      return {
        ok: false,
        code: 'PRINTER_STATUS_UNAVAILABLE',
        message: 'Statut impression indisponible sans bridge natif.',
      };
    },

    async retryPrint() {
      return {
        ok: false,
        code: 'PRINTER_RETRY_UNAVAILABLE',
        message: 'Réessai impression indisponible sans bridge natif.',
      };
    },

    async openCashDrawer() {
      return {
        ok: false,
        code: 'CASH_DRAWER_UNAVAILABLE',
        message: 'Cash drawer control requires native bridge support.',
      };
    },

    async getPrinterInfo() {
      return {
        mode: 'web',
        available: false,
        message: 'No native printer bridge detected.',
      };
    },
  };
}

/**
 * Create printer adapter for current runtime.
 * - Uses native bridge when available.
 * - Falls back to unavailable web adapter otherwise.
 *
 * @returns {PrinterAdapter}
 */
export function createPrinterAdapter() {
  const nativeBridge = window.SunmiBridge;
  const hasBridge = nativeBridge
    && typeof nativeBridge.isAvailable === 'function'
    && typeof nativeBridge.getPrinterInfo === 'function'
    && (typeof nativeBridge.printReceipt === 'function'
      || typeof nativeBridge.printOrder === 'function'
      || typeof nativeBridge.print === 'function')
    && typeof nativeBridge.openCashDrawer === 'function';

  if (hasBridge) {
    return createNativeBridgePrinterAdapter(nativeBridge);
  }

  return createUnavailableWebPrinterAdapter();
}
