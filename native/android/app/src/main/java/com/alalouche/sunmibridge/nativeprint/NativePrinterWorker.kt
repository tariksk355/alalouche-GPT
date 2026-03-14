package com.alalouche.sunmibridge.nativeprint

import android.content.Context
import android.os.Build
import android.os.RemoteException
import android.util.Log
import java.util.Locale
import woyou.aidlservice.jiuiv5.ICallback
import woyou.aidlservice.jiuiv5.IWoyouService

interface NativePrinterWorker {
    fun dispatch(job: NativePrintJobEntity): NativeDispatchReport
}

private class LowLevelStepException(
    val step: String,
    cause: Throwable,
) : RuntimeException(cause)

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

        return try {
            Log.i(TAG, "native_print_dispatch_start commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""}")
            Log.i(TAG, "native_print_dispatch_adapter_enter commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""}")
            Log.i(TAG, "native_print_dispatch_adapter_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} selectedFamily=${selectedFamily ?: ""}")
            val callbackErrors = mutableListOf<String>()
            val lowLevelSummary = executeRealLowLevelPrint(
                service = session.service,
                job = job,
                callbackErrors = callbackErrors,
            )

            val callbackError = callbackErrors.firstOrNull()
            val hasCallbackError = callbackError != null
            NativeDispatchReport(
                acceptedByNative = !hasCallbackError,
                dispatchStarted = true,
                dispatchCompleted = true,
                dispatchAdapterEntered = true,
                nativeDispatchAttempted = true,
                lowLevelSequenceStarted = true,
                lowLevelSequenceCompleted = true,
                selectedServiceFamily = selectedFamily,
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = hasCallbackError,
                errorCode = if (hasCallbackError) "NATIVE_PRINT_CALLBACK_ERROR" else null,
                errorMessage = callbackError,
            ).also {
                Log.i(
                    TAG,
                    "native_print_low_level_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} attemptedRealPrint=true primitiveSequence=$lowLevelSummary callbackErrors=${callbackErrors.size}",
                )
            }
        } catch (e: LowLevelStepException) {
            val cause = e.cause ?: e
            Log.e(
                TAG,
                "native_print_low_level_exception commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=${e.step} reason=${cause.message ?: "unknown"}",
            )
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
                errorCode = "NATIVE_PRINT_LOW_LEVEL_STEP_FAILED",
                errorMessage = "step=${e.step}:${cause.message ?: "unknown"}",
            )
        } catch (e: RemoteException) {
            Log.e(TAG, "native_print_low_level_exception commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=remote_exception reason=${e.message ?: "remote_exception"}")
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
            Log.e(TAG, "native_print_low_level_exception commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=dispatch_exception reason=${t.message ?: "dispatch_exception"}")
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

    private fun executeRealLowLevelPrint(
        service: IWoyouService,
        job: NativePrintJobEntity,
        callbackErrors: MutableList<String>,
    ): String {
        val content = buildRealBaselinePayload(job)

        callPrinterPrimitive(job, "printerInit") {
            service.printerInit(callbackFor(job, "printerInit", callbackErrors))
        }

        callPrinterPrimitive(job, "setAlignment", detail = "value=0") {
            service.setAlignment(0, callbackFor(job, "setAlignment", callbackErrors))
        }

        callPrinterPrimitive(job, "printText", detail = "payloadLength=${content.length}") {
            service.printText(content, callbackFor(job, "printText", callbackErrors))
        }

        callPrinterPrimitive(job, "lineWrap", detail = "lines=3") {
            service.lineWrap(3, callbackFor(job, "lineWrap", callbackErrors))
        }

        val rawFeed = byteArrayOf(0x1B, 0x64, 0x03)
        callPrinterPrimitive(job, "sendRAWData", detail = "bytes=${rawFeed.size}") {
            service.sendRAWData(rawFeed, callbackFor(job, "sendRAWData", callbackErrors))
        }

        return "printerInit->setAlignment->printText->lineWrap->sendRAWData"
    }

    private fun callPrinterPrimitive(
        job: NativePrintJobEntity,
        step: String,
        detail: String? = null,
        call: () -> Unit,
    ) {
        val suffix = if (detail.isNullOrBlank()) "" else " $detail"
        Log.i(TAG, "native_print_low_level_call $step start commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""}$suffix")
        try {
            call()
            Log.i(TAG, "native_print_low_level_call $step end commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""}$suffix")
        } catch (t: Throwable) {
            throw LowLevelStepException(step, t)
        }
    }

    private fun callbackFor(
        job: NativePrintJobEntity,
        step: String,
        callbackErrors: MutableList<String>,
    ): ICallback {
        return object : ICallback.Stub() {
            override fun onRunResult(isSuccess: Boolean) {
                Log.i(
                    TAG,
                    "native_print_low_level_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=$step callback=onRunResult isSuccess=$isSuccess",
                )
                if (!isSuccess) {
                    callbackErrors += "$step:onRunResult:false"
                }
            }

            override fun onReturnString(result: String?) {
                Log.i(
                    TAG,
                    "native_print_low_level_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=$step callback=onReturnString result=${result ?: ""}",
                )
            }

            override fun onRaiseException(code: Int, msg: String?) {
                Log.i(
                    TAG,
                    "native_print_low_level_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=$step callback=onRaiseException code=$code msg=${msg ?: "unknown"}",
                )
                callbackErrors += "$step:onRaiseException:$code:${msg ?: "unknown"}"
            }
        }
    }

    private fun buildRealBaselinePayload(job: NativePrintJobEntity): String {
        val isV2s = (Build.MODEL ?: "").lowercase(Locale.ROOT).contains("v2s")
        if (isV2s) {
            val shortCommandId = job.commandId.takeLast(8)
            return "NP TEST A\nNP TEST B\nCMD $shortCommandId\n"
        }

        val order = job.orderId ?: "unknown"
        return "NATIVE COMMAND DISPATCH\nCMD:${job.commandId}\nORDER:$order\n"
    }

    companion object {
        private const val TAG = "NativePrinterWorker"
    }
}
