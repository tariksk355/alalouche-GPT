package com.alalouche.sunmibridge

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.os.IBinder
import android.os.RemoteException
import android.util.Log
import com.alalouche.sunmibridge.printservice.PrintDatabase
import com.alalouche.sunmibridge.printservice.PrintExecutionResult
import com.alalouche.sunmibridge.printservice.PrintJobEntity
import com.alalouche.sunmibridge.printservice.PrintJobState
import com.alalouche.sunmibridge.printservice.PrintQueueOrchestrator
import com.alalouche.sunmibridge.transport.AidlTransport
import com.alalouche.sunmibridge.transport.ReceiptRenderContext
import com.alalouche.sunmibridge.transport.SunmiSdkTransport
import com.alalouche.sunmibridge.transport.TransportSelector
import org.json.JSONArray
import org.json.JSONObject
import woyou.aidlservice.jiuiv5.ICallback
import woyou.aidlservice.jiuiv5.IWoyouService
import java.text.Normalizer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

class SunmiPrinterManager(private val context: Context) {

    private var printerService: IWoyouService? = null
    private val isBinding = AtomicBoolean(false)

    private val transportSelector = TransportSelector(
        aidlTransport = AidlTransport(::printReceiptWithAidl),
        sunmiSdkTransport = SunmiSdkTransport(),
    )

    // Keep AIDL as default backend until Sunmi SDK artifact is installed and implemented.
    private val activeTransportMode = TransportSelector.MODE_AIDL

