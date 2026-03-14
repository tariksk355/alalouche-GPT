package com.alalouche.sunmibridge.nativeprint

import android.content.Context
import android.os.RemoteException
import android.util.Log
import woyou.aidlservice.jiuiv5.ICallback

interface NativePrinterWorker {
    fun dispatch(job: NativePrintJobEntity): NativeDispatchReport
}

class SunmiNativePrinterWorker(
    context: Context,
) : NativePrinterWorker {

    private val connector = NativePrinterServiceConnector(context)

    override fun dispatch(job: NativePrintJobEntity): NativeDispatchReport {
        val session = connector.connect(job.commandId, job.orderId, job.sourceJobId)
        val selectedFamily = session.selectedFamily?.familyName
        if (session.service == null) {
            val code = session.failureCode ?: "NATIVE_PRINT_SERVICE_INTERFACE_UNAVAILABLE"
            val retryable = code != "NATIVE_PRINT_SERVICE_FAMILY_NOT_FOUND"
            return NativeDispatchReport(
                acceptedByNative = false,
                dispatchStarted = false,
                dispatchCompleted = false,
                dispatchAdapterEntered = false,
                nativeDispatchAttempted = false,
                lowLevelSequenceStarted = false,
                lowLevelSequenceCompleted = false,
                selectedServiceFamily = selectedFamily,
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = retryable,
                errorCode = code,
                errorMessage = session.failureReason ?: "service_unavailable",
            )
        }

        val callbackErrors = mutableListOf<String>()
        val callback = object : ICallback.Stub() {
            override fun onRunResult(isSuccess: Boolean) {
                if (!isSuccess) callbackErrors += "onRunResult:false"
            }

            override fun onReturnString(result: String?) = Unit

            override fun onRaiseException(code: Int, msg: String?) {
                callbackErrors += "onRaiseException:$code:${msg ?: "unknown"}"
            }
        }

        return try {
            Log.i(TAG, "native_print_dispatch_start commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""}")
            Log.i(TAG, "native_print_dispatch_adapter_enter commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""}")
            Log.i(TAG, "native_print_dispatch_adapter_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} selectedFamily=${selectedFamily ?: ""}")
            val marker = buildDispatchMarker(job)
            Log.i(TAG, "native_print_low_level_sequence_start commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""}")
            session.service.setAlignment(0, callback)
            session.service.printText(marker, callback)
            val feed = byteArrayOf(0x1B, 0x64, 3)
            session.service.sendRAWData(feed, callback)
            Log.i(TAG, "native_print_low_level_sequence_end commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""}")

            val error = callbackErrors.firstOrNull()
            if (error != null) {
                NativeDispatchReport(
                    acceptedByNative = false,
                    dispatchStarted = true,
                    dispatchCompleted = true,
                    dispatchAdapterEntered = true,
                    nativeDispatchAttempted = true,
                    lowLevelSequenceStarted = true,
                    lowLevelSequenceCompleted = true,
                    selectedServiceFamily = selectedFamily,
                    physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                    retryable = true,
                    errorCode = "NATIVE_PRINT_CALLBACK_ERROR",
                    errorMessage = error,
                )
            } else {
                NativeDispatchReport(
                    acceptedByNative = true,
                    dispatchStarted = true,
                    dispatchCompleted = true,
                    dispatchAdapterEntered = true,
                    nativeDispatchAttempted = true,
                    lowLevelSequenceStarted = true,
                    lowLevelSequenceCompleted = true,
                    selectedServiceFamily = selectedFamily,
                    physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                    retryable = false,
                    errorCode = null,
                    errorMessage = null,
                )
            }
        } catch (e: RemoteException) {
            Log.e(TAG, "native_print_low_level_sequence_error commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} reason=${e.message ?: "remote_exception"}")
            NativeDispatchReport(
                acceptedByNative = false,
                dispatchStarted = true,
                dispatchCompleted = false,
                dispatchAdapterEntered = true,
                nativeDispatchAttempted = true,
                lowLevelSequenceStarted = true,
                lowLevelSequenceCompleted = false,
                selectedServiceFamily = selectedFamily,
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = true,
                errorCode = "NATIVE_PRINT_SERVICE_BIND_FAILED",
                errorMessage = e.message ?: "remote_exception",
            )
        } catch (t: Throwable) {
            Log.e(TAG, "native_print_low_level_sequence_error commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} reason=${t.message ?: "dispatch_exception"}")
            NativeDispatchReport(
                acceptedByNative = false,
                dispatchStarted = true,
                dispatchCompleted = false,
                dispatchAdapterEntered = true,
                nativeDispatchAttempted = true,
                lowLevelSequenceStarted = true,
                lowLevelSequenceCompleted = false,
                selectedServiceFamily = selectedFamily,
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = false,
                errorCode = "NATIVE_PRINT_SERVICE_DISPATCH_NOT_ATTEMPTED",
                errorMessage = t.message ?: "dispatch_exception",
            )
        } finally {
            session.close()
        }
    }

    private fun buildDispatchMarker(job: NativePrintJobEntity): String {
        val order = job.orderId ?: "unknown"
        return "NATIVE COMMAND DISPATCH\nCMD:${job.commandId}\nORDER:$order\n"
    }

    companion object {
        private const val TAG = "NativePrinterWorker"
    }
}
