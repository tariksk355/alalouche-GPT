package com.alalouche.sunmibridge.transport

class TransportSelector(
    private val aidlTransport: PrinterTransport,
) {
    fun select(mode: String?): PrinterTransport {
        return when (mode?.lowercase()) {
            "aidl", null, "" -> aidlTransport
            else -> aidlTransport
        }
    }
}
