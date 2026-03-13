package com.alalouche.sunmibridge.transport

class TransportSelector(
    private val aidlTransport: PrinterTransport,
    private val sunmiSdkTransport: PrinterTransport,
) {
    data class Selection(
        val mode: String,
        val transport: PrinterTransport,
    )

    fun select(mode: String?): Selection {
        val normalizedMode = mode?.trim()?.lowercase().orEmpty()
        return when (normalizedMode) {
            MODE_SUNMI_SDK, MODE_SUNMI_SDK_ALIAS -> Selection(MODE_SUNMI_SDK, sunmiSdkTransport)
            MODE_AIDL, "" -> Selection(MODE_AIDL, aidlTransport)
            else -> Selection(MODE_AIDL, aidlTransport)
        }
    }

    companion object {
        const val MODE_AIDL = "aidl"
        const val MODE_SUNMI_SDK = "sunmi_sdk"
        const val MODE_SUNMI_SDK_ALIAS = "sdk"
    }
}
