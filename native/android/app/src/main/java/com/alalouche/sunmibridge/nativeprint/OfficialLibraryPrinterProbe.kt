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
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

private enum class OfficialRunMode {
    OFFICIAL_PRODUCTION_RECEIPT_BITMAP,
    OFFICIAL_PROBE_TEXT_ONLY,
    OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAP,
    OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAPCUSTOM,
}

private enum class OfficialProductionBitmapPrimitive {
    PRINT_BITMAP,
    PRINT_BITMAP_CUSTOM,
}

class OfficialLibraryPrinterProbe(
    private val context: Context,
) {
    fun dispatch(job: NativePrintJobEntity): NativeDispatchReport {
        val runMode = resolveRunMode()
        val bindLatch = CountDownLatch(1)
        val callbackErrors = mutableListOf<String>()
        var service: SunmiPrinterService? = null

        Log.i(TAG, "official_library_bind_start commandId=${job.commandId} orderId=${job.orderId ?: ""} activePrinterPath=OFFICIAL_LIBRARY_PATH")
        Log.i(TAG, "official_run_mode commandId=${job.commandId} orderId=${job.orderId ?: ""} mode=${runMode.name}")
        Log.i(TAG, "official_production_bitmap_primitive_default commandId=${job.commandId} orderId=${job.orderId ?: ""} primitive=${DEFAULT_PRODUCTION_BITMAP_PRIMITIVE.name}")

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
            Log.i(
                TAG,
                "official_library_device_info commandId=${job.commandId} orderId=${job.orderId ?: ""} buildModel=${Build.MODEL ?: ""} serviceVersion=${runCatching { svc.serviceVersion }.getOrNull().orEmpty()} printerVersion=${runCatching { svc.printerVersion }.getOrNull().orEmpty()} printerSerialNo=${runCatching { svc.printerSerialNo }.getOrNull().orEmpty()}",
            )

            Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=printerInit_start")
            svc.printerInit(callbackForOfficial(job, "printerInit", callbackErrors))

            when (runMode) {
                OfficialRunMode.OFFICIAL_PRODUCTION_RECEIPT_BITMAP -> runProductionReceiptBitmap(svc, job, callbackErrors)
                OfficialRunMode.OFFICIAL_PROBE_TEXT_ONLY -> runTextOnlyProbe(svc, job, callbackErrors)
                OfficialRunMode.OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAP -> runBitmapProbe(svc, job, callbackErrors, useCustom = false)
                OfficialRunMode.OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAPCUSTOM -> runBitmapProbe(svc, job, callbackErrors, useCustom = true)
            }

            Thread.sleep(1000L)
            val physicalOutcome = if (callbackErrors.isEmpty()) "UNKNOWN_NO_HARDWARE_SIGNAL" else "CALLBACK_ERROR_REPORTED"
            Log.i(
                TAG,
                "official_probe_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} mode=${runMode.name} printTextDispatched=${runMode == OfficialRunMode.OFFICIAL_PROBE_TEXT_ONLY} printBitmapDispatched=${runMode == OfficialRunMode.OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAP || (runMode == OfficialRunMode.OFFICIAL_PRODUCTION_RECEIPT_BITMAP && DEFAULT_PRODUCTION_BITMAP_PRIMITIVE == OfficialProductionBitmapPrimitive.PRINT_BITMAP)} printBitmapCustomDispatched=${runMode == OfficialRunMode.OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAPCUSTOM || (runMode == OfficialRunMode.OFFICIAL_PRODUCTION_RECEIPT_BITMAP && DEFAULT_PRODUCTION_BITMAP_PRIMITIVE == OfficialProductionBitmapPrimitive.PRINT_BITMAP_CUSTOM)} callbackErrors=${callbackErrors.size} physicalOutcome=$physicalOutcome",
            )

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

    private fun runProductionReceiptBitmap(
        service: SunmiPrinterService,
        job: NativePrintJobEntity,
        callbackErrors: MutableList<String>,
    ) {
        val receiptLines = buildReceiptLines(job)
        val bitmap = renderBitmapFromLines(receiptLines)
        try {
            Log.i(TAG, "official_receipt_bitmap_render commandId=${job.commandId} orderId=${job.orderId ?: ""} widthPx=${bitmap.width} heightPx=${bitmap.height} lineCount=${receiptLines.size}")
            Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=receipt_bitmap_dispatch")
            dispatchBitmapByProductionPrimitive(service, bitmap, job, callbackErrors)
        } finally {
            bitmap.recycle()
        }

        Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=lineWrap_after_bitmap")
        service.lineWrap(3, callbackForOfficial(job, "lineWrap_3_receipt", callbackErrors))
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
        Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=lineWrap_after_printText")
        service.lineWrap(3, callbackForOfficial(job, "lineWrap_3_text", callbackErrors))
    }

    private fun runBitmapProbe(
        service: SunmiPrinterService,
        job: NativePrintJobEntity,
        callbackErrors: MutableList<String>,
        useCustom: Boolean,
    ) {
        val bitmap = renderDeterministicProbeBitmap()
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

        Log.i(TAG, "official_probe_step commandId=${job.commandId} orderId=${job.orderId ?: ""} official_probe_step=lineWrap_after_bitmap")
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
        return object : InnerResultCallback() {
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
    }

    private fun resolveRunMode(): OfficialRunMode {
        val normalized = ACTIVE_OFFICIAL_RUN_MODE.trim().uppercase()
        return OfficialRunMode.entries.firstOrNull { it.name == normalized } ?: DEFAULT_OFFICIAL_RUN_MODE
    }

    private fun dispatchBitmapByProductionPrimitive(
        service: SunmiPrinterService,
        bitmap: Bitmap,
        job: NativePrintJobEntity,
        callbackErrors: MutableList<String>,
    ) {
        when (DEFAULT_PRODUCTION_BITMAP_PRIMITIVE) {
            OfficialProductionBitmapPrimitive.PRINT_BITMAP -> {
                Log.i(TAG, "official_production_bitmap_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} primitive=PRINT_BITMAP")
                service.printBitmap(bitmap, callbackForOfficial(job, "production_printBitmap", callbackErrors))
            }
            OfficialProductionBitmapPrimitive.PRINT_BITMAP_CUSTOM -> {
                Log.i(TAG, "official_production_bitmap_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} primitive=PRINT_BITMAP_CUSTOM type=1")
                service.printBitmapCustom(bitmap, 1, callbackForOfficial(job, "production_printBitmapCustom_type_1", callbackErrors))
            }
        }
    }

    private fun buildReceiptLines(job: NativePrintJobEntity): List<String> {
        val payload = runCatching { JSONObject(job.payloadJson) }.getOrNull()
        val lines = mutableListOf<String>()

        fun add(label: String, value: String?) {
            val normalized = value?.trim().orEmpty()
            if (normalized.isNotBlank()) lines += "$label: $normalized"
        }

        if (payload == null) return listOf("ORDER: ${job.orderId ?: "UNKNOWN"}", "PAYLOAD_ERROR", "---")

        val orderNumber = payload.optString("orderNumber").ifBlank {
            payload.optString("order_number").ifBlank {
                payload.optString("orderId").ifBlank { job.orderId ?: "UNKNOWN" }
            }
        }
        val customerLine = payload.optString("customerLine").ifBlank {
            payload.optString("customer").ifBlank {
                payload.optString("customerName")
            }
        }
        val address = payload.optString("address").ifBlank { payload.optString("deliveryAddress") }
        val payment = payload.optString("payment").ifBlank { payload.optString("paymentMethod") }
        val orderedTime = payload.optString("orderedTime").ifBlank { payload.optString("ordered_at") }
        val customerHistory = payload.optString("customerHistory").ifBlank { payload.optString("history") }
        val preparationTime = payload.optString("preparationTime").ifBlank { payload.optString("prepTime") }
        val total = payload.optString("total").ifBlank { payload.optString("totalAmount") }

        lines += "ORDER #$orderNumber"
        add("CUSTOMER", customerLine)
        add("ADDRESS", address)
        add("PAYMENT", payment)
        add("ORDERED", orderedTime)
        add("HISTORY", customerHistory)
        add("PREPARATION", preparationTime)
        lines += "------------------------------"
        lines += payload.optString("itemsHeader").ifBlank { "ITEMS" }

        val itemArray = payload.optJSONArray("items") ?: payload.optJSONArray("lines") ?: JSONArray()
        if (itemArray.length() == 0) {
            lines += payload.optString("itemsText").ifBlank { "-" }
        } else {
            for (i in 0 until itemArray.length()) {
                val itemObj = itemArray.optJSONObject(i)
                if (itemObj != null) {
                    val qty = itemObj.optInt("quantity", itemObj.optInt("qty", 1))
                    val name = itemObj.optString("name").ifBlank { itemObj.optString("title", "ITEM") }
                    lines += "$qty x $name"
                } else {
                    val raw = itemArray.optString(i)
                    if (raw.isNotBlank()) lines += raw
                }
            }
        }

        lines += "------------------------------"
        add("TOTAL", total)
        return lines
    }

    private fun renderBitmapFromLines(lines: List<String>): Bitmap {
        val widthPx = 384
        val horizontalPaddingPx = 12
        val topPaddingPx = 18
        val bottomPaddingPx = 26
        val lineHeightPx = 34
        val safeLines = if (lines.isEmpty()) listOf("EMPTY_RECEIPT") else lines
        val heightPx = max(220, topPaddingPx + bottomPaddingPx + (safeLines.size * lineHeightPx))

        val bmp = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 24f
            typeface = Typeface.MONOSPACE
        }
        var y = topPaddingPx + lineHeightPx
        safeLines.forEach { line ->
            val drawLine = if (line.length > 30) line.take(30) else line
            canvas.drawText(drawLine, horizontalPaddingPx.toFloat(), y.toFloat(), paint)
            y += lineHeightPx
        }
        return bmp
    }

    private fun renderDeterministicProbeBitmap(): Bitmap {
        return renderBitmapFromLines(listOf("TEST", "HELLO", "123", "END"))
    }

    companion object {
        private const val TAG = "OfficialLibraryProbe"
        private const val CALLBACK_TIMEOUT_MS = 1800L
        private const val BIND_TIMEOUT_MS = 3500L

        private val DEFAULT_OFFICIAL_RUN_MODE = OfficialRunMode.OFFICIAL_PRODUCTION_RECEIPT_BITMAP
        private const val ACTIVE_OFFICIAL_RUN_MODE = "OFFICIAL_PRODUCTION_RECEIPT_BITMAP" // OFFICIAL_PRODUCTION_RECEIPT_BITMAP | OFFICIAL_PROBE_TEXT_ONLY | OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAP | OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAPCUSTOM

        // Production receipt primitive switch-point (preferred default: PRINT_BITMAP).
        private val DEFAULT_PRODUCTION_BITMAP_PRIMITIVE = OfficialProductionBitmapPrimitive.PRINT_BITMAP // PRINT_BITMAP or PRINT_BITMAP_CUSTOM
    }
}
