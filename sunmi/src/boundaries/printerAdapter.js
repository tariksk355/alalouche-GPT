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
 */

/**
 * @typedef {Object} PrinterAdapter
 * @property {() => Promise<boolean>} isAvailable
 * @property {(printJob: import('./printJobContract.js').PrintJob) => Promise<PrinterResult>} printReceipt
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
  return {
    async isAvailable() {
      const res = safeParseBridgeResponse(nativeBridge.isAvailable?.('{}'), {
        ok: false,
        available: false,
      });
      return Boolean(res.available);
    },

    async printReceipt(printJob) {
      const raw = nativeBridge.printReceipt?.(JSON.stringify(printJob));
      return safeParseBridgeResponse(raw, {
        ok: false,
        code: 'BRIDGE_BAD_RESPONSE',
        message: 'Invalid native bridge response for printReceipt.',
      });
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
      return {
        ok: false,
        code: 'PRINTER_UNAVAILABLE',
        message: 'Direct Sunmi printer access is unavailable in pure web mode.',
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
    && typeof nativeBridge.printReceipt === 'function'
    && typeof nativeBridge.openCashDrawer === 'function';

  if (hasBridge) {
    return createNativeBridgePrinterAdapter(nativeBridge);
  }

  return createUnavailableWebPrinterAdapter();
}
