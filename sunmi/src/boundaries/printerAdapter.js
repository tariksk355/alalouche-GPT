// Placeholder boundary only.
// Printer integration is intentionally NOT implemented in this step.
// Future adapters:
// - WebPrintAdapter (window.print fallback)
// - SunmiNativePrinterAdapter (Android bridge/Sunmi SDK)

export function createPrinterAdapter() {
  return {
    printReceipt() {
      throw new Error('PRINTER_NOT_IMPLEMENTED');
    },
  };
}
