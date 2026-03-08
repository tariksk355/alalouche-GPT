/**
 * Printer adapter contract for the Sunmi web shell.
 *
 * IMPORTANT:
 * - This file defines interface + fallback behavior only.
 * - It does NOT provide direct Sunmi printer access from browser JS.
 * - Real thermal printing on Sunmi requires a native Android bridge + Sunmi SDK.
 */

/**
 * @typedef {Object} PrinterInfo
 * @property {'web'|'native_bridge'} mode
 * @property {boolean} available
 * @property {string=} model
 * @property {string=} firmwareVersion
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

/**
 * Pure-web fallback adapter.
 *
 * This adapter intentionally reports printer unavailable because browser JS
 * cannot directly call Sunmi thermal printer hardware without native bridge.
 *
 * @returns {PrinterAdapter}
 */
export function createUnavailableWebPrinterAdapter() {
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
