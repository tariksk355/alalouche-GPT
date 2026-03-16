package com.alalouche.sunmibridge.nativeprint

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.text.TextPaint
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
import java.util.regex.Pattern
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
        var sourceUsed = "fallback_fields"

        fun addLine(text: String) {
            val normalized = text.trim()
            if (normalized.isBlank()) return
            val idx = lines.size
            lines += normalized
            Log.i(TAG, "official_receipt_line commandId=${job.commandId} orderId=${job.orderId ?: ""} index=$idx text=$normalized")
        }

        fun addLabeled(label: String, value: String?) {
            val normalized = value?.trim().orEmpty()
            if (normalized.isNotBlank()) addLine("$label: $normalized")
        }

        if (payload == null) {
            addLine("ORDER: ${job.orderId ?: "UNKNOWN"}")
            addLine("PAYLOAD_ERROR")
            addLine("---")
            Log.i(TAG, "customer_phone_source source=fallback_payload_null")
            Log.i(TAG, "customer_phone_value value=")
            Log.i(TAG, "customer_phone_included_in_receipt false")
            Log.i(TAG, "official_receipt_line_extraction_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} source=fallback_payload_null totalExtractedLines=${lines.size}")
            return lines
        }

        val displayModel = payload.optJSONObject("displayModel")
        logCustomerPhoneCandidates("official_probe_payload", payload, displayModel)
        val extractedPhone = extractCustomerPhoneFromPayload(payload, displayModel)
        val finalPhone = normalizePhoneForDisplay(extractedPhone.second)
        Log.i(TAG, "customer_phone_source source=${extractedPhone.first}")
        Log.i(TAG, "customer_phone_value value=$finalPhone")

        fun ensurePhoneIncludedInLines() {
            val hasPhoneAlready = lines.any { existing ->
                existing.contains("tel", ignoreCase = true) ||
                    existing.contains("téléphone", ignoreCase = true) ||
                    (finalPhone.isNotBlank() && existing.contains(finalPhone))
            }
            val included = if (finalPhone.isNotBlank() && !hasPhoneAlready) {
                val insertAt = lines.indexOfFirst { it.startsWith("CUSTOMER:", ignoreCase = true) }
                if (insertAt >= 0) {
                    lines.add(insertAt + 1, "Téléphone: $finalPhone")
                    Log.i(TAG, "official_receipt_line commandId=${job.commandId} orderId=${job.orderId ?: ""} index=${insertAt + 1} text=Téléphone: $finalPhone")
                } else {
                    val target = 1.coerceAtMost(lines.size)
                    lines.add(target, "Téléphone: $finalPhone")
                    Log.i(TAG, "official_receipt_line commandId=${job.commandId} orderId=${job.orderId ?: ""} index=$target text=Téléphone: $finalPhone")
                }
                true
            } else {
                hasPhoneAlready && finalPhone.isNotBlank()
            }
            Log.i(TAG, "customer_phone_included_in_receipt $included")
        }

        val displayReceiptLines = displayModel?.optJSONArray("receiptLines")
        if (displayReceiptLines != null && displayReceiptLines.length() > 0) {
            sourceUsed = "displayModel.receiptLines"
            for (i in 0 until displayReceiptLines.length()) {
                addLine(displayReceiptLines.optString(i))
            }
            ensurePhoneIncludedInLines()
            Log.i(TAG, "official_receipt_line_extraction_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} source=$sourceUsed totalExtractedLines=${lines.size}")
            return lines
        }

        val topLevelReceiptLines = payload.optJSONArray("receiptLines")
        if (topLevelReceiptLines != null && topLevelReceiptLines.length() > 0) {
            sourceUsed = "payload.receiptLines"
            for (i in 0 until topLevelReceiptLines.length()) {
                addLine(topLevelReceiptLines.optString(i))
            }
            ensurePhoneIncludedInLines()
            Log.i(TAG, "official_receipt_line_extraction_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} source=$sourceUsed totalExtractedLines=${lines.size}")
            return lines
        }

        sourceUsed = "fallback_fields"
        val orderNumber = payload.optString("orderNumber").ifBlank {
            payload.optString("order_number").ifBlank {
                payload.optString("orderId").ifBlank { job.orderId ?: "UNKNOWN" }
            }
        }
        val customerLine = payload.optString("customerLine").ifBlank {
            payload.optString("customer").ifBlank {
                payload.optString("customerName").ifBlank { payload.optString("client") }
            }
        }
        val address = payload.optString("address").ifBlank {
            payload.optString("deliveryAddress").ifBlank { payload.optString("customerAddress") }
        }
        val payment = payload.optString("payment").ifBlank {
            payload.optString("paymentMethod").ifBlank { payload.optString("payment_method") }
        }
        val orderedTime = payload.optString("orderedTime").ifBlank {
            payload.optString("ordered_at").ifBlank { payload.optString("orderedTimeText") }
        }
        val customerHistory = payload.optString("customerHistory").ifBlank {
            payload.optString("history").ifBlank { payload.optString("customer_history") }
        }
        val preparationTime = payload.optString("preparationTime").ifBlank {
            payload.optString("prepTime").ifBlank { payload.optString("preparation_time") }
        }
        val total = payload.optString("total").ifBlank {
            payload.optString("totalAmount").ifBlank { payload.optString("total_amount") }
        }

        addLine("ORDER #$orderNumber")
        addLabeled("CUSTOMER", customerLine)
        if (finalPhone.isNotBlank()) {
            addLine("Téléphone: $finalPhone")
            Log.i(TAG, "customer_phone_included_in_receipt true")
        } else {
            Log.i(TAG, "customer_phone_included_in_receipt false")
        }
        addLabeled("ADDRESS", address)
        addLabeled("PAYMENT", payment)
        addLabeled("ORDERED", orderedTime)
        addLabeled("HISTORY", customerHistory)
        addLabeled("PREPARATION", preparationTime)
        addLine("------------------------------")
        addLine(payload.optString("itemsHeader").ifBlank { "ITEMS" })

        val itemArray = payload.optJSONArray("items") ?: payload.optJSONArray("lines") ?: JSONArray()
        if (itemArray.length() == 0) {
            addLine(payload.optString("itemsText").ifBlank { "-" })
        } else {
            for (i in 0 until itemArray.length()) {
                val itemObj = itemArray.optJSONObject(i)
                if (itemObj != null) {
                    val qty = itemObj.optInt("quantity", itemObj.optInt("qty", 1))
                    val name = itemObj.optString("name").ifBlank { itemObj.optString("title", "ITEM") }
                    addLine("$qty x $name")
                } else {
                    addLine(itemArray.optString(i))
                }
            }
        }

        addLine("------------------------------")
        addLabeled("TOTAL", total)
        Log.i(TAG, "official_receipt_line_extraction_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} source=$sourceUsed totalExtractedLines=${lines.size}")
        return lines
    }

    private fun extractCustomerPhoneFromPayload(payload: JSONObject, displayModel: JSONObject?): Pair<String, String> {
        val candidates = mutableListOf<Pair<String, String>>()

        fun push(source: String, value: String?) {
            val v = value?.trim().orEmpty()
            if (v.isNotBlank()) candidates += (source to v)
        }

        push("payload.customerPhone", payload.optString("customerPhone"))
        push("payload.customer_phone", payload.optString("customer_phone"))
        push("payload.phone", payload.optString("phone"))
        push("payload.phoneNumber", payload.optString("phoneNumber"))
        payload.optJSONObject("customer")?.let { customer ->
            push("payload.customer.phone", customer.optString("phone"))
            push("payload.customer.phoneNumber", customer.optString("phoneNumber"))
        }
        push("payload.deliveryPhone", payload.optString("deliveryPhone"))
        push("payload.delivery_phone", payload.optString("delivery_phone"))
        push("payload.contactPhone", payload.optString("contactPhone"))
        payload.optJSONObject("contact")?.let { contact ->
            push("payload.contact.phone", contact.optString("phone"))
        }

        push("displayModel.phone", displayModel?.optString("phone"))
        push("displayModel.customerPhone", displayModel?.optString("customerPhone"))
        displayModel?.optJSONArray("displaySections")?.let { sections ->
            for (i in 0 until sections.length()) {
                val section = sections.optJSONObject(i) ?: continue
                push("displayModel.displaySections[$i].phone", section.optString("phone"))
                push("displayModel.displaySections[$i].customerPhone", section.optString("customerPhone"))
                val line = section.optString("line")
                if (line.contains("tel", ignoreCase = true) || line.contains("phone", ignoreCase = true)) {
                    val extracted = line.substringAfter(':', "").trim()
                    push("displayModel.displaySections[$i].line", extracted)
                }
            }
        }

        return candidates.firstOrNull() ?: ("not_found" to "")
    }

    private data class CustomerPhoneCandidate(
        val field: String,
        val exists: Boolean,
        val value: String,
    )

    private fun logCustomerPhoneCandidates(scope: String, payload: JSONObject, displayModel: JSONObject?) {
        val candidates = mutableListOf<CustomerPhoneCandidate>()

        fun add(field: String, exists: Boolean, value: String?) {
            candidates += CustomerPhoneCandidate(field, exists, value?.trim().orEmpty())
        }

        add("payload.customerPhone", payload.has("customerPhone"), payload.optString("customerPhone", ""))
        add("payload.customer_phone", payload.has("customer_phone"), payload.optString("customer_phone", ""))
        add("payload.phone", payload.has("phone"), payload.optString("phone", ""))
        add("payload.phoneNumber", payload.has("phoneNumber"), payload.optString("phoneNumber", ""))
        val customer = payload.optJSONObject("customer")
        add("payload.customer", customer != null, if (customer != null) "[object]" else "")
        add("payload.customer.phone", customer?.has("phone") == true, customer?.optString("phone", ""))
        add("payload.customer.phoneNumber", customer?.has("phoneNumber") == true, customer?.optString("phoneNumber", ""))
        add("payload.deliveryPhone", payload.has("deliveryPhone"), payload.optString("deliveryPhone", ""))
        add("payload.delivery_phone", payload.has("delivery_phone"), payload.optString("delivery_phone", ""))
        add("payload.contactPhone", payload.has("contactPhone"), payload.optString("contactPhone", ""))
        val contact = payload.optJSONObject("contact")
        add("payload.contact", contact != null, if (contact != null) "[object]" else "")
        add("payload.contact.phone", contact?.has("phone") == true, contact?.optString("phone", ""))

        add("displayModel.phone", displayModel?.has("phone") == true, displayModel?.optString("phone", ""))
        add("displayModel.customerPhone", displayModel?.has("customerPhone") == true, displayModel?.optString("customerPhone", ""))
        val sections = displayModel?.optJSONArray("displaySections")
        add("displayModel.displaySections", sections != null, if (sections != null) "count=${sections.length()}" else "")
        if (sections != null) {
            for (i in 0 until sections.length()) {
                val section = sections.optJSONObject(i) ?: continue
                add("displayModel.displaySections[$i].key", section.has("key"), section.optString("key", ""))
                add("displayModel.displaySections[$i].phone", section.has("phone"), section.optString("phone", ""))
                add("displayModel.displaySections[$i].customerPhone", section.has("customerPhone"), section.optString("customerPhone", ""))
                add("displayModel.displaySections[$i].line", section.has("line"), section.optString("line", ""))
            }
        }

        val block = candidates.joinToString("\n") { "field=${it.field} exists=${it.exists} value=${it.value}" }
        Log.i(TAG, "customer_phone_candidates scope=$scope\n$block")
    }

    private fun normalizePhoneForDisplay(raw: String): String {
        if (raw.isBlank()) return ""
        val trimmed = raw.trim().replace("\\s+".toRegex(), " ")
        return if (trimmed.startsWith("+")) {
            "+" + trimmed.removePrefix("+").trimStart()
        } else {
            trimmed
        }
    }

    private fun renderBitmapFromLines(lines: List<String>): Bitmap {
        val bitmapWidth = 384
        val leftPaddingPx = 12
        val rightPaddingPx = 12
        val topPaddingPx = 18
        val bottomPaddingPx = 26
        val lineHeightPx = 34
        val drawableWidthPx = (bitmapWidth - leftPaddingPx - rightPaddingPx).coerceAtLeast(1)
        val safeLines = if (lines.isEmpty()) listOf("EMPTY_RECEIPT") else lines

        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 24f
            typeface = Typeface.MONOSPACE
        }

        val normalizedLines = mutableListOf<String>()
        safeLines.forEachIndexed { idx, line ->
            val normalized = normalizeReceiptText(line)
            if (normalized != line) {
                Log.i(TAG, "official_receipt_line_normalized index=$idx before=$line after=$normalized")
            }
            normalizedLines += normalized
        }

        val wrappedLines = mutableListOf<String>()
        val separatorSegmentIndices = mutableSetOf<Int>()
        var truncatedLineCount = 0
        normalizedLines.forEach { sourceLine ->
            if (sourceLine.isBlank()) {
                wrappedLines += ""
                return@forEach
            }
            if (SEPARATOR_LINE_PATTERN.matcher(sourceLine).matches()) {
                wrappedLines += sourceLine
                separatorSegmentIndices += wrappedLines.lastIndex
                return@forEach
            }
            var cursor = 0
            while (cursor < sourceLine.length) {
                var count = paint.breakText(sourceLine, cursor, sourceLine.length, true, drawableWidthPx.toFloat(), null)
                if (count <= 0) {
                    count = 1
                    truncatedLineCount += 1
                }
                val end = (cursor + count).coerceAtMost(sourceLine.length)
                wrappedLines += sourceLine.substring(cursor, end)
                cursor = end
            }
        }

        val desiredHeight = topPaddingPx + bottomPaddingPx + (wrappedLines.size * lineHeightPx)
        val maxBitmapHeightPx = 12000
        val bitmapHeight = desiredHeight.coerceIn(220, maxBitmapHeightPx)
        val maxDrawableLines = ((bitmapHeight - topPaddingPx - bottomPaddingPx) / lineHeightPx).coerceAtLeast(1)
        val drawableLines = wrappedLines.take(maxDrawableLines)
        val droppedLineCount = (wrappedLines.size - drawableLines.size).coerceAtLeast(0)

        Log.i(
            TAG,
            "official_receipt_bitmap_render_stats inputLineCount=${safeLines.size} wrappedLineCount=${wrappedLines.size} drawnLineCount=${drawableLines.size} truncatedLineCount=$truncatedLineCount droppedLineCount=$droppedLineCount bitmapWidth=$bitmapWidth bitmapHeight=$bitmapHeight lineHeight=$lineHeightPx leftPadding=$leftPaddingPx rightPadding=$rightPaddingPx topPadding=$topPaddingPx bottomPadding=$bottomPaddingPx",
        )

        val bmp = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)

        val separatorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }

        var y = topPaddingPx + lineHeightPx
        drawableLines.forEachIndexed { drawIndex, line ->
            val sourceWrappedIndex = drawIndex
            if (separatorSegmentIndices.contains(sourceWrappedIndex)) {
                val startX = leftPaddingPx.toFloat()
                val endX = (bitmapWidth - rightPaddingPx).toFloat()
                val centerY = (y - (lineHeightPx / 2f))
                canvas.drawLine(startX, centerY, endX, centerY, separatorPaint)
                Log.i(TAG, "official_receipt_separator_rendered index=$sourceWrappedIndex mode=drawLine")
            } else {
                canvas.drawText(line, leftPaddingPx.toFloat(), y.toFloat(), paint)
            }
            y += lineHeightPx
        }
        return bmp
    }

    private fun normalizeReceiptText(input: String): String {
        var out = input
        val replacements = listOf(
            "ÔÇó" to "•",
            "pr├®c├®dentes" to "précédentes",
            "Pr├®paration" to "Préparation",
            "├®" to "é",
            "├" to "",
            "ÔÇ" to "",
            "Â" to "",
        )
        replacements.forEach { (bad, good) ->
            out = out.replace(bad, good)
        }
        return out
    }

    private fun renderDeterministicProbeBitmap(): Bitmap {
        return renderBitmapFromLines(listOf("TEST", "HELLO", "123", "END"))
    }

    companion object {
        private const val TAG = "OfficialLibraryProbe"
        private const val CALLBACK_TIMEOUT_MS = 1800L
        private const val BIND_TIMEOUT_MS = 3500L
        private val SEPARATOR_LINE_PATTERN: Pattern = Pattern.compile("^\\s*-{3,}\\s*$")

        private val DEFAULT_OFFICIAL_RUN_MODE = OfficialRunMode.OFFICIAL_PRODUCTION_RECEIPT_BITMAP
        private const val ACTIVE_OFFICIAL_RUN_MODE = "OFFICIAL_PRODUCTION_RECEIPT_BITMAP" // OFFICIAL_PRODUCTION_RECEIPT_BITMAP | OFFICIAL_PROBE_TEXT_ONLY | OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAP | OFFICIAL_PROBE_BITMAP_ONLY_PRINTBITMAPCUSTOM

        // Production receipt primitive switch-point (preferred default: PRINT_BITMAP).
        private val DEFAULT_PRODUCTION_BITMAP_PRIMITIVE = OfficialProductionBitmapPrimitive.PRINT_BITMAP // PRINT_BITMAP or PRINT_BITMAP_CUSTOM
    }
}
