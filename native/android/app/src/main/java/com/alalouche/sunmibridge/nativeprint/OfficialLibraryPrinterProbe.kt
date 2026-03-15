package com.alalouche.sunmibridge.nativeprint

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.util.Log
import com.sunmi.peripheral.printer.InnerPrinterCallback
import com.sunmi.peripheral.printer.InnerPrinterManager
import com.sunmi.peripheral.printer.InnerResultCallback
import com.sunmi.peripheral.printer.SunmiPrinterService
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

private enum class OfficialProbeMode {
    OFFICIAL_PROBE_TEXT_ONLY,
    OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAP,
    OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAPCUSTOM,
}

class OfficialLibraryPrinterProbe(
    private val context: Context,
) {
    fun dispatch(job: NativePrintJobEntity): NativeDispatchReport {
        val probeMode = resolveProbeMode()
        val bindLatch = CountDownLatch(1)
        val callbackErrors = mutableListOf<String>()
        var service: SunmiPrinterService? = null

        Log.i(TAG, "native_print_official_probe_start commandId=${job.commandId} orderId=${job.orderId ?: ""} path=OFFICIAL_LIBRARY_PATH")
        Log.i(TAG, "official_probe_mode commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_mode=${probeMode.name}")
        Log.i(TAG, "official_library_bind_start commandId=${job.commandId} orderId=${job.orderId ?: ""} activePrinterPath=OFFICIAL_LIBRARY_PATH")
        Log.i(TAG, "official_library_resolved_symbols managerClass=${InnerPrinterManager::class.java.name} bindCallbackBase=${InnerPrinterCallback::class.java.name} resultCallbackBase=${InnerResultCallback::class.java.name} serviceClass=${SunmiPrinterService::class.java.name}")
        val bindCallback = object : InnerPrinterCallback() {
            override fun onConnected(svc: SunmiPrinterService?) {
                service = svc
                Log.i(TAG, "official_library_on_connected commandId=${job.commandId} orderId=${job.orderId ?: ""} serviceClass=${svc?.javaClass?.name ?: "null"}")
                Log.i(TAG, "official_library_bind_success commandId=${job.commandId} orderId=${job.orderId ?: ""} bindSucceeded=${svc != null}")
                bindLatch.countDown()
            }

            override fun onDisconnected() {
                Log.w(TAG, "official_library_bind_disconnected commandId=${job.commandId} orderId=${job.orderId ?: ""}")
            }
        }

        return try {
            val bindInvoked = runCatching {
                InnerPrinterManager.getInstance().bindService(context, bindCallback)
            }.onFailure {
                Log.e(TAG, "official_library_bind_failure commandId=${job.commandId} orderId=${job.orderId ?: ""} reason=${it.message ?: "bind_error"}")
            }.isSuccess

            val bindArrived = if (bindInvoked) bindLatch.await(BIND_TIMEOUT_MS, TimeUnit.MILLISECONDS) else false
            if (!bindArrived || service == null) {
                Log.e(TAG, "official_library_bind_failure commandId=${job.commandId} orderId=${job.orderId ?: ""} reason=bind_timeout_or_null_service")
                return NativeDispatchReport(
                    acceptedByNative = false,
                    dispatchStarted = true,
                    dispatchCompleted = false,
                    dispatchAdapterEntered = true,
                    nativeDispatchAttempted = false,
                    lowLevelSequenceStarted = false,
                    lowLevelSequenceCompleted = false,
                    selectedServiceFamily = "official_library_path",
                    physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                    retryable = true,
                    errorCode = "OFFICIAL_LIBRARY_BIND_FAILED",
                    errorMessage = "bind_timeout_or_null_service",
                )
            }

            val svc = service!!
            val deviceInfo = "buildModel=${Build.MODEL ?: ""} serviceVersion=${runCatching { svc.serviceVersion }.getOrNull().orEmpty()} printerVersion=${runCatching { svc.printerVersion }.getOrNull().orEmpty()} printerSerialNo=${runCatching { svc.printerSerialNo }.getOrNull().orEmpty()}"
            Log.i(TAG, "official_library_device_info commandId=${job.commandId} orderId=${job.orderId ?: ""} $deviceInfo")

            Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=printerInit_start")
            svc.printerInit(callbackForOfficial(job, "printerInit", callbackErrors))

            when (probeMode) {
                OfficialProbeMode.OFFICIAL_PROBE_TEXT_ONLY -> runTextOnlyProbe(svc, job, callbackErrors)
                OfficialProbeMode.OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAP -> runBitmapProbe(svc, job, callbackErrors, useCustom = false)
                OfficialProbeMode.OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAPCUSTOM -> runBitmapProbe(svc, job, callbackErrors, useCustom = true)
            }

            Thread.sleep(1000L)
            val physicalOutcome = if (callbackErrors.isEmpty()) "UNKNOWN_NO_HARDWARE_SIGNAL" else "CALLBACK_ERROR_REPORTED"
            Log.i(TAG, "official_probe_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_mode=${probeMode.name} printTextDispatched=${probeMode == OfficialProbeMode.OFFICIAL_PROBE_TEXT_ONLY} printBitmapDispatched=${probeMode == OfficialProbeMode.OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAP} printBitmapCustomDispatched=${probeMode == OfficialProbeMode.OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAPCUSTOM} callbackErrors=${callbackErrors.size} physicalOutcome=$physicalOutcome")

            NativeDispatchReport(
                acceptedByNative = callbackErrors.isEmpty(),
                dispatchStarted = true,
                dispatchCompleted = true,
                dispatchAdapterEntered = true,
                nativeDispatchAttempted = true,
                lowLevelSequenceStarted = true,
                lowLevelSequenceCompleted = true,
                selectedServiceFamily = "official_library_path",
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = callbackErrors.isNotEmpty(),
                errorCode = if (callbackErrors.isNotEmpty()) "OFFICIAL_LIBRARY_CALLBACK_ERROR" else null,
                errorMessage = callbackErrors.firstOrNull(),
            )
        } catch (t: Throwable) {
            Log.e(TAG, "official_library_exception commandId=${job.commandId} orderId=${job.orderId ?: ""} reason=${t.message ?: "unknown"} exceptionClass=${t::class.java.name}")
            NativeDispatchReport(
                acceptedByNative = false,
                dispatchStarted = true,
                dispatchCompleted = false,
                dispatchAdapterEntered = true,
                nativeDispatchAttempted = true,
                lowLevelSequenceStarted = true,
                lowLevelSequenceCompleted = false,
                selectedServiceFamily = "official_library_path",
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = true,
                errorCode = "OFFICIAL_LIBRARY_PROBE_FAILED",
                errorMessage = t.message ?: "official_probe_failed",
            )
        } finally {
            runCatching { InnerPrinterManager.getInstance().unBindService(context, bindCallback) }
        }
    }

    private fun runTextOnlyProbe(
        service: SunmiPrinterService,
        job: NativePrintJobEntity,
        callbackErrors: MutableList<String>,
    ) {
        Log.i(TAG, "official_library_print_text_probe_start commandId=${job.commandId} orderId=${job.orderId ?: ""}")
        Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=printText_dispatch")
        service.printText("TEST\n", callbackForOfficial(job, "printText_TEST", callbackErrors))
        Log.i(TAG, "printText dispatched commandId=${job.commandId} orderId=${job.orderId ?: ""}")

        Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=lineWrap_after_printText_dispatch")
        service.lineWrap(3, callbackForOfficial(job, "lineWrap_3_text", callbackErrors))
    }

    private fun runBitmapProbe(
        service: SunmiPrinterService,
        job: NativePrintJobEntity,
        callbackErrors: MutableList<String>,
        useCustom: Boolean,
    ) {
        val bitmap = renderDeterministicBitmap()
        try {
            val op = if (useCustom) "printBitmapCustom" else "printBitmap"
            Log.i(TAG, "official_library_print_bitmap_probe_start commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$op widthPx=${bitmap.width} heightPx=${bitmap.height}")
            Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=${op}_dispatch")
            if (useCustom) {
                service.printBitmapCustom(bitmap, 1, callbackForOfficial(job, "printBitmapCustom_type_1", callbackErrors))
                Log.i(TAG, "printBitmapCustom dispatched commandId=${job.commandId} orderId=${job.orderId ?: ""} type=1")
            } else {
                service.printBitmap(bitmap, callbackForOfficial(job, "printBitmap", callbackErrors))
                Log.i(TAG, "printBitmap dispatched commandId=${job.commandId} orderId=${job.orderId ?: ""}")
            }
        } finally {
            bitmap.recycle()
        }

        Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=lineWrap_after_bitmap_dispatch")
        service.lineWrap(3, callbackForOfficial(job, if (useCustom) "lineWrap_3_bitmapCustom" else "lineWrap_3_bitmap", callbackErrors))
    }

    private fun callbackForOfficial(
        job: NativePrintJobEntity,
        step: String,
        callbackErrors: MutableList<String>,
    ): InnerResultCallback {
        val resolved = AtomicBoolean(false)
        Thread {
            runCatching { Thread.sleep(CALLBACK_TIMEOUT_MS) }
            if (!resolved.get()) {
                Log.w(TAG, "official_library_callback_timeout commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step timeoutMs=$CALLBACK_TIMEOUT_MS")
            }
        }.start()
        val callbackImpl = object : InnerResultCallback() {
            override fun onRunResult(isSuccess: Boolean) {
                resolved.set(true)
                Log.i(TAG, "official_library_callback_onRunResult commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step success=$isSuccess")
                if (!isSuccess) callbackErrors += "$step:onRunResult:false"
            }

            override fun onReturnString(result: String?) {
                resolved.set(true)
                Log.i(TAG, "official_library_callback_onReturnString commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step message=${result ?: ""}")
            }

            override fun onRaiseException(code: Int, msg: String?) {
                resolved.set(true)
                Log.i(TAG, "official_library_callback_onRaiseException commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step code=$code message=${msg ?: "unknown"}")
                callbackErrors += "$step:onRaiseException:$code:${msg ?: "unknown"}"
            }

            override fun onPrintResult(code: Int, msg: String?) {
                resolved.set(true)
                val success = code == 0
                Log.i(TAG, "official_library_callback_onPrintResult commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step success=$success code=$code message=${msg ?: ""}")
                if (!success) callbackErrors += "$step:onPrintResult:$code:${msg ?: "unknown"}"
            }
        }
        Log.i(TAG, "official_library_callback_impl commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step callbackClass=${callbackImpl::class.java.name} callbackBase=InnerResultCallback")
        return callbackImpl
    }

    private fun resolveProbeMode(): OfficialProbeMode {
        val normalized = ACTIVE_OFFICIAL_PROBE_MODE.trim().uppercase()
        return OfficialProbeMode.entries.firstOrNull { it.name == normalized } ?: DEFAULT_OFFICIAL_PROBE_MODE
    }

    private fun renderDeterministicBitmap(): Bitmap {
        val widthPx = 384
        val lines = listOf("TEST", "HELLO", "123", "END")
        val horizontalPaddingPx = 24
        val topPaddingPx = 28
        val bottomPaddingPx = 28
        val lineHeightPx = 52
        val heightPx = max(220, topPaddingPx + bottomPaddingPx + (lines.size * lineHeightPx))

        val bmp = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 36f
            typeface = Typeface.MONOSPACE
        }
        var y = topPaddingPx + lineHeightPx
        lines.forEach { line ->
            canvas.drawText(line, horizontalPaddingPx.toFloat(), y.toFloat(), paint)
            y += lineHeightPx
        }
        return bmp
    }

    companion object {
        private const val TAG = "OfficialLibraryProbe"
        private const val CALLBACK_TIMEOUT_MS = 1800L
        private const val BIND_TIMEOUT_MS = 3500L
        private val DEFAULT_OFFICIAL_PROBE_MODE = OfficialProbeMode.OFFICIAL_PROBE_TEXT_ONLY
        private const val ACTIVE_OFFICIAL_PROBE_MODE = "OFFICIAL_PROBE_TEXT_ONLY" // OFFICIAL_PROBE_TEXT_ONLY | OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAP | OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAPCUSTOM
    }
}
