package com.alalouche.sunmibridge.transport

interface PrinterTransport {
    fun printReceipt(context: ReceiptRenderContext): TransportResult
}
