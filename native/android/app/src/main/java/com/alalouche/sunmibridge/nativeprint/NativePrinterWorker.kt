package com.alalouche.sunmibridge.nativeprint

import android.content.Context

interface NativePrinterWorker {
    fun dispatch(job: NativePrintJobEntity): NativeDispatchReport
}

class SunmiNativePrinterWorker(
    private val context: Context,
) : NativePrinterWorker {
    override fun dispatch(job: NativePrintJobEntity): NativeDispatchReport {
        // Scaffold-only worker.
        // Final implementation will own Sunmi service binding/lifecycle and deterministic low-level sequencing.
        return NativeDispatchReport(
            acceptedByNative = false,
            dispatchStarted = false,
            dispatchCompleted = false,
            physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
            retryable = false,
            errorCode = "NATIVE_PRINT_SERVICE_NOT_IMPLEMENTED",
            errorMessage = "Native print worker scaffold is present but dispatch is not implemented yet.",
        )
    }
}