    private val printDatabase = PrintDatabase(context)
    private val printJobDao = printDatabase.printJobDao()
    private val printQueueOrchestrator = PrintQueueOrchestrator(printJobDao) { job ->
        val response = executeTransportPrintReceipt(job.payloadJson)
        if (response.optBoolean("ok", false)) {
            PrintExecutionResult(success = true)
        } else {
            PrintExecutionResult(
                success = false,
                errorCode = response.optString("code", "PRINT_FAILED"),
                errorMessage = response.optString("message", "Print execution failed."),
            )
        }
    }

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            printerService = IWoyouService.Stub.asInterface(service)
            isBinding.set(false)
            val descriptor = runCatching { service?.interfaceDescriptor }.getOrNull()
            Log.i(TAG, "Sunmi printer service connected: $name descriptor=${descriptor ?: "unknown"}")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            printerService = null
            isBinding.set(false)
            Log.w(TAG, "Sunmi printer service disconnected: $name")
        }

        override fun onNullBinding(name: ComponentName?) {
            printerService = null
            isBinding.set(false)
            Log.e(TAG, "Sunmi printer service null binding: $name")
        }
    }

    init {
        bindPrinterServiceAsync()
    }

    fun release() {
        runCatching {
            context.unbindService(serviceConnection)
            Log.i(TAG, "Sunmi printer service unbound")
        }
        printerService = null
        isBinding.set(false)
        runCatching { printDatabase.close() }
    }

    fun getPrinterInfo(): JSONObject {
        val sdkClassDetected = isClassPresent("woyou.aidlservice.jiuiv5.IWoyouService")
        val serviceBound = ensureServiceBound(1200)
        val service = printerService

        val info = JSONObject().apply {
            put("ok", true)
            put("mode", "native_bridge")
            put("manufacturer", Build.MANUFACTURER ?: "unknown")
            put("model", Build.MODEL ?: "unknown")
            put("sdkClassDetected", sdkClassDetected)
            put("serviceBound", serviceBound && service != null)
            put("available", serviceBound && service != null)
        }

        if (service != null) {
            runCatching { service.getServiceVersion() }.onSuccess { serviceVersion: String? -> info.put("serviceVersion", serviceVersion ?: "") }
            runCatching { service.getPrinterSerialNo() }.onSuccess { serialNo: String? -> info.put("printerSerialNo", serialNo ?: "") }
            runCatching { service.getPrinterVersion() }.onSuccess { printerVersion: String? -> info.put("printerVersion", printerVersion ?: "") }
            runCatching { service.updatePrinterState() }.onSuccess { stateCode: Int -> info.put("printerStateCode", stateCode) }
        } else {
            info.put("message", "Sunmi printer service is not bound.")
        }

        Log.i(TAG, "getPrinterInfo: $info")
        return info
    }

    fun printReceipt(printJobJson: String?): JSONObject {
        if (printJobJson.isNullOrBlank()) {
            return fail("INVALID_PRINT_JOB", "printJob JSON is required.")
        }

        val now = System.currentTimeMillis()
        val payload = runCatching { JSONObject(printJobJson) }.getOrNull()
        val printJob = payload?.optJSONObject("printJob") ?: payload
        val orderId = firstNonBlank(
            printJob?.optString("orderId"),
            printJob?.optString("order_id"),
            printJob?.optString("orderNumber"),
            printJob?.optString("order_number"),
        ).ifBlank { null }

        val jobId = java.util.UUID.randomUUID().toString()
        val job = PrintJobEntity(
            jobId = jobId,
            orderId = orderId,
            payloadJson = printJobJson,
            state = PrintJobState.QUEUED,
            attemptCount = 0,
            maxAttempts = DEFAULT_MAX_ATTEMPTS,
            errorCode = null,
            errorMessage = null,
            createdAtEpochMs = now,
            updatedAtEpochMs = now,
            nextAttemptAtEpochMs = null,
        )

        printQueueOrchestrator.enqueue(job)

        return JSONObject().apply {
            put("ok", true)
            put("mode", "native_bridge")
            put("queued", true)
            put("jobId", jobId)
            put("state", PrintJobState.QUEUED.name)
            put("message", "Print job accepted and queued.")
        }
    }

    fun getPrintStatus(jobId: String): JSONObject {
        if (jobId.isBlank()) {
            return fail("INVALID_JOB_ID", "jobId is required.")
        }
        val job = printJobDao.getById(jobId)
            ?: return fail("PRINT_JOB_NOT_FOUND", "No print job found for the provided jobId.")

        return JSONObject().apply {
            put("ok", true)
            put("jobId", job.jobId)
            put("orderId", job.orderId)
            put("state", job.state.name)
            put("attemptCount", job.attemptCount)
            put("maxAttempts", job.maxAttempts)
            put("errorCode", job.errorCode ?: JSONObject.NULL)
            put("errorMessage", job.errorMessage ?: JSONObject.NULL)
            put("updatedAt", job.updatedAtEpochMs)
            put("createdAt", job.createdAtEpochMs)
        }
    }


    fun retryPrint(jobId: String): JSONObject {
        if (jobId.isBlank()) {
            return fail("INVALID_JOB_ID", "jobId is required.")
        }

        val current = printJobDao.getById(jobId)
            ?: return fail("PRINT_JOB_NOT_FOUND", "No print job found for the provided jobId.")

        if (current.state != PrintJobState.NEEDS_ATTENTION) {
            return fail("PRINT_JOB_NOT_RETRYABLE", "Print job is not in a retryable state.")
        }

        val retried = printQueueOrchestrator.retryPrint(jobId)
            ?: return fail("PRINT_JOB_NOT_FOUND", "No print job found for the provided jobId.")

        return JSONObject().apply {
            put("ok", true)
            put("queued", true)
            put("jobId", retried.jobId)
            put("orderId", retried.orderId)
            put("state", retried.state.name)
            put("message", "Print job re-queued.")
        }
    }

    private fun executeTransportPrintReceipt(printJobJson: String?): JSONObject {
        val selection = transportSelector.select(activeTransportMode)
        Log.i(TAG, "printReceipt transport_selected mode=${selection.mode}")
        val response = selection.transport.printReceipt(ReceiptRenderContext(printJobJson)).response
        if (!response.has("transport")) {
            response.put("transport", selection.mode)
        }
        return response
    }

    private fun printReceiptWithAidl(renderContext: ReceiptRenderContext): JSONObject {
        val printJobJson = renderContext.printJobJson
        if (printJobJson.isNullOrBlank()) {
            return fail("INVALID_PRINT_JOB", "printJob JSON is required.")
        }

        Log.i(TAG, "native printReceipt entry payloadLength=${printJobJson.length}")

        val printJobRoot = try {
            JSONObject(printJobJson)
        } catch (t: Throwable) {
            return fail("INVALID_PRINT_JOB_JSON", "printJob JSON is malformed.", t.message)
        }

        val printJob = printJobRoot.optJSONObject("printJob") ?: printJobRoot
        val displayModel = printJob.optJSONObject("displayModel")
        val formattingHints = printJob.optJSONObject("formattingHints")
        val requestedOutputStrategyRaw = firstNonBlank(
            formattingHints?.optString("outputStrategy"),
            formattingHints?.optString("printerOutputMode"),
            printJob.optString("printerOutputMode"),
        ).lowercase(Locale.ROOT)
        val forcedOutputStrategy = FORCE_OUTPUT_STRATEGY.trim().lowercase(Locale.ROOT)
        val requestedOutputStrategy = if (forcedOutputStrategy.isNotBlank()) forcedOutputStrategy else requestedOutputStrategyRaw
        Log.i(
            TAG,
            "native_requested_output_strategy requested=$requestedOutputStrategyRaw forced=$forcedOutputStrategy effective=$requestedOutputStrategy",
        )

        val bitmapExperimentRequested = requestedOutputStrategy == "bitmap" || requestedOutputStrategy == "bitmap_experiment"
        val bitmapSmokeTestRequested = requestedOutputStrategy == "bitmap_smoke_test"
        val textInitFirstRequested = requestedOutputStrategy == "text_init_first" || requestedOutputStrategy == "text_init_first_single_block"
        val bitmapInitFirstRequested = bitmapSmokeTestRequested || requestedOutputStrategy == "bitmap_init_first"
        val bitmapChunksAsciiTestRequested = requestedOutputStrategy == "bitmap_chunks_ascii_test"
        val syntheticTextTestRequested = requestedOutputStrategy.startsWith("text_test_")
        val knownTextStrategies = setOf(
            "",
            "text_single_block_center_rawfeed",
            "text_single_block_left_rawfeed",
            "text_sections_left_linewrap",
            "text_sections_left_mixedfeed",
            "text_sections_left_rawfeed",
            "text_test_1line_rawfeed",
            "text_test_3lines_rawfeed",
            "text_test_10lines_rawfeed",
            "text_test_10lines_sections_rawfeed",
            "text_init_first",
            "text_init_first_single_block",
        )
        val knownBitmapStrategies = setOf("bitmap", "bitmap_experiment", "bitmap_smoke_test", "bitmap_init_first", "bitmap_chunks_ascii_test")
        if (requestedOutputStrategy.isNotBlank() &&
            requestedOutputStrategy !in knownTextStrategies &&
            requestedOutputStrategy !in knownBitmapStrategies
        ) {
            Log.e(TAG, "printReceipt invalid_output_strategy value=$requestedOutputStrategy")
            return fail("INVALID_OUTPUT_STRATEGY", "Unsupported outputStrategy: $requestedOutputStrategy")
        }

        val serviceBound = ensureServiceBound(2000)
        val service = printerService
        if (!serviceBound || service == null) {
            Log.e(TAG, "printReceipt: printer service not bound")
            return fail("SUNMI_SERVICE_UNAVAILABLE", "Sunmi printer service is unavailable or not bound.")
        }

        if (!PRINT_IN_PROGRESS.compareAndSet(false, true)) {
            Log.w(TAG, "print_lifecycle gate=busy_new_job_rejected reason=previous_job_not_settled")
            return fail("SUNMI_PRINT_BUSY", "Previous print job may still be active. Retry shortly.")
        }

        val orderNumber = firstNonBlank(
            printJob.optString("orderNumber"),
            printJob.optString("order_number"),
            printJob.optString("orderId"),
            printJob.optString("order_id"),
        )

        val restaurant = printJob.optJSONObject("restaurant") ?: JSONObject()
        val lines = when {
            printJob.has("lines") -> printJob.optJSONArray("lines") ?: JSONArray()
            printJob.has("items") -> printJob.optJSONArray("items") ?: JSONArray()
            else -> JSONArray()
        }
        val totals = printJob.optJSONObject("totals")
        val notes = printJob.optString("notes")
        val itemsSource = firstNonBlank(printJob.optString("itemsSource"), "unknown")
        val customerName = firstNonBlank(printJob.optString("customerName"), printJob.optString("customer_name"))
        val createdAt = firstNonBlank(printJob.optString("createdAtIso"), printJob.optString("created_at_iso"), printJob.optString("createdAt"))
        val customerPhone = firstNonBlank(printJob.optString("customerPhone"), printJob.optString("customer_phone"))
        val customerAddress = firstNonBlank(printJob.optString("customerAddress"), printJob.optString("customer_address"))
        val customerTotalOrderCount = when {
            printJob.has("customerTotalOrderCount") -> printJob.optInt("customerTotalOrderCount", 0)
            printJob.has("customer_total_order_count") -> printJob.optInt("customer_total_order_count", 0)
            printJob.has("customerOrderCount") -> printJob.optInt("customerOrderCount", 0) + 1
            printJob.has("customer_order_count") -> printJob.optInt("customer_order_count", 0) + 1
            else -> 0
        }
        val orderTypeRaw = firstNonBlank(printJob.optString("orderType"), printJob.optString("order_type"))
        val paymentMethodRaw = firstNonBlank(printJob.optString("paymentMethod"), printJob.optString("payment_method"))
        val totalAmountFallback = when {
            printJob.has("total_amount") -> printJob.optDouble("total_amount", Double.NaN)
            printJob.has("totalAmount") -> printJob.optDouble("totalAmount", Double.NaN)
            else -> Double.NaN
        }

        val parsedNotes = parseStructuredNotes(notes)
        val orderType = formatOrderType(firstNonBlank(orderTypeRaw, parsedNotes.type))
        val paymentMethod = formatPaymentMethod(firstNonBlank(paymentMethodRaw, parsedNotes.paymentMethod))
        val finalPhone = firstNonBlank(customerPhone, parsedNotes.phone)
        val finalAddress = firstNonBlank(customerAddress, parsedNotes.address)

        if (orderNumber.isBlank() || lines.length() == 0) {
            Log.e(TAG, "native printReceipt invalid payload orderNumber='$orderNumber' lines=${lines.length()}")
            return fail("INVALID_PRINT_JOB_CONTENT", "printJob must include order number and at least one line item.")
        }

        return try {
            Log.i(TAG, "printReceipt attempt order=$orderNumber lines=${lines.length()}")
            val renderedLines = mutableListOf<String>()
            val callbackErrors = mutableListOf<String>()
            var callbackObservedThisAttempt = false
            val callbackEverObservedBeforeAttempt = CALLBACK_OBSERVED_EVER.get()
            Log.i(TAG, "runtime_path ui_click->printAcceptedOrder->toPrintJob->printerAdapter->SunmiBridge->SunmiPrinterManager.printReceipt")

            fun callbackFor(op: String): ICallback {
                return object : ICallback.Stub() {
                    override fun onRunResult(isSuccess: Boolean) {
                        callbackObservedThisAttempt = true
                        CALLBACK_OBSERVED_EVER.set(true)
                        Log.i(TAG, "low_level_callback op=$op onRunResult success=$isSuccess")
                    }

                    override fun onReturnString(result: String?) {
                        callbackObservedThisAttempt = true
                        CALLBACK_OBSERVED_EVER.set(true)
                        Log.i(TAG, "low_level_callback op=$op onReturnString result=${result ?: ""}")
                    }

                    override fun onRaiseException(code: Int, msg: String?) {
                        val err = "op=$op code=$code msg=${msg ?: ""}"
                        callbackErrors += err
                        Log.e(TAG, "low_level_callback onRaiseException $err")
                    }
                }
            }

            fun runPrinterInit(stage: String) {
                if (!INIT_FIRST_EXPERIMENT_ENABLED) {
                    Log.i(TAG, "low_level_call printerInit stage=$stage enabled=false")
                    return
                }
                Log.i(TAG, "low_level_call printerInit stage=$stage enabled=true")
                runCatching { service.printerInit(callbackFor("printerInit_$stage")) }
                    .onFailure { err -> Log.w(TAG, "low_level_call printerInit stage=$stage failed=${err.message ?: "unknown"}") }
                Thread.sleep(INIT_FIRST_DELAY_MS)
                Log.i(TAG, "low_level_call printerInit stage=$stage settle_ms=$INIT_FIRST_DELAY_MS")
            }

            fun pushRenderedLine(line: String) {
                renderedLines += line
            }

            val displayModelSections = displayModel?.optJSONArray("displaySections")
            val displayModelReceiptLines = displayModel?.optJSONArray("receiptLines")
            val useDisplayModel = displayModelReceiptLines != null && displayModelReceiptLines.length() > 0
            val hasArticlesSectionInDisplaySections = containsArticlesSection(displayModelSections)
            val hasArticlesInReceiptLines = containsArticlesLine(displayModelReceiptLines)
            Log.i(TAG, "display_model_usage printed_from_display_model=${printJob.optBoolean("printed_from_display_model", false)} useDisplayModel=$useDisplayModel hasDisplaySections=${displayModelSections != null} hasArticlesSectionInDisplaySections=$hasArticlesSectionInDisplaySections hasArticlesInReceiptLines=$hasArticlesInReceiptLines receiptLinesCount=${displayModelReceiptLines?.length() ?: 0}")

            if (TEXT_PATH_PRINTER_INIT_ENABLED || textInitFirstRequested) {
                runPrinterInit("before_text")
            }
            // Keep buffer mode disabled on V2s due previous instability; init-first experiment is now enabled before text dispatch.
            Log.i(
                TAG,
                "receipt_path mode=no_buffer_live_text printerInit=true bufferApi=false fontSizeStyling=skipped_v2s_compat sequence=printerInit->setAlignment->printTextSingleBlock->lineWrap",
            )
            Log.i(TAG, "low_level_call setAlignment alignment=1")
            service.setAlignment(1, callbackFor("setAlignment"))
            Log.i(TAG, "receipt_style fontSize skipped reason=v2s_illegal_parameter")
            if (syntheticTextTestRequested) {
                val syntheticRaw = buildSyntheticAsciiTestText(requestedOutputStrategy)
                val syntheticAscii = toStrictAsciiOnly(syntheticRaw)
                syntheticAscii.split("\n")
                    .map { it.trimEnd() }
                    .filter { it.isNotBlank() }
                    .forEach { line -> pushRenderedLine(line) }
                Log.i(TAG, "synthetic_text_test_payload strategy=$requestedOutputStrategy lines=${renderedLines.size} content=${renderedLines.joinToString(" | ")}")
            } else if (useDisplayModel) {
                for (i in 0 until displayModelReceiptLines!!.length()) {
                    val line = displayModelReceiptLines.optString(i)
                    if (line.isNotBlank()) pushRenderedLine(line)
                }
            } else {
                val restaurantName = firstNonBlank(restaurant.optString("name"), printJob.optString("restaurantName"))
                if (restaurantName.isNotBlank()) {
                    pushRenderedLine(restaurantName)
                }
                Log.i(TAG, "low_level_call setAlignment alignment=0")
                service.setAlignment(0, callbackFor("setAlignment"))
                pushRenderedLine("Order: $orderNumber")
                if (orderType.isNotBlank()) {
                    pushRenderedLine("Type: $orderType")
                }
                if (paymentMethod.isNotBlank()) {
                    pushRenderedLine("Paiement: $paymentMethod")
                }
                if (customerName.isNotBlank()) {
                    pushRenderedLine("Client: $customerName")
                }
                if (finalPhone.isNotBlank()) {
                    pushRenderedLine("Tel: $finalPhone")
                }
                if (finalAddress.isNotBlank()) {
                    pushRenderedLine("Adresse: $finalAddress")
                }
                val formattedCreatedAt = formatTicketDateTime(createdAt)
                if (formattedCreatedAt.isNotBlank()) {
                    pushRenderedLine("Date/Heure: $formattedCreatedAt")
                }
                if (customerTotalOrderCount > 0) {
                    pushRenderedLine("Historique client: $customerTotalOrderCount commande(s)")
                }
                pushRenderedLine("------------------------------")

                for (i in 0 until lines.length()) {
                    val item = lines.optJSONObject(i) ?: continue
                    val quantity = item.optInt("quantity", 1)
                    val name = firstNonBlank(item.optString("name"), item.optString("title"), "Article")
                    val totalPrice = when {
                        item.has("totalPrice") -> item.optDouble("totalPrice", 0.0)
                        item.has("total_price") -> item.optDouble("total_price", 0.0)
                        item.has("lineTotal") -> item.optDouble("lineTotal", 0.0)
                        item.has("line_total") -> item.optDouble("line_total", 0.0)
                        item.has("price") -> item.optDouble("price", 0.0) * quantity
                        item.has("unitPrice") -> item.optDouble("unitPrice", 0.0) * quantity
                        item.has("unit_price") -> item.optDouble("unit_price", 0.0) * quantity
                        else -> Double.NaN
                    }

                    val lineText = if (!totalPrice.isNaN()) {
                        "$quantity x $name  ${"%.2f".format(totalPrice)}"
                    } else {
                        "$quantity x $name"
                    }
                    pushRenderedLine(lineText)

                    val modifiers = item.optJSONArray("modifiers")
                    if (modifiers != null && modifiers.length() > 0) {
                        for (j in 0 until modifiers.length()) {
                            val modifier = modifiers.optString(j)
                            if (modifier.isNotBlank()) {
                                pushRenderedLine("  + $modifier")
                            }
                        }
                    }

                    val itemNote = firstNonBlank(item.optString("note"), item.optString("notes"))
                    if (itemNote.isNotBlank()) {
                        pushRenderedLine("  note: $itemNote")
                    }
                }

                pushRenderedLine("------------------------------")
                val hasTotalsObject = totals != null && totals.has("total")
                val total = when {
                    hasTotalsObject -> totals!!.optDouble("total", 0.0)
                    !totalAmountFallback.isNaN() -> totalAmountFallback
                    else -> Double.NaN
                }
                if (!total.isNaN()) {
                    val currency = if (hasTotalsObject) totals!!.optString("currency", "CHF") else "CHF"
                    Log.i(TAG, "low_level_call setAlignment alignment=2")
                    service.setAlignment(2, callbackFor("setAlignment"))
                    pushRenderedLine("TOTAL: ${"%.2f".format(total)} $currency")
                    Log.i(TAG, "low_level_call setAlignment alignment=0")
                    service.setAlignment(0, callbackFor("setAlignment"))
                }

                if (parsedNotes.extraNote.isNotBlank()) {
                    pushRenderedLine("Notes: ${parsedNotes.extraNote}")
                }
            }

            val renderedReceiptTextRaw = renderedLines.joinToString("\n")
            Log.i(TAG, "rendered_receipt_text_raw_start\n$renderedReceiptTextRaw\nrendered_receipt_text_raw_end")
            val itemsWithName = (0 until lines.length()).count { idx ->
                val item = lines.optJSONObject(idx)
                item != null && firstNonBlank(item.optString("name"), item.optString("title")).isNotBlank()
            }
            val itemsWithPrice = (0 until lines.length()).count { idx ->
                val item = lines.optJSONObject(idx)
                item != null && (
                    item.has("totalPrice") || item.has("total_price") || item.has("lineTotal") || item.has("line_total") ||
                        item.has("price") || item.has("unitPrice") || item.has("unit_price")
                    )
            }
            Log.i(
                TAG,
                "receipt_payload_integrity itemsCount=${lines.length()} itemsWithName=$itemsWithName itemsWithPrice=$itemsWithPrice itemsSource=$itemsSource derivedFromUiOrderData=true",
            )

            val asciiReceiptText = if (syntheticTextTestRequested) toStrictAsciiOnly(renderedReceiptTextRaw) else toAsciiSafeReceiptText(renderedReceiptTextRaw)
            val asciiNormalized = asciiReceiptText != renderedReceiptTextRaw
            val trailingNewlinesBeforeTrim = asciiReceiptText.reversed().takeWhile { it == '\n' }.length
            val coreReceiptText = asciiReceiptText.trimEnd('\r', '\n')
            val trailingNewlinesTrimmed = asciiReceiptText.length - coreReceiptText.length
            val topMarginLines = 2
            val bottomMarginLines = 36
            val finalReceiptBlock = "\n".repeat(topMarginLines) + coreReceiptText + "\n".repeat(bottomMarginLines)
            val trailingNewlinesInFinalBlock = finalReceiptBlock.reversed().takeWhile { it == '\n' }.length
            val finalBlockEndsWithNewline = finalReceiptBlock.endsWith("\n")
            val finalTextContainsArticles = coreReceiptText.lineSequence().any { it.trim().equals("Articles:", ignoreCase = true) }
            val finalTextLineCount = coreReceiptText.lineSequence().count()
            val finalTextCharLength = coreReceiptText.length
            Log.i(TAG, "rendered_receipt_text_ascii_start\n$asciiReceiptText\nrendered_receipt_text_ascii_end")
            Log.i(TAG, "receipt_articles_presence finalTextContainsArticles=$finalTextContainsArticles")
            Log.i(TAG, "receipt_text_metrics finalTextLineCount=$finalTextLineCount finalTextCharLength=$finalTextCharLength")

            if (bitmapExperimentRequested || bitmapSmokeTestRequested || bitmapChunksAsciiTestRequested) {
                Log.i(TAG, "receipt_bitmap_experiment requested=true smokeTest=$bitmapSmokeTestRequested chunksTest=$bitmapChunksAsciiTestRequested initFirst=$bitmapInitFirstRequested strategy=$requestedOutputStrategy")
                runCatching {
                    val printerStateBeforeBitmap = runCatching { service.updatePrinterState() }.getOrDefault(-999)
                    runPrinterInit("before_bitmap")
                    Log.i(TAG, "low_level_call setAlignment alignment=1 primitive=printBitmap")
                    service.setAlignment(1, callbackFor("setAlignmentBitmap"))

                    var bitmapWidth = 0
                    var bitmapHeight = 0
                    var bitmapConfig = "UNKNOWN"
                    var bitmapIsMonochrome = false

                    if (bitmapChunksAsciiTestRequested) {
                        val chunkSource = toStrictAsciiOnly(buildSyntheticAsciiTestText("text_test_10lines_rawfeed")).lines().filter { it.isNotBlank() }
                        val chunks = chunkSource.chunked(BITMAP_CHUNK_LINES)
                        Log.i(TAG, "bitmap_chunk_test start chunks=${chunks.size} lines=${chunkSource.size} chunkLines=$BITMAP_CHUNK_LINES")
                        for ((chunkIdx, chunkLines) in chunks.withIndex()) {
                            val chunkBitmap = buildReceiptBitmap(chunkLines.joinToString("\n"))
                            bitmapWidth = chunkBitmap.width
                            bitmapHeight = chunkBitmap.height
                            bitmapConfig = chunkBitmap.config?.name ?: "UNKNOWN"
                            bitmapIsMonochrome = isBitmapMonochrome(chunkBitmap)
                            Log.i(TAG, "bitmap_chunk_diagnostics chunk=$chunkIdx width=$bitmapWidth height=$bitmapHeight config=$bitmapConfig monochrome=$bitmapIsMonochrome")
                            try {
                                service.printBitmap(chunkBitmap, callbackFor("printBitmapChunk_$chunkIdx"))
                                if (chunkIdx < chunks.lastIndex) {
                                    Thread.sleep(SECTION_INTER_DISPATCH_DELAY_MS)
                                    service.lineWrap(1, callbackFor("lineWrapAfterBitmapChunk_$chunkIdx"))
                                }
                            } finally {
                                chunkBitmap.recycle()
                            }
                        }
                    } else {
                        val bitmap = if (bitmapInitFirstRequested) buildBitmapSmokeTestImage() else buildReceiptBitmap(coreReceiptText)
                        bitmapWidth = bitmap.width
                        bitmapHeight = bitmap.height
                        bitmapConfig = bitmap.config?.name ?: "UNKNOWN"
                        bitmapIsMonochrome = isBitmapMonochrome(bitmap)
                        Log.i(TAG, "bitmap_diagnostics width=$bitmapWidth height=$bitmapHeight config=$bitmapConfig monochrome=$bitmapIsMonochrome hasAlpha=${bitmap.hasAlpha()}")
                        try {
                            Log.i(TAG, "low_level_call printBitmap width=$bitmapWidth height=$bitmapHeight")
                            service.printBitmap(bitmap, callbackFor("printBitmapReceipt"))
                            Log.i(TAG, "low_level_call printBitmap dispatched=true")
                        } finally {
                            bitmap.recycle()
                        }
                    }

                    val bitmapFeedLines = 6
                    val rawFeedCmd = byteArrayOf(0x1B, 0x64, bitmapFeedLines.coerceIn(0, 255).toByte())
                    val bitmapFeedPrimitive = runCatching {
                        Log.i(TAG, "low_level_call finalFeed after_printBitmap primitive=raw_esc_d lines=$bitmapFeedLines")
                        service.sendRAWData(rawFeedCmd, callbackFor("sendRawDataBitmapFinalFeed"))
                        "raw_esc_d"
                    }.getOrElse {
                        Log.w(TAG, "low_level_call finalFeed after_printBitmap raw_failed=true fallback=lineWrap")
                        service.lineWrap(bitmapFeedLines, callbackFor("lineWrapBitmapFinalFeed"))
                        "lineWrap"
                    }
                    Log.i(TAG, "bitmap_final_feed usedPrimitive=$bitmapFeedPrimitive")
                    Thread.sleep(BITMAP_SETTLE_WAIT_MS)

                    if (callbackErrors.isNotEmpty()) {
                        throw IllegalStateException("bitmap callback errors: ${callbackErrors.joinToString(" | ")}")
                    }

                    val printerStateAfterBitmap = runCatching { service.updatePrinterState() }.getOrDefault(-999)
                    Log.i(TAG, "receipt_bitmap_experiment success=true stateBefore=$printerStateBeforeBitmap stateAfter=$printerStateAfterBitmap")
                    return JSONObject().apply {
                        put("ok", true)
                        put("code", "PRINT_SENT")
                        put("message", when {
                            bitmapChunksAsciiTestRequested -> "Bitmap chunk test commands sent to Sunmi service."
                            bitmapSmokeTestRequested -> "Bitmap smoke-test commands sent to Sunmi service."
                            else -> "Bitmap print commands sent to Sunmi service."
                        })
                        put("orderNumber", orderNumber)
                        put("lineCount", lines.length())
                        put("renderedLineCount", renderedLines.size)
                        put("renderedReceiptText", renderedReceiptTextRaw)
                        put("strategyName", when {
                            bitmapChunksAsciiTestRequested -> "bitmap_chunks_ascii_test"
                            bitmapSmokeTestRequested -> "bitmap_smoke_test_2lines"
                            else -> "bitmap_single_image_with_linewrap_feed"
                        })
                        put("sequencingMode", "deterministic_nonbuffer_single_bitmap")
                        put("mainContentPrimitive", "printBitmap")
                        put("feedPrimitive", "raw_esc_d_with_linewrap_fallback")
                        put("printerStateBeforePrint", printerStateBeforeBitmap)
                        put("printerStateAfterFeed", printerStateAfterBitmap)
                        put("callbackObservedThisAttempt", callbackObservedThisAttempt)
                        put("callbackEverObservedOnDevice", CALLBACK_OBSERVED_EVER.get())
                        put("callbackErrors", JSONArray(callbackErrors))
                        put("bitmapExperimentRequested", bitmapExperimentRequested)
                        put("bitmapSmokeTestRequested", bitmapSmokeTestRequested)
                        put("bitmapChunksAsciiTestRequested", bitmapChunksAsciiTestRequested)
                        put("bitmapInitFirstRequested", bitmapInitFirstRequested)
                        put("bitmapConfig", bitmapConfig)
                        put("bitmapMonochrome", bitmapIsMonochrome)
                        put("bitmapWidthPx", bitmapWidth)
                        put("bitmapHeightPx", bitmapHeight)
                        put("finalTextLineCount", finalTextLineCount)
                        put("finalTextCharLength", finalTextCharLength)
                    }
                }.onFailure { bitmapErr ->
                    Log.w(TAG, "receipt_bitmap_experiment failed -> fallback_to_text reason=${bitmapErr.message ?: "unknown"}")
                    callbackErrors.clear()
                }
            }
            val textStrategyName = when (requestedOutputStrategy) {
                "", "text_single_block_center_rawfeed", "text_init_first", "text_init_first_single_block" -> {
                    if (requestedOutputStrategy.isBlank()) {
                        Log.w(
                            TAG,
                            "output_strategy_fallback requested=$requestedOutputStrategyRaw fallback=text_single_block_center_rawfeed reason=missing_or_unrecognized_strategy",
                        )
                    }
                    "text_single_block_center_rawfeed"
                }
                "text_single_block_left_rawfeed" -> "text_single_block_left_rawfeed"
                "text_sections_left_linewrap" -> "text_sections_left_linewrap"
                "text_sections_left_mixedfeed" -> "text_sections_left_mixedfeed"
                "text_sections_left_rawfeed" -> "text_sections_left_rawfeed"
                "text_test_1line_rawfeed" -> "text_test_1line_rawfeed"
                "text_test_3lines_rawfeed" -> "text_test_3lines_rawfeed"
                "text_test_10lines_rawfeed" -> "text_test_10lines_rawfeed"
                "text_test_10lines_sections_rawfeed" -> "text_test_10lines_sections_rawfeed"
                else -> {
                    Log.e(TAG, "printReceipt unsupported_text_strategy value=$requestedOutputStrategy")
                    return fail("INVALID_OUTPUT_STRATEGY", "Unsupported text outputStrategy: $requestedOutputStrategy")
                }
            }
            val isSyntheticTextTest = textStrategyName.startsWith("text_test_")
            val syntheticAsciiText = if (isSyntheticTextTest) buildSyntheticAsciiTestText(textStrategyName) else ""
            val dispatchTextCore = if (isSyntheticTextTest) toStrictAsciiOnly(syntheticAsciiText) else coreReceiptText
            val useSectionDispatch = textStrategyName == "text_sections_left_linewrap" ||
                textStrategyName == "text_sections_left_mixedfeed" ||
                textStrategyName == "text_sections_left_rawfeed" ||
                textStrategyName == "text_test_10lines_sections_rawfeed"
            val mixedSectionFeed = textStrategyName == "text_sections_left_mixedfeed"
            val leftAlignedDispatch = textStrategyName != "text_single_block_center_rawfeed"
            val finalFeedModeLineWrap = textStrategyName == "text_sections_left_linewrap"
            val callbackReliableForV2sPath = false
            val strategyName = textStrategyName
            val sequencingMode = if (useSectionDispatch) "deterministic_nonbuffer_sections" else "deterministic_nonbuffer_single_block"
            val completionBoundary = "single_dispatch_plus_settle_wait"
            val bufferApiRuledOutByDeviceCrash = true
            val primitiveStatusWorksNoCrash = "setAlignment,printText,sendRAWData,lineWrap"
            val primitiveStatusUnreliable = "printOriginalText_content_output"
            val primitiveStatusCrashes = "enterPrinterBuffer(clean=true)"
            val usesTimeoutFallback = false
            val usesSeparatePostFeedPrintText = false
            val usesLineWrapPostFeed = mixedSectionFeed
            val usesSecondPrintTextCall = useSectionDispatch
            val mainContentPrimitive = if (useSectionDispatch) "printText_sectioned" else "printText_single_block"
            val finalFeedEnabled = true
            val finalFeedLineCount = 6
            val finalFeedPrimitive = if (finalFeedModeLineWrap) "lineWrap" else "raw_esc_d"
            val fallbackFeedPrimitive = "lineWrap"
            val finalFeedReason = if (finalFeedModeLineWrap) "linewrap_selected_for_strategy" else "explicit_post_content_advance"
            val settleWaitMs = TEXT_PATH_SETTLE_WAIT_MS
            val sectionTexts = if (useSectionDispatch) buildTextSections(dispatchTextCore) else listOf(finalReceiptBlockForStrategy(dispatchTextCore))
            val sectionCount = sectionTexts.size
            val sectionLengthSummary = sectionTexts.mapIndexed { secIdx, sec -> "s$secIdx:${sec.length}" }.joinToString(",")
            val sectionGapSummary = if (useSectionDispatch) "section_gap_ms:$SECTION_INTER_DISPATCH_DELAY_MS" else "single_block:0"
            val alignment = if (leftAlignedDispatch) 0 else 1
            val dispatchOperationCount = sectionCount + if (finalFeedEnabled) 1 else 0

            Log.i(
                TAG,
                "receipt_path text_strategy=$textStrategyName syntheticTest=$isSyntheticTextTest asciiNormalized=$asciiNormalized topMarginLines=$topMarginLines bottomMarginLines=$bottomMarginLines blockLength=${finalReceiptBlock.length} trailingNewlinesBeforeTrim=$trailingNewlinesBeforeTrim trailingNewlinesTrimmed=$trailingNewlinesTrimmed trailingNewlinesInFinalBlock=$trailingNewlinesInFinalBlock finalBlockEndsWithNewline=$finalBlockEndsWithNewline",
            )
            Log.i(
                TAG,
                "receipt_callback_reliability callbackEverObservedBeforeAttempt=$callbackEverObservedBeforeAttempt callbackReliableForV2sPath=$callbackReliableForV2sPath mode=$sequencingMode strategy=$strategyName",
            )
            Log.i(
                TAG,
                "receipt_dispatch_plan operationCount=$dispatchOperationCount strategy=$strategyName sectionCount=$sectionCount sectionLengths=$sectionLengthSummary sectionGapsMs=$sectionGapSummary sequencingMode=$sequencingMode mainContentPrimitive=$mainContentPrimitive usesTimeoutFallback=$usesTimeoutFallback secondPrintTextUsed=$usesSecondPrintTextCall finalFeedEnabled=$finalFeedEnabled finalFeedPrimitive=$finalFeedPrimitive finalFeedLineCount=$finalFeedLineCount settleWaitMs=$settleWaitMs",
            )
            Log.i(TAG, "receipt_buffer_strategy considered=true enabled=false ruledOutByDeviceCrash=$bufferApiRuledOutByDeviceCrash reason=enterPrinterBuffer_null_pointer_in_sunmi_service")
            Log.i(TAG, "receipt_primitive_matrix worksNoCrash=$primitiveStatusWorksNoCrash unreliable=$primitiveStatusUnreliable crashes=$primitiveStatusCrashes")

            val printerStateBeforePrint = runCatching { service.updatePrinterState() }.getOrDefault(-999)
            Log.i(TAG, "printer_state_checkpoint stage=before_print stateCode=$printerStateBeforePrint")

            Log.i(TAG, "low_level_call setAlignment alignment=$alignment strategy=$strategyName")
            service.setAlignment(alignment, callbackFor("setAlignmentTextStrategy"))
            val mainStartAt = System.currentTimeMillis()
            if (useSectionDispatch) {
                for ((secIdx, sectionText) in sectionTexts.withIndex()) {
                    Log.i(TAG, "low_level_call printText section=$secIdx length=${sectionText.length} strategy=$strategyName")
                    service.printText(sectionText, callbackFor("printTextSection_$secIdx"))
                    if (mixedSectionFeed && secIdx < sectionTexts.lastIndex) {
                        Thread.sleep(SECTION_INTER_DISPATCH_DELAY_MS)
                        Log.i(TAG, "low_level_call lineWrap inter_section lines=1 section=$secIdx strategy=$strategyName")
                        service.lineWrap(1, callbackFor("lineWrapInterSection_$secIdx"))
                    }
                    if (secIdx < sectionTexts.lastIndex) {
                        Thread.sleep(SECTION_INTER_DISPATCH_DELAY_MS)
                    }
                }
            } else {
                Log.i(TAG, "low_level_call printText start_at_ms=$mainStartAt payloadLength=${finalReceiptBlockForStrategy(dispatchTextCore).length} mainContentPrimitive=$mainContentPrimitive")
                service.printText(finalReceiptBlockForStrategy(dispatchTextCore), callbackFor("printTextSingleBlock"))
            }
            val mainEndAt = System.currentTimeMillis()
            Log.i(TAG, "low_level_call printText dispatch_end_at_ms=$mainEndAt dispatch_duration_ms=${mainEndAt - mainStartAt}")

            var usedFeedPrimitive = if (finalFeedEnabled) finalFeedPrimitive else "none"
            if (finalFeedEnabled) {
                val feedStartAt = System.currentTimeMillis()
                Log.i(TAG, "low_level_call finalFeed start_at_ms=$feedStartAt primitive=$finalFeedPrimitive lines=$finalFeedLineCount reason=$finalFeedReason")
                usedFeedPrimitive = if (finalFeedModeLineWrap) {
                    service.lineWrap(finalFeedLineCount, callbackFor("lineWrapFinalFeed"))
                    finalFeedPrimitive
                } else {
                    val rawFeedCmd = byteArrayOf(0x1B, 0x64, finalFeedLineCount.coerceIn(0, 255).toByte())
                    runCatching {
                        service.sendRAWData(rawFeedCmd, callbackFor("sendRawDataFinalFeed"))
                        finalFeedPrimitive
                    }.getOrElse { rawErr ->
                        Log.w(TAG, "low_level_call finalFeed raw_failed=true fallbackPrimitive=$fallbackFeedPrimitive msg=${rawErr.message ?: "unknown"}")
                        service.lineWrap(finalFeedLineCount, callbackFor("lineWrapFinalFeedFallback"))
                        fallbackFeedPrimitive
                    }
                }
                val feedEndAt = System.currentTimeMillis()
                Log.i(TAG, "low_level_call finalFeed dispatch_end_at_ms=$feedEndAt dispatch_duration_ms=${feedEndAt - feedStartAt} usedFeedPrimitive=$usedFeedPrimitive")
            }

            Thread.sleep(settleWaitMs)
            val printerStateAfterFeed = runCatching { service.updatePrinterState() }.getOrDefault(-999)
            Log.i(TAG, "printer_state_checkpoint stage=after_feed stateCode=$printerStateAfterFeed settleWaitMs=$settleWaitMs")

            val callbackEverObservedAfterAttempt = CALLBACK_OBSERVED_EVER.get()
            Log.i(
                TAG,
                "receipt_completion_summary strategy=$strategyName sequencingMode=$sequencingMode usesTimeoutFallback=$usesTimeoutFallback completionBoundary=$completionBoundary callbackObservedThisAttempt=$callbackObservedThisAttempt callbackEverObservedAfterAttempt=$callbackEverObservedAfterAttempt secondPrintTextUsed=$usesSecondPrintTextCall mainContentPrimitive=$mainContentPrimitive usedFeedPrimitive=$usedFeedPrimitive successBoundaryReason=strategy_dispatch_with_feed",
            )
            val operationSequence = if (finalFeedEnabled) "setAlignment->printText(${if (useSectionDispatch) "sections" else "single"})->${usedFeedPrimitive}" else "setAlignment->printText"
            Log.i(TAG, "receipt_operation_sequence sequence=$operationSequence operationCount=$dispatchOperationCount")
            Log.i(
                TAG,
                "receipt_path mode=no_buffer_print_text_content completed_calls=${if (finalFeedEnabled) "setAlignment,printText,finalFeed" else "setAlignment,printText"} fontSizeStyling=skipped_v2s_compat strategy=$strategyName",
            )

            if (callbackErrors.isNotEmpty()) {
                return fail(
                    "SUNMI_PRINT_CALLBACK_ERROR",
                    "Printer service returned callback errors.",
                    callbackErrors.joinToString(" | "),
                )
            }

            Log.i(TAG, "printReceipt success order=$orderNumber")
            JSONObject().apply {
                put("ok", true)
                put("code", "PRINT_SENT")
                put("message", "Print commands sent to Sunmi service.")
                put("orderNumber", orderNumber)
                put("lineCount", lines.length())
                put("renderedLineCount", renderedLines.size)
                put("renderedReceiptText", renderedReceiptTextRaw)
                put("strategyName", strategyName)
                put("sequencingMode", sequencingMode)
                put("usesTimeoutFallback", usesTimeoutFallback)
                put("bufferApiRuledOutByDeviceCrash", bufferApiRuledOutByDeviceCrash)
                put("primitiveStatusWorksNoCrash", primitiveStatusWorksNoCrash)
                put("primitiveStatusUnreliable", primitiveStatusUnreliable)
                put("primitiveStatusCrashes", primitiveStatusCrashes)
                put("callbackReliableForV2sPath", callbackReliableForV2sPath)
                put("callbackObservedThisAttempt", callbackObservedThisAttempt)
                put("callbackEverObservedOnDevice", CALLBACK_OBSERVED_EVER.get())
                put("secondPrintTextUsed", usesSecondPrintTextCall)
                put("mainContentPrimitive", mainContentPrimitive)
                put("feedPrimitive", usedFeedPrimitive)
                put("feedPrimitiveReason", finalFeedReason)
                put("textInitFirstRequested", textInitFirstRequested)
                put("sectionCount", sectionCount)
                put("sectionLengths", sectionLengthSummary)
                put("sectionGapsMs", sectionGapSummary)
                put("finalTextLineCount", finalTextLineCount)
                put("finalTextCharLength", finalTextCharLength)
                put("printerStateBeforePrint", printerStateBeforePrint)
                put("printerStateAfterFeed", printerStateAfterFeed)
                put("successBoundary", completionBoundary)
                put("settleWaitMs", settleWaitMs)
                put("callbackErrors", JSONArray(callbackErrors))
            }
        } catch (e: RemoteException) {
            Log.e(TAG, "printReceipt remote error", e)
            fail("SUNMI_PRINT_REMOTE_ERROR", "Remote printer service error.", e.message)
        } catch (t: Throwable) {
            Log.e(TAG, "printReceipt failed", t)
            fail("SUNMI_PRINT_FAILED", "Print attempt failed.", t.message)
        } finally {
            PRINT_IN_PROGRESS.set(false)
        }
    }

    fun openCashDrawer(): JSONObject {
        val serviceBound = ensureServiceBound(1200)
        val service = printerService

        if (!serviceBound || service == null) {
            return fail("SUNMI_SERVICE_UNAVAILABLE", "Sunmi printer service is unavailable or not bound.")
        }

        return try {
            // Not all Sunmi models support drawer kick; attempt and return real result.
            service.openDrawer(null)
            JSONObject().apply {
                put("ok", true)
                put("code", "CASH_DRAWER_COMMAND_SENT")
                put("message", "Cash drawer command sent to Sunmi service.")
            }
        } catch (e: RemoteException) {
            fail("CASH_DRAWER_REMOTE_ERROR", "Cash drawer command failed in remote service.", e.message)
        } catch (t: Throwable) {
            fail("CASH_DRAWER_UNSUPPORTED", "Cash drawer operation unsupported or failed.", t.message)
        }
    }

    private fun bindPrinterServiceAsync() {
        if (printerService != null || isBinding.get()) return

        isBinding.set(true)

        val candidates = listOf(
            // Sunmi V2s / newer integrations often expose InnerPrinterService via this package/action.
            Intent().apply {
                setPackage("com.sunmi.peripheral.printer")
                action = "com.sunmi.peripheral.printer.InnerPrinterService"
            },
            Intent("com.sunmi.peripheral.printer.InnerPrinterService"),
            // Legacy woyou service fallback.
            Intent().apply {
                setPackage("woyou.aidlservice.jiuiv5")
                action = "woyou.aidlservice.jiuiv5.IWoyouService"
            },
            Intent("woyou.aidlservice.jiuiv5.IWoyouService"),
        )

        var finalBound = false
        for (intent in candidates) {
            val ok = runCatching {
                context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            }.getOrDefault(false)

            Log.i(TAG, "printer_bind_attempt action=${intent.action ?: ""} package=${intent.`package` ?: ""} bound=$ok")
            if (ok) {
                finalBound = true
                break
            }
        }

        if (!finalBound) {
            isBinding.set(false)
            Log.e(TAG, "Unable to bind Sunmi printer service")
        } else {
            Log.i(TAG, "Binding Sunmi printer service requested")
        }
    }

    private fun ensureServiceBound(timeoutMs: Long): Boolean {
        if (printerService != null) return true

        bindPrinterServiceAsync()
        if (printerService != null) return true

        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (printerService != null) return true
            try {
                Thread.sleep(100)
            } catch (_: InterruptedException) {
                break
            }
        }

        return printerService != null
    }

    private fun fail(code: String, message: String, details: String? = null): JSONObject {
        return JSONObject().apply {
            put("ok", false)
            put("code", code)
            put("message", message)
            if (!details.isNullOrBlank()) put("details", details)
        }
    }

    private fun buildReceiptBitmap(receiptText: String): Bitmap {
        val targetWidthPx = 384
        val horizontalPaddingPx = 16f
        val topPaddingPx = 16f
        val bottomPaddingPx = 48f
        val lineSpacingExtraPx = 6f

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 26f
            typeface = Typeface.MONOSPACE
        }

        val contentWidth = (targetWidthPx - horizontalPaddingPx * 2f).coerceAtLeast(120f)
        val wrappedLines = wrapTextForBitmap(receiptText, paint, contentWidth)
        val lineHeight = paint.fontSpacing + lineSpacingExtraPx
        val bitmapHeight = (topPaddingPx + bottomPaddingPx + (wrappedLines.size * lineHeight)).toInt().coerceAtLeast(200)

        val bitmap = Bitmap.createBitmap(targetWidthPx, bitmapHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        var y = topPaddingPx - paint.fontMetrics.ascent
        for (line in wrappedLines) {
            canvas.drawText(line, horizontalPaddingPx, y, paint)
            y += lineHeight
        }
        return bitmap
    }

    private fun wrapTextForBitmap(text: String, paint: Paint, maxWidthPx: Float): List<String> {
        val output = mutableListOf<String>()
        val normalizedLines = text.replace("\r\n", "\n").split('\n')
        for (rawLine in normalizedLines) {
            val line = rawLine.ifBlank { " " }
            if (paint.measureText(line) <= maxWidthPx) {
                output += line
                continue
            }

            val words = line.split(' ')
            var current = ""
            for (word in words) {
                val candidate = if (current.isBlank()) word else "$current $word"
                if (paint.measureText(candidate) <= maxWidthPx) {
                    current = candidate
                    continue
                }

                if (current.isNotBlank()) {
                    output += current
                }

                if (paint.measureText(word) <= maxWidthPx) {
                    current = word
                } else {
                    output += breakWordForBitmap(word, paint, maxWidthPx)
                    current = ""
                }
            }

            if (current.isNotBlank()) {
                output += current
            }
        }
        return output
    }

    private fun breakWordForBitmap(word: String, paint: Paint, maxWidthPx: Float): List<String> {
        val chunks = mutableListOf<String>()
        var current = ""
        for (ch in word) {
            val candidate = current + ch
            if (paint.measureText(candidate) <= maxWidthPx) {
                current = candidate
            } else {
                if (current.isNotBlank()) {
                    chunks += current
                }
                current = ch.toString()
            }
        }
        if (current.isNotBlank()) chunks += current
        return if (chunks.isEmpty()) listOf(" ") else chunks
    }

    private fun buildBitmapSmokeTestImage(): Bitmap {
        val widthPx = 384
        val heightPx = 160
        val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.RGB_565)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 34f
            typeface = Typeface.MONOSPACE
        }

        val baseline1 = 52f
        val baseline2 = 98f
        canvas.drawText("BITMAP TEST", 12f, baseline1, paint)
        canvas.drawText("ORDER 123", 12f, baseline2, paint)
        return bitmap
    }

    private fun isBitmapMonochrome(bitmap: Bitmap): Boolean {
        val stepX = (bitmap.width / 32).coerceAtLeast(1)
        val stepY = (bitmap.height / 32).coerceAtLeast(1)
        for (y in 0 until bitmap.height step stepY) {
            for (x in 0 until bitmap.width step stepX) {
                val px = bitmap.getPixel(x, y)
                val r = Color.red(px)
                val g = Color.green(px)
                val b = Color.blue(px)
                val isWhite = r >= 245 && g >= 245 && b >= 245
                val isBlack = r <= 10 && g <= 10 && b <= 10
                if (!isWhite && !isBlack) return false
            }
        }
        return true
    }

    private fun buildSyntheticAsciiTestText(strategyName: String): String {
        return when (strategyName) {
            "text_test_1line_rawfeed" -> "TEST LINE 1"
            "text_test_3lines_rawfeed" -> listOf(
                "TEST LINE 1",
                "TEST LINE 2",
                "TEST LINE 3",
            ).joinToString("\n")
            "text_test_10lines_rawfeed", "text_test_10lines_sections_rawfeed" ->
                (1..10).joinToString("\n") { idx -> "TEST LINE ${idx.toString().padStart(2, '0')}" }
            else -> "TEST LINE 1"
        }
    }

    private fun toStrictAsciiOnly(input: String): String {
        return input
            .map { ch -> if (ch.code in 32..126 || ch == '\n' || ch == '\r' || ch == '\t') ch else '?' }
            .joinToString("")
    }

    private fun finalReceiptBlockForStrategy(coreText: String): String {
        val cleanCore = coreText.trimEnd('\r', '\n')
        val topMarginLines = 2
        val bottomMarginLines = 36
        return "\n".repeat(topMarginLines) + cleanCore + "\n".repeat(bottomMarginLines)
    }

    private fun buildTextSections(coreReceiptText: String): List<String> {
        val lines = coreReceiptText.lines()
        if (lines.isEmpty()) return listOf(coreReceiptText)

        val articlesIndex = lines.indexOfFirst { it.trim().equals("Articles:", ignoreCase = true) }
        val totalIndex = lines.indexOfFirst { it.trim().startsWith("TOTAL:", ignoreCase = true) }

        if (articlesIndex <= 0 || totalIndex <= articlesIndex) {
            return listOf(coreReceiptText)
        }

        val header = lines.subList(0, articlesIndex).joinToString("\n").trim()
        val articles = lines.subList(articlesIndex, totalIndex).joinToString("\n").trim()
        val footer = lines.subList(totalIndex, lines.size).joinToString("\n").trim()

        return listOf(header, articles, footer)
            .filter { it.isNotBlank() }
            .map { section -> "$section\n" }
            .ifEmpty { listOf(coreReceiptText) }
    }

    private fun firstNonBlank(vararg values: String?): String {
        for (value in values) {
            if (!value.isNullOrBlank()) return value
        }
        return ""
    }

    private fun isClassPresent(className: String): Boolean {
        return try {
            Class.forName(className)
            true
        } catch (_: Throwable) {
            false
        }
    }

    private data class ParsedStructuredNotes(
        val type: String,
        val phone: String,
        val address: String,
        val paymentMethod: String,
        val extraNote: String,
    )

    private fun containsArticlesSection(displaySections: JSONArray?): Boolean {
        if (displaySections == null) return false
        for (i in 0 until displaySections.length()) {
            val section = displaySections.optJSONObject(i) ?: continue
            val key = section.optString("key")
            val line = section.optString("line")
            if (key.equals("items_header", ignoreCase = true) || line.trim().equals("Articles:", ignoreCase = true)) {
                return true
            }
        }
        return false
    }

    private fun containsArticlesLine(receiptLines: JSONArray?): Boolean {
        if (receiptLines == null) return false
        for (i in 0 until receiptLines.length()) {
            val line = receiptLines.optString(i)
            if (line.trim().equals("Articles:", ignoreCase = true)) return true
        }
        return false
    }

    private fun parseStructuredNotes(raw: String?): ParsedStructuredNotes {
        if (raw.isNullOrBlank()) {
            return ParsedStructuredNotes("", "", "", "", "")
        }

        var type = ""
        var phone = ""
        var address = ""
        var paymentMethod = ""
        val extras = mutableListOf<String>()

        raw.split("|")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .forEach { token ->
                when {
                    token.startsWith("Type:", ignoreCase = true) -> type = token.substringAfter(':').trim()
                    token.startsWith("Tel:", ignoreCase = true) -> phone = token.substringAfter(':').trim()
                    token.startsWith("Adresse:", ignoreCase = true) -> address = token.substringAfter(':').trim()
                    token.startsWith("Paiement:", ignoreCase = true) -> paymentMethod = token.substringAfter(':').trim()
                    else -> extras += token
                }
            }

        return ParsedStructuredNotes(type, phone, address, paymentMethod, extras.joinToString(" | "))
    }

    private fun formatOrderType(raw: String): String {
        return when (raw.trim().lowercase()) {
            "delivery", "livraison" -> "Livraison"
            "takeaway", "à emporter", "a emporter" -> "À emporter"
            else -> raw.trim()
        }
    }

    private fun formatPaymentMethod(raw: String): String {
        return when (raw.trim().lowercase()) {
            "cash", "especes", "espèces" -> "Espèces"
            "card", "carte" -> "Carte"
            else -> raw.trim()
        }
    }

    private fun toAsciiSafeReceiptText(input: String): String {
        val mojibakeNormalized = input
            .replace("ÔÇó", "-")
            .replace("pr├®c├®dentes", "precedentes")
            .replace("├®", "e")
            .replace("├¿", "a")
            .replace("Ã©", "e")
            .replace("Ã¨", "e")
            .replace("Ãª", "e")
            .replace("Ã ", "a")
            .replace("Ã¹", "u")
            .replace("Ã§", "c")

        val normalized = Normalizer.normalize(mojibakeNormalized, Normalizer.Form.NFD)
        val withoutDiacritics = normalized.replace("\\p{M}+".toRegex(), "")
        return withoutDiacritics
            .replace('’', '\'')
            .replace('–', '-')
            .replace('—', '-')
            .replace('…', '.')
            .replace("•", "-")
            .replace("�", "")
            .map { ch -> if (ch.code in 32..126 || ch == '\n' || ch == '\r' || ch == '\t') ch else '?' }
            .joinToString("")
    }

    private fun formatTicketDateTime(raw: String): String {
        if (raw.isBlank()) return ""

        runCatching {
            val parsed = java.time.Instant.parse(raw)
            val zoned = java.time.ZonedDateTime.ofInstant(parsed, java.time.ZoneId.systemDefault())
            return zoned.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
        }

        runCatching {
            val isoLike = raw.replace(' ', 'T')
            val parsed = java.time.LocalDateTime.parse(isoLike.take(19))
            return parsed.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
        }

        runCatching {
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            val parsed = parser.parse(raw)
            if (parsed is Date) {
                val fmt = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
                return fmt.format(parsed)
            }
        }

        return raw
    }

    companion object {
        private const val TAG = "SunmiPrinterManager"
        private val CALLBACK_OBSERVED_EVER = AtomicBoolean(false)
        private val PRINT_IN_PROGRESS = AtomicBoolean(false)
        private const val DEBUG_SINGLE_ATTEMPT_MODE = true
        private val DEFAULT_MAX_ATTEMPTS = if (DEBUG_SINGLE_ATTEMPT_MODE) 1 else 3
        private const val INIT_FIRST_EXPERIMENT_ENABLED = true
        private const val INIT_FIRST_DELAY_MS = 180L
        private const val TEXT_PATH_PRINTER_INIT_ENABLED = true
        private const val TEXT_PATH_SETTLE_WAIT_MS = 1500L
        private const val BITMAP_SETTLE_WAIT_MS = 1500L
        private const val SECTION_INTER_DISPATCH_DELAY_MS = 120L
        // TEMP device-test override: force one strategy regardless of web payload.
        private const val FORCE_OUTPUT_STRATEGY = "text_sections_left_rawfeed"
        private const val BITMAP_CHUNK_LINES = 3
    }
}
