package com.alalouche.sunmibridge.transport

import org.json.JSONObject

class AidlTransport(
    private val printer: (ReceiptRenderContext) -> JSONObject,
) : PrinterTransport {
    override fun printReceipt(context: ReceiptRenderContext): TransportResult {
        return TransportResult(printer(context))
    }
}
