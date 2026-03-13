package com.alalouche.sunmibridge.transport

import org.json.JSONObject

/**
 * Safe scaffold for future Sunmi PrinterLibrary integration.
 *
 * TODO(step-2b): replace this stub with real SDK implementation once the
 * official Sunmi PrinterLibrary artifact (AAR) is available in this repo.
 */
class SunmiSdkTransport : PrinterTransport {
    override fun printReceipt(context: ReceiptRenderContext): TransportResult {
        val response = JSONObject().apply {
            put("ok", false)
            put("code", "SUNMI_SDK_NOT_READY")
            put("message", "Sunmi SDK transport selected, but the SDK artifact is not installed in this build.")
            put("details", "Add the official Sunmi PrinterLibrary AAR and implement SDK calls in SunmiSdkTransport.")
            put("transport", TransportSelector.MODE_SUNMI_SDK)
            put("sdkInstalled", false)
            put("payloadLength", context.printJobJson?.length ?: 0)
        }
        return TransportResult(response)
    }
}
