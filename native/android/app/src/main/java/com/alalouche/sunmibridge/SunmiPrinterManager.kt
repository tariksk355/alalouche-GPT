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
import java.util.concurrent.atomic.AtomicInteger

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

        val isLikelyV2s = (Build.MODEL ?: "").lowercase(Locale.ROOT).contains("v2s")
        if (isLikelyV2s && V2S_FINAL_CLASSIFICATION_CONFIRMED) {
            logV2sFinalClassificationBlock()
            return buildV2sDegradedModeResult(
                code = "V2S_BRIDGE_ARCHITECTURE_UNSUITABLE",
                message = "Sunmi V2s bridge/AIDL path is finalized as degraded for production printing.",
                nativeDispatchAttempted = false,
                bridgeAccepted = true,
            )
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

        val architectureUnsuitable = job.errorCode == "V2S_BRIDGE_ARCHITECTURE_UNSUITABLE"
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
            put("retryable", !architectureUnsuitable && job.state == PrintJobState.NEEDS_ATTENTION)
            put("needsAttention", job.state == PrintJobState.NEEDS_ATTENTION)
            put("operatorActionRequired", architectureUnsuitable)
            put("acceptanceOnly", architectureUnsuitable)
            put("physicalPrintUnverified", architectureUnsuitable)
            if (architectureUnsuitable) {
                appendV2sArchitectureStatus(this)
                put("recommendedAction", "Use dedicated native print service/app for this device")
            }
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

        if (current.errorCode == "V2S_BRIDGE_ARCHITECTURE_UNSUITABLE") {
            return buildV2sDegradedModeResult(
                code = "V2S_BRIDGE_ARCHITECTURE_UNSUITABLE",
                message = "Retry suppressed: architecture unsuitable on Sunmi V2s.",
                nativeDispatchAttempted = false,
                bridgeAccepted = true,
            )
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
        val syntheticConfig = printJob.optJSONObject("syntheticTest") ?: formattingHints?.optJSONObject("syntheticTest")
        val syntheticConfigName = syntheticConfig?.optString("name")?.trim()?.lowercase(Locale.ROOT) ?: ""
        val syntheticConfigEnabledFromPayload = syntheticConfig?.optBoolean("enabled", false) == true
        val syntheticConfigEnabled = SYNTHETIC_TEST_ENABLED || syntheticConfigEnabledFromPayload
        val syntheticTestNameFromPayload = firstNonBlank(
            formattingHints?.optString("syntheticTestName"),
            printJob.optString("syntheticTestName"),
            syntheticConfigName,
        ).lowercase(Locale.ROOT)
        val forcedSyntheticTestName = firstNonBlank(
            if (SYNTHETIC_TEST_ENABLED) SYNTHETIC_TEST_NAME else "",
            FORCE_SYNTHETIC_TEST_NAME,
            syntheticTestNameFromPayload,
        ).trim().lowercase(Locale.ROOT)
        val syntheticEntryModeRequested = syntheticConfigEnabled || forcedSyntheticTestName.isNotBlank()
        val syntheticTestOnlyRequested = syntheticEntryModeRequested || formattingHints?.optBoolean("syntheticTestOnly", false) == true ||
            printJob.optBoolean("syntheticTestOnly", false)
        val isLikelyV2s = (Build.MODEL ?: "").lowercase(Locale.ROOT).contains("v2s")
        val v2sBitmapPrimaryStrategy = if (V2S_BITMAP_PRIMARY_ENABLED && isLikelyV2s && requestedOutputStrategyRaw.isBlank() && forcedOutputStrategy.isBlank() && !syntheticEntryModeRequested) V2S_BITMAP_PRIMARY_STRATEGY else ""
        val requestedOutputStrategy = when {
            syntheticEntryModeRequested -> forcedSyntheticTestName
            forcedOutputStrategy.isNotBlank() -> forcedOutputStrategy
            v2sBitmapPrimaryStrategy.isNotBlank() -> v2sBitmapPrimaryStrategy
            else -> requestedOutputStrategyRaw
        }
        Log.i(
            TAG,
            "native_requested_output_strategy requested=$requestedOutputStrategyRaw forced=$forcedOutputStrategy forcedSynthetic=$forcedSyntheticTestName syntheticConfigEnabled=$syntheticConfigEnabled syntheticConfigEnabledFromPayload=$syntheticConfigEnabledFromPayload syntheticEntryModeRequested=$syntheticEntryModeRequested syntheticTestOnlyRequested=$syntheticTestOnlyRequested isLikelyV2s=$isLikelyV2s v2sBitmapPrimaryStrategy=$v2sBitmapPrimaryStrategy effective=$requestedOutputStrategy",
        )

        if (isLikelyV2s && V2S_FINAL_CLASSIFICATION_CONFIRMED) {
            logV2sFinalClassificationBlock()
            return buildV2sDegradedModeResult(
                code = "V2S_BRIDGE_ARCHITECTURE_UNSUITABLE",
                message = "Sunmi V2s bridge/AIDL path is finalized as degraded for production printing.",
                nativeDispatchAttempted = false,
                bridgeAccepted = true,
            )
        }

        val bitmapExperimentRequested = requestedOutputStrategy == "bitmap" || requestedOutputStrategy == "bitmap_experiment"
        val bitmapSmokeTestRequested = requestedOutputStrategy == "bitmap_smoke_test"
        val textInitFirstRequested = requestedOutputStrategy == "text_init_first" || requestedOutputStrategy == "text_init_first_single_block"
        val bitmapInitFirstRequested = bitmapSmokeTestRequested || requestedOutputStrategy == "bitmap_init_first"
        val bitmapChunksAsciiTestRequested = requestedOutputStrategy == "bitmap_chunks_ascii_test"
        val bitmapTest3LinesChunkedRequested = requestedOutputStrategy == "bitmap_test_3lines_chunked"
        val bitmapTest10LinesChunkedRequested = requestedOutputStrategy == "bitmap_test_10lines_chunked"
        val bitmapTest3LinesChunkedMonoRequested = requestedOutputStrategy == "bitmap_test_3lines_chunked_mono"
        val officialParitySyntheticTextRequested = requestedOutputStrategy == "official_parity_synth_text"
        val officialParitySyntheticBitmapRequested = requestedOutputStrategy == "official_parity_synth_bitmap"
        val officialParityReceiptRequested = requestedOutputStrategy == "official_parity_receipt"
        val officialParityRequested = officialParitySyntheticTextRequested || officialParitySyntheticBitmapRequested || officialParityReceiptRequested
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
        val requiredSyntheticStrategies = setOf(
            "text_test_1line_rawfeed",
            "text_test_3lines_rawfeed",
            "text_test_10lines_rawfeed",
            "text_test_10lines_sections_rawfeed",
        )
        val knownBitmapStrategies = setOf("bitmap", "bitmap_experiment", "bitmap_smoke_test", "bitmap_init_first", "bitmap_chunks_ascii_test", "bitmap_test_3lines_chunked", "bitmap_test_10lines_chunked", "bitmap_test_3lines_chunked_mono")
        val knownParityStrategies = setOf("official_parity_synth_text", "official_parity_synth_bitmap", "official_parity_receipt")
        if (forcedSyntheticTestName.isNotBlank() && forcedSyntheticTestName !in requiredSyntheticStrategies) {
            Log.e(TAG, "synthetic_test_invalid forcedSynthetic=$forcedSyntheticTestName required=${requiredSyntheticStrategies.joinToString(",")}")
            return fail("INVALID_OUTPUT_STRATEGY", "Unsupported forced synthetic strategy: $forcedSyntheticTestName")
        }
        if (syntheticTestOnlyRequested && requestedOutputStrategy.isBlank()) {
            Log.e(TAG, "synthetic_test_missing_strategy syntheticConfigEnabled=$syntheticConfigEnabled syntheticConfigEnabledFromPayload=$syntheticConfigEnabledFromPayload syntheticEntryModeRequested=$syntheticEntryModeRequested syntheticTestOnlyRequested=true requested=$requestedOutputStrategyRaw forced=$forcedOutputStrategy forcedSynthetic=$forcedSyntheticTestName")
            return fail("INVALID_OUTPUT_STRATEGY", "Synthetic test requested but outputStrategy is empty.")
        }
        if (syntheticTestOnlyRequested && requestedOutputStrategy !in requiredSyntheticStrategies && requestedOutputStrategy !in knownParityStrategies) {
            Log.e(TAG, "synthetic_test_unresolved syntheticConfigEnabled=$syntheticConfigEnabled syntheticConfigEnabledFromPayload=$syntheticConfigEnabledFromPayload syntheticEntryModeRequested=$syntheticEntryModeRequested syntheticTestOnlyRequested=$syntheticTestOnlyRequested forcedSynthetic=$forcedSyntheticTestName effective=$requestedOutputStrategy")
            return fail("INVALID_OUTPUT_STRATEGY", "Synthetic test requested but strategy is unresolved: $requestedOutputStrategy")
        }
        if (requestedOutputStrategy.isNotBlank() &&
            requestedOutputStrategy !in knownTextStrategies &&
            requestedOutputStrategy !in knownBitmapStrategies &&
            requestedOutputStrategy !in knownParityStrategies
        ) {
            val isSyntheticRequest = requestedOutputStrategy.startsWith("text_test_") || syntheticTestOnlyRequested || forcedSyntheticTestName.isNotBlank()
            if (isSyntheticRequest) {
                Log.e(TAG, "synthetic_test_invalid requested=$requestedOutputStrategy required=${requiredSyntheticStrategies.joinToString(",")}")
            } else {
                Log.e(TAG, "printReceipt invalid_output_strategy value=$requestedOutputStrategy")
            }
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

        if (!syntheticTextTestRequested && !bitmapTest3LinesChunkedRequested && !bitmapTest10LinesChunkedRequested && !bitmapTest3LinesChunkedMonoRequested && !officialParityRequested && (orderNumber.isBlank() || lines.length() == 0)) {
            Log.e(TAG, "native printReceipt invalid payload orderNumber='$orderNumber' lines=${lines.length()} syntheticTest=$syntheticTextTestRequested")
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
                return buildAidlCallback(
                    op = op,
                    onObserved = {
                        callbackObservedThisAttempt = true
                        CALLBACK_OBSERVED_EVER.set(true)
                    },
                    onError = { error ->
                        callbackErrors += error
                    },
                )
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
                Log.i(TAG, "synthetic_test_name=$requestedOutputStrategy")
                Log.i(TAG, "synthetic_test_only=true")
                Log.i(TAG, "synthetic_test_payload_lines=${renderedLines.size}")
                Log.i(TAG, "synthetic_test_text_start\n${renderedLines.joinToString("\n")}\nsynthetic_test_text_end")
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

            if (officialParityRequested) {
                Log.i(TAG, "official_parity_path start strategy=$requestedOutputStrategy")
                val paritySource = when {
                    officialParitySyntheticTextRequested || officialParitySyntheticBitmapRequested -> "synthetic"
                    else -> "receipt"
                }
                val parityTextPayload = when {
                    officialParitySyntheticTextRequested || officialParitySyntheticBitmapRequested -> toStrictAsciiOnly(buildSyntheticAsciiTestText("text_test_3lines_rawfeed"))
                    else -> coreReceiptText
                }
                val parityLayerStatus = ParityLayerStatus()
                if (OFFICIAL_PARITY_DISABLE_AFTER_BUFFER_CRASH_CONFIRMED && OFFICIAL_PARITY_BUFFER_CRASH_CONFIRMED.get()) {
                    Log.w(TAG, "official_parity_sequence skipped=true reason=buffer_api_crash_already_confirmed")
                    logV2sArchitectureAuditNote()
                    val fallbackCallbackErrors = mutableListOf<String>()
                    val fallbackCallback = buildAidlCallback(
                        op = "official_parity_safe_fallback_nonbuffer",
                        onError = { error -> fallbackCallbackErrors += error },
                    )
                    val fallbackDispatchError = runCatching {
                        service.printerInit(fallbackCallback)
                        service.setAlignment(0, fallbackCallback)
                        service.printText(finalReceiptBlockForStrategy(parityTextPayload), fallbackCallback)
                        val rawFeedCmd = byteArrayOf(0x1B, 0x64, OFFICIAL_PARITY_FINAL_FEED_LINES.coerceIn(0, 255).toByte())
                        service.sendRAWData(rawFeedCmd, fallbackCallback)
                    }.exceptionOrNull()
                    return JSONObject().apply {
                        put("ok", fallbackDispatchError == null)
                        put("code", if (fallbackDispatchError == null) "PRINT_SENT" else "NONBUFFER_SAFE_FALLBACK_FAILED")
                        put("message", if (fallbackDispatchError == null) "Parity buffer path skipped after confirmed buffer crash; non-buffer safe fallback dispatched." else "Parity buffer path skipped but non-buffer safe fallback failed.")
                        put("strategyName", requestedOutputStrategy)
                        put("sequencingMode", "safe_nonbuffer_after_confirmed_buffer_crash")
                        put("acceptanceOnly", true)
                        put("physicalPrintUnverified", true)
                        put("bufferCrashPreviouslyConfirmed", true)
                        put("fallbackDispatchError", fallbackDispatchError?.message ?: JSONObject.NULL)
                        put("callbackErrors", JSONArray(fallbackCallbackErrors))
                        appendV2sArchitectureStatus(this)
                    }
                }

                val readiness = waitForPrinterReadyState(service, OFFICIAL_PARITY_READY_RETRIES, OFFICIAL_PARITY_READY_RETRY_DELAY_MS)
                val stateIsDispatchable = readiness.lastState in OFFICIAL_PARITY_DISPATCHABLE_STATE_CODES
                val continueDespiteNotReady = OFFICIAL_PARITY_ALLOW_DISPATCH_ON_NON_READY_STATE && stateIsDispatchable
                val readinessDecisionReason = when {
                    readiness.ready -> "ready_state_allowed"
                    continueDespiteNotReady -> "state_${readiness.lastState}_temporarily_dispatchable_for_parity"
                    else -> "state_${readiness.lastState}_not_dispatchable"
                }
                Log.i(
                    TAG,
                    "official_parity_readiness_decision rawState=${readiness.lastState} ready=${readiness.ready} stateIsDispatchable=$stateIsDispatchable continueDespiteNotReady=$continueDespiteNotReady reason=$readinessDecisionReason",
                )
                parityLayerStatus.readiness = if (readiness.ready || continueDespiteNotReady) "passed:$readinessDecisionReason" else "failed:$readinessDecisionReason"
                if (!readiness.ready && !continueDespiteNotReady) {
                    Log.e(TAG, "official_parity_readiness failed=true lastState=${readiness.lastState} reason=$readinessDecisionReason")
                    logV2sArchitectureAuditNote()
                    return fail("PRINTER_NOT_READY", "Official parity path aborted: $readinessDecisionReason.")
                }

                val parityCallbackErrors = mutableListOf<String>()
                val parityCallbackObserved = AtomicBoolean(false)
                val parityCallback = buildAidlCallback(
                    op = "official_parity",
                    onObserved = { parityCallbackObserved.set(true) },
                    onError = { error -> parityCallbackErrors += error },
                )

                runCatching {
                    Log.i(TAG, "official_parity_sequence sequence=printerInit->enterBuffer->setAlignmentLeft->dispatch->rawEscDFeed->commitBuffer->exitBuffer")

                    Log.i(TAG, "official_parity_step before=printerInit")
                    service.printerInit(parityCallback)
                    Log.i(TAG, "official_parity_step after=printerInit")

                    Thread.sleep(OFFICIAL_PARITY_INIT_DELAY_MS)

                    Log.i(TAG, "official_parity_step before=enterPrinterBuffer clean=true")
                    parityLayerStatus.bufferEnter = "attempted"
                    service.enterPrinterBuffer(true)
                    parityLayerStatus.bufferEnter = "passed"
                    Log.i(TAG, "official_parity_step after=enterPrinterBuffer clean=true")

                    Log.i(TAG, "official_parity_step before=setAlignment alignment=0")
                    service.setAlignment(0, parityCallback)
                    Log.i(TAG, "official_parity_step after=setAlignment alignment=0")

                    if (officialParitySyntheticBitmapRequested) {
                        val parityBitmap = buildReceiptBitmapMonochrome(parityTextPayload)
                        val stats = computeBitmapPixelStats(parityBitmap)
                        try {
                            Log.i(TAG, "official_parity_bitmap_payload_start\n$parityTextPayload\nofficial_parity_bitmap_payload_end")
                            Log.i(TAG, "official_parity_bitmap_diagnostics config=${parityBitmap.config?.name ?: "UNKNOWN"} monochrome=${isBitmapMonochrome(parityBitmap)} hasAlpha=${parityBitmap.hasAlpha()} blackPixelCount=${stats.blackPixelCount} whitePixelCount=${stats.whitePixelCount} otherPixelCount=${stats.otherPixelCount} width=${parityBitmap.width} height=${parityBitmap.height}")
                            Log.i(TAG, "official_parity_step before=dispatch printBitmap")
                            parityLayerStatus.contentDispatch = "attempted:printBitmap"
                            service.printBitmap(parityBitmap, parityCallback)
                            parityLayerStatus.contentDispatch = "passed:printBitmap"
                            Log.i(TAG, "official_parity_step after=dispatch printBitmap")
                        } finally {
                            parityBitmap.recycle()
                        }
                    } else {
                        Log.i(TAG, "official_parity_text_payload_start\n$parityTextPayload\nofficial_parity_text_payload_end")
                        Log.i(TAG, "official_parity_step before=dispatch printText")
                        parityLayerStatus.contentDispatch = "attempted:printText"
                        service.printText(finalReceiptBlockForStrategy(parityTextPayload), parityCallback)
                        parityLayerStatus.contentDispatch = "passed:printText"
                        Log.i(TAG, "official_parity_step after=dispatch printText")
                    }

                    val rawFeedCmd = byteArrayOf(0x1B, 0x64, OFFICIAL_PARITY_FINAL_FEED_LINES.coerceIn(0, 255).toByte())
                    Log.i(TAG, "official_parity_step before=sendRAWData esc=d lines=$OFFICIAL_PARITY_FINAL_FEED_LINES")
                    service.sendRAWData(rawFeedCmd, parityCallback)
                    Log.i(TAG, "official_parity_step after=sendRAWData esc=d")

                    Log.i(TAG, "official_parity_step before=commitPrinterBufferWithCallback")
                    parityLayerStatus.commit = "attempted"
                    service.commitPrinterBufferWithCallback(parityCallback)
                    parityLayerStatus.commit = "passed"
                    Log.i(TAG, "official_parity_step after=commitPrinterBufferWithCallback")

                    Log.i(TAG, "official_parity_step before=exitPrinterBufferWithCallback commit=true")
                    parityLayerStatus.exit = "attempted"
                    service.exitPrinterBufferWithCallback(true, parityCallback)
                    parityLayerStatus.exit = "passed"
                    Log.i(TAG, "official_parity_step after=exitPrinterBufferWithCallback commit=true")

                    Thread.sleep(OFFICIAL_PARITY_SETTLE_WAIT_MS)
                }.onFailure { err ->
                    val reason = err.message ?: "unknown"
                    val bufferCrashConfirmed = reason.contains("TransBean.l()", ignoreCase = true) || reason.contains("null object reference", ignoreCase = true)
                    if (bufferCrashConfirmed) {
                        OFFICIAL_PARITY_BUFFER_CRASH_CONFIRMED.set(true)
                        if (parityLayerStatus.bufferEnter.startsWith("attempted")) {
                            parityLayerStatus.bufferEnter = "failed:service_null_pointer"
                        }
                    }
                    Log.e(TAG, "official_parity_sequence failed=true reason=$reason")
                    Log.e(TAG, "official_parity_diagnostic_summary readiness=${parityLayerStatus.readiness} bufferEnter=${parityLayerStatus.bufferEnter} contentDispatch=${parityLayerStatus.contentDispatch} commit=${parityLayerStatus.commit} exit=${parityLayerStatus.exit}")
                    logV2sArchitectureAuditNote()
                    return JSONObject().apply {
                        put("ok", false)
                        put("code", "OFFICIAL_PARITY_FAILED")
                        put("message", "Official parity sequence failed: $reason")
                        put("strategyName", requestedOutputStrategy)
                        put("acceptanceOnly", true)
                        put("physicalPrintUnverified", true)
                        put("parityFailureLayerSummary", JSONObject().apply {
                            put("readiness", parityLayerStatus.readiness)
                            put("bufferEnter", parityLayerStatus.bufferEnter)
                            put("contentDispatch", parityLayerStatus.contentDispatch)
                            put("commit", parityLayerStatus.commit)
                            put("exit", parityLayerStatus.exit)
                        })
                        put("bufferCrashConfirmed", bufferCrashConfirmed)
                        put("callbackErrors", JSONArray(parityCallbackErrors))
                        appendV2sArchitectureStatus(this)
                    }
                }

                val postReady = waitForPrinterReadyState(service, OFFICIAL_PARITY_READY_RETRIES, OFFICIAL_PARITY_READY_RETRY_DELAY_MS)
                val acceptanceOnly = true
                return JSONObject().apply {
                    put("ok", true)
                    put("code", "PRINT_SENT")
                    put("message", "Official parity sequence dispatched to Sunmi service.")
                    put("strategyName", requestedOutputStrategy)
                    put("paritySource", paritySource)
                    put("acceptanceOnly", acceptanceOnly)
                    put("callbackObservedThisAttempt", parityCallbackObserved.get())
                    put("callbackErrors", JSONArray(parityCallbackErrors))
                    put("printerReadyBefore", readiness.ready)
                    put("printerStateBefore", readiness.lastState)
                    put("readinessDecisionReason", readinessDecisionReason)
                    put("continuedDespiteNotReady", continueDespiteNotReady)
                    put("printerReadyAfter", postReady.ready)
                    put("printerStateAfter", postReady.lastState)
                    put("mainContentPrimitive", if (officialParitySyntheticBitmapRequested) "printBitmap" else "printText")
                    put("sequencingMode", "official_equivalent_transactional")
                    put("feedPrimitive", "raw_esc_d")
                    put("physicalPrintUnverified", true)
                    appendV2sArchitectureStatus(this)
                }
            }

            if (bitmapExperimentRequested || bitmapSmokeTestRequested || bitmapChunksAsciiTestRequested || bitmapTest3LinesChunkedRequested || bitmapTest10LinesChunkedRequested || bitmapTest3LinesChunkedMonoRequested) {
                Log.i(TAG, "receipt_bitmap_experiment requested=true smokeTest=$bitmapSmokeTestRequested chunksTest=$bitmapChunksAsciiTestRequested synthetic3LinesChunked=$bitmapTest3LinesChunkedRequested synthetic10LinesChunked=$bitmapTest10LinesChunkedRequested synthetic3LinesChunkedMono=$bitmapTest3LinesChunkedMonoRequested initFirst=$bitmapInitFirstRequested strategy=$requestedOutputStrategy")
                runCatching {
                    val printerStateBeforeBitmap = runCatching { service.updatePrinterState() }.getOrDefault(-999)
                    runPrinterInit("before_bitmap")
                    val bitmapAlignment = if (bitmapChunksAsciiTestRequested || bitmapTest3LinesChunkedRequested || bitmapTest10LinesChunkedRequested || bitmapTest3LinesChunkedMonoRequested) 0 else 1
                    Log.i(TAG, "low_level_call setAlignment alignment=$bitmapAlignment primitive=printBitmap")
                    service.setAlignment(bitmapAlignment, callbackFor("setAlignmentBitmap"))

                    var bitmapWidth = 0
                    var bitmapHeight = 0
                    var bitmapConfig = "UNKNOWN"
                    var bitmapIsMonochrome = false

                    if (bitmapChunksAsciiTestRequested || bitmapTest3LinesChunkedRequested || bitmapTest10LinesChunkedRequested || bitmapTest3LinesChunkedMonoRequested) {
                        val chunkSource = when {
                            bitmapTest3LinesChunkedRequested || bitmapTest3LinesChunkedMonoRequested -> toStrictAsciiOnly(buildSyntheticAsciiTestText("text_test_3lines_rawfeed")).lines().filter { it.isNotBlank() }
                            bitmapTest10LinesChunkedRequested -> toStrictAsciiOnly(buildSyntheticAsciiTestText("text_test_10lines_rawfeed")).lines().filter { it.isNotBlank() }
                            else -> toStrictAsciiOnly(buildSyntheticAsciiTestText("text_test_10lines_rawfeed")).lines().filter { it.isNotBlank() }
                        }
                        val chunkLines = if (bitmapTest3LinesChunkedRequested || bitmapTest10LinesChunkedRequested || bitmapTest3LinesChunkedMonoRequested) BITMAP_SYNTHETIC_TEST_CHUNK_LINES else BITMAP_CHUNK_LINES
                        val chunks = chunkSource.chunked(chunkLines)
                        if (bitmapTest3LinesChunkedRequested || bitmapTest10LinesChunkedRequested || bitmapTest3LinesChunkedMonoRequested) {
                            val syntheticBitmapTestName = when {
                                bitmapTest3LinesChunkedMonoRequested -> "bitmap_test_3lines_chunked_mono"
                                bitmapTest3LinesChunkedRequested -> "bitmap_test_3lines_chunked"
                                else -> "bitmap_test_10lines_chunked"
                            }
                            if (bitmapTest3LinesChunkedMonoRequested) {
                                Log.i(TAG, "bitmap_synthetic_test_name=bitmap_test_3lines_chunked_mono")
                            }
                            Log.i(TAG, "bitmap_synthetic_test_name=$syntheticBitmapTestName")
                            Log.i(TAG, "bitmap_synthetic_test_payload_lines=${chunkSource.size}")
                            Log.i(TAG, "bitmap_synthetic_test_text_start\n${chunkSource.joinToString("\n")}\nbitmap_synthetic_test_text_end")
                        }
                        Log.i(TAG, "bitmap_chunk_test start chunks=${chunks.size} lines=${chunkSource.size} chunkLines=$chunkLines synthetic3LinesChunked=$bitmapTest3LinesChunkedRequested synthetic10LinesChunked=$bitmapTest10LinesChunkedRequested synthetic3LinesChunkedMono=$bitmapTest3LinesChunkedMonoRequested")
                        for ((chunkIdx, chunkLinesPayload) in chunks.withIndex()) {
                            val chunkBitmap = if (bitmapTest3LinesChunkedMonoRequested) {
                                buildReceiptBitmapMonochrome(chunkLinesPayload.joinToString("\n"))
                            } else {
                                buildReceiptBitmap(chunkLinesPayload.joinToString("\n"))
                            }
                            bitmapWidth = chunkBitmap.width
                            bitmapHeight = chunkBitmap.height
                            bitmapConfig = chunkBitmap.config?.name ?: "UNKNOWN"
                            bitmapIsMonochrome = isBitmapMonochrome(chunkBitmap)
                            val pixelStats = computeBitmapPixelStats(chunkBitmap)
                            Log.i(TAG, "bitmap_chunk_diagnostics chunk=$chunkIdx width=$bitmapWidth height=$bitmapHeight config=$bitmapConfig monochrome=$bitmapIsMonochrome hasAlpha=${chunkBitmap.hasAlpha()} blackPixelCount=${pixelStats.blackPixelCount} whitePixelCount=${pixelStats.whitePixelCount} otherPixelCount=${pixelStats.otherPixelCount} lines=${chunkLinesPayload.size} text=${chunkLinesPayload.joinToString(" | ")}")
                            Log.i(TAG, "bitmap_chunk_sequence chunk=$chunkIdx primitiveSequence=buildReceiptBitmap->printBitmap->sleep(${BITMAP_INTER_CHUNK_DELAY_MS}ms)->lineWrap(${BITMAP_INTER_CHUNK_ADVANCE_LINES})")
                            try {
                                service.printBitmap(chunkBitmap, callbackFor("printBitmapChunk_$chunkIdx"))
                                if (chunkIdx < chunks.lastIndex) {
                                    Thread.sleep(BITMAP_INTER_CHUNK_DELAY_MS)
                                    if (BITMAP_INTER_CHUNK_ADVANCE_LINES > 0) {
                                        service.lineWrap(BITMAP_INTER_CHUNK_ADVANCE_LINES, callbackFor("lineWrapAfterBitmapChunk_$chunkIdx"))
                                    }
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
                            bitmapTest3LinesChunkedMonoRequested -> "Bitmap synthetic 3-lines chunked mono commands sent to Sunmi service."
                            bitmapTest3LinesChunkedRequested -> "Bitmap synthetic 3-lines chunked commands sent to Sunmi service."
                            bitmapTest10LinesChunkedRequested -> "Bitmap synthetic 10-lines chunked commands sent to Sunmi service."
                            bitmapChunksAsciiTestRequested -> "Bitmap chunk test commands sent to Sunmi service."
                            bitmapSmokeTestRequested -> "Bitmap smoke-test commands sent to Sunmi service."
                            else -> "Bitmap print commands sent to Sunmi service."
                        })
                        put("orderNumber", orderNumber)
                        put("lineCount", lines.length())
                        put("renderedLineCount", renderedLines.size)
                        put("renderedReceiptText", renderedReceiptTextRaw)
                        put("strategyName", when {
                            bitmapTest3LinesChunkedMonoRequested -> "bitmap_test_3lines_chunked_mono"
                            bitmapTest3LinesChunkedRequested -> "bitmap_test_3lines_chunked"
                            bitmapTest10LinesChunkedRequested -> "bitmap_test_10lines_chunked"
                            bitmapChunksAsciiTestRequested -> "bitmap_chunks_ascii_test"
                            bitmapSmokeTestRequested -> "bitmap_smoke_test_2lines"
                            else -> "bitmap_single_image_with_linewrap_feed"
                        })
                        put("sequencingMode", if (bitmapTest3LinesChunkedMonoRequested || bitmapTest3LinesChunkedRequested || bitmapTest10LinesChunkedRequested || bitmapChunksAsciiTestRequested) "deterministic_nonbuffer_bitmap_chunks" else "deterministic_nonbuffer_single_bitmap")
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
                        put("bitmapTest3LinesChunkedRequested", bitmapTest3LinesChunkedRequested)
                        put("bitmapTest3LinesChunkedMonoRequested", bitmapTest3LinesChunkedMonoRequested)
                        put("bitmapTest10LinesChunkedRequested", bitmapTest10LinesChunkedRequested)
                        put("bitmapInitFirstRequested", bitmapInitFirstRequested)
                        put("bitmapConfig", bitmapConfig)
                        put("bitmapMonochrome", bitmapIsMonochrome)
                        put("bitmapWidthPx", bitmapWidth)
                        put("bitmapHeightPx", bitmapHeight)
                        put("finalTextLineCount", finalTextLineCount)
                        put("finalTextCharLength", finalTextCharLength)
                        put("acceptanceOnly", true)
                        put("physicalPrintUnverified", true)
                        appendV2sArchitectureStatus(this)
                    }
                }.onFailure { bitmapErr ->
                    if (bitmapTest3LinesChunkedMonoRequested || bitmapTest3LinesChunkedRequested || bitmapTest10LinesChunkedRequested) {
                        val strategy = when {
                            bitmapTest3LinesChunkedMonoRequested -> "bitmap_test_3lines_chunked_mono"
                            bitmapTest3LinesChunkedRequested -> "bitmap_test_3lines_chunked"
                            else -> "bitmap_test_10lines_chunked"
                        }
                        Log.e(TAG, "receipt_bitmap_experiment failed_no_fallback strategy=$strategy reason=${bitmapErr.message ?: "unknown"}")
                        return fail("BITMAP_SYNTHETIC_TEST_FAILED", "$strategy failed: ${bitmapErr.message ?: "unknown"}")
                    }
                    Log.w(TAG, "receipt_bitmap_experiment failed -> fallback_to_text reason=${bitmapErr.message ?: "unknown"}")
                    callbackErrors.clear()
                }
            }
            val textStrategyName = when (requestedOutputStrategy) {
                "", "text_single_block_center_rawfeed", "text_init_first", "text_init_first_single_block" -> {
                    if (requestedOutputStrategy.isBlank()) {
                        if (syntheticTestOnlyRequested || syntheticEntryModeRequested || forcedSyntheticTestName.isNotBlank()) {
                            Log.e(TAG, "synthetic_test_missing_strategy_at_dispatch requested=$requestedOutputStrategyRaw forcedSynthetic=$forcedSyntheticTestName effective=$requestedOutputStrategy")
                            return fail("INVALID_OUTPUT_STRATEGY", "Synthetic test requested but effective strategy is empty.")
                        }
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
            if (isSyntheticTextTest && finalFeedPrimitive != "raw_esc_d") {
                Log.w(TAG, "synthetic_text_feed_invariant violated=true expected=raw_esc_d actual=$finalFeedPrimitive strategy=$strategyName")
            }
            val fallbackFeedPrimitive = "lineWrap"
            val finalFeedReason = if (finalFeedModeLineWrap) "linewrap_selected_for_strategy" else "explicit_post_content_advance"
            val settleWaitMs = TEXT_PATH_SETTLE_WAIT_MS
            val sectionTexts = if (useSectionDispatch) buildTextSections(dispatchTextCore) else listOf(finalReceiptBlockForStrategy(dispatchTextCore))
            val sectionCount = sectionTexts.size
            if (isSyntheticTextTest) {
                Log.i(TAG, "synthetic_text_dispatch_core_start\n$dispatchTextCore\nsynthetic_text_dispatch_core_end")
                sectionTexts.forEachIndexed { secIdx, secText ->
                    Log.i(TAG, "synthetic_text_dispatch_section_start section=$secIdx\n$secText\nsynthetic_text_dispatch_section_end section=$secIdx")
                }
            }
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
            if (isSyntheticTextTest) {
                Log.i(TAG, "synthetic_text_test_result_note strategy=$strategyName note=if_physical_ticket_incomplete_with_exact_logged_ascii_then_aidl_printText_is_unreliable_on_this_firmware")
            }
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
                put("acceptanceOnly", true)
                put("physicalPrintUnverified", true)
                appendV2sArchitectureStatus(this)
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

    fun runNativePrinterDebugTest(): JSONObject {
        val serviceBound = ensureServiceBound(1200)
        val service = printerService

        if (!serviceBound || service == null) {
            return fail("SUNMI_SERVICE_UNAVAILABLE", "Sunmi printer service is unavailable or not bound.")
        }

        val callbackSuccessCount = AtomicInteger(0)
        val callbackFailureCount = AtomicInteger(0)
        val callbackEvents = JSONArray()

        fun callbackForStep(step: String): ICallback {
            return object : ICallback.Stub() {
                override fun onRunResult(isSuccess: Boolean) {
                    if (isSuccess) callbackSuccessCount.incrementAndGet() else callbackFailureCount.incrementAndGet()
                    val event = "manual_test_callback step=$step event=onRunResult success=$isSuccess"
                    callbackEvents.put(event)
                    Log.i(TAG, event)
                }

                override fun onReturnString(result: String?) {
                    val event = "manual_test_callback step=$step event=onReturnString result=${result ?: ""}"
                    callbackEvents.put(event)
                    Log.i(TAG, event)
                }

                override fun onRaiseException(code: Int, msg: String?) {
                    callbackFailureCount.incrementAndGet()
                    val event = "manual_test_callback step=$step event=onRaiseException code=$code msg=${msg ?: ""}"
                    callbackEvents.put(event)
                    Log.e(TAG, event)
                }

                override fun onPrintResult(code: Int, msg: String?) {
                    if (code == 0) callbackSuccessCount.incrementAndGet() else callbackFailureCount.incrementAndGet()
                    val event = "manual_test_callback step=$step event=onPrintResult code=$code msg=${msg ?: ""}"
                    callbackEvents.put(event)
                    Log.i(TAG, event)
                }
            }
        }

        fun invokeStep(step: String, block: () -> Unit) {
            Log.i(TAG, "manual_test_method_start step=$step")
            try {
                block()
                Log.i(TAG, "manual_test_method_end step=$step")
            } catch (e: RemoteException) {
                Log.e(TAG, "manual_test_method_exception step=$step type=RemoteException", e)
                throw e
            } catch (t: Throwable) {
                Log.e(TAG, "manual_test_method_exception step=$step type=${t::class.java.simpleName}", t)
                throw t
            }
        }

        return try {
            Log.i(TAG, "manual_test_sequence_start sequence=1 flow=printerInit->printText(TEST_1)->lineWrap(3)")
            invokeStep("seq1_printerInit") { service.printerInit(callbackForStep("seq1_printerInit")) }
            invokeStep("seq1_printText_TEST_1") { service.printText("TEST 1", callbackForStep("seq1_printText_TEST_1")) }
            invokeStep("seq1_lineWrap_3") { service.lineWrap(3, callbackForStep("seq1_lineWrap_3")) }
            Log.i(TAG, "manual_test_sequence_end sequence=1")

            Log.i(TAG, "manual_test_sequence_start sequence=2 flow=printerInit->setAlignment(1)->printText(CENTER_TEST)->lineWrap(3)")
            invokeStep("seq2_printerInit") { service.printerInit(callbackForStep("seq2_printerInit")) }
            invokeStep("seq2_setAlignment_1") { service.setAlignment(1, callbackForStep("seq2_setAlignment_1")) }
            invokeStep("seq2_printText_CENTER_TEST") { service.printText("CENTER TEST", callbackForStep("seq2_printText_CENTER_TEST")) }
            invokeStep("seq2_lineWrap_3") { service.lineWrap(3, callbackForStep("seq2_lineWrap_3")) }
            Log.i(TAG, "manual_test_sequence_end sequence=2")

            JSONObject().apply {
                put("ok", true)
                put("code", "NATIVE_PRINTER_DEBUG_TEST_SENT")
                put("message", "Native printer debug test commands sent.")
                put("callbackSuccessCount", callbackSuccessCount.get())
                put("callbackFailureCount", callbackFailureCount.get())
                put("callbackEvents", callbackEvents)
            }
        } catch (e: RemoteException) {
            fail("NATIVE_PRINTER_DEBUG_TEST_REMOTE_ERROR", "Native printer debug test failed in remote service.", e.message)
        } catch (t: Throwable) {
            fail("NATIVE_PRINTER_DEBUG_TEST_FAILED", "Native printer debug test failed.", t.message)
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

    private fun buildV2sCapabilityClassification(): JSONArray {
        val flags = JSONArray()
        flags.put(V2sCapabilityFlag.BUFFER_API_CRASHES.name)
        flags.put(V2sCapabilityFlag.NONBUFFER_TEXT_UNRELIABLE.name)
        flags.put(V2sCapabilityFlag.NONBUFFER_BITMAP_NO_PHYSICAL_OUTPUT.name)
        return flags
    }

    private fun appendV2sArchitectureStatus(target: JSONObject) {
        target.put("v2sCapabilityClassification", buildV2sCapabilityClassification())
        target.put("architectureStatus", "UNSUITABLE_BRIDGE_AIDL_V2S")
        target.put("bufferApiStatus", "CRASHES_IN_SERVICE")
        target.put("nonBufferTextStatus", "UNRELIABLE")
        target.put("nonBufferBitmapStatus", "NO_PHYSICAL_OUTPUT")
        target.put("recommendedNextStep", "DEDICATED_NATIVE_PRINT_SERVICE")
    }

    private fun logV2sArchitectureAuditNote() {
        Log.w(
            TAG,
            "v2s_architecture_audit text_synth=unreliable bitmap_synth=no_physical_output official_parity_buffer_path=enterPrinterBuffer_null_pointer bridge_aidl_status=unsuitable_for_production_without_dedicated_native_path",
        )
    }

    private fun logV2sFinalClassificationBlock() {
        Log.e(
            TAG,
            "V2S_FINAL_CLASSIFICATION architectureStatus=UNSUITABLE_BRIDGE_AIDL_V2S bufferApiStatus=CRASHES_IN_SERVICE nonBufferTextStatus=UNRELIABLE nonBufferBitmapStatus=NO_PHYSICAL_OUTPUT recommendedNextStep=DEDICATED_NATIVE_PRINT_SERVICE",
        )
    }

    private fun buildV2sDegradedModeResult(
        code: String = "V2S_BRIDGE_ARCHITECTURE_UNSUITABLE",
        message: String = "Printing unavailable: bridge/AIDL architecture unsuitable on this V2s.",
        nativeDispatchAttempted: Boolean,
        bridgeAccepted: Boolean,
    ): JSONObject {
        logV2sArchitectureAuditNote()
        return JSONObject().apply {
            put("ok", false)
            put("code", code)
            put("errorCode", "V2S_BRIDGE_ARCHITECTURE_UNSUITABLE")
            put("message", message)
            put("acceptedByBridge", bridgeAccepted)
            put("nativeDispatchAttempted", nativeDispatchAttempted)
            put("acceptanceOnly", true)
            put("physicalPrintUnverified", true)
            put("retryable", false)
            put("needsAttention", true)
            put("operatorActionRequired", true)
            put("recommendedAction", "Use dedicated native print service/app for this device")
            appendV2sArchitectureStatus(this)
        }
    }

    private fun fail(code: String, message: String, details: String? = null): JSONObject {
        return JSONObject().apply {
            put("ok", false)
            put("code", code)
            put("message", message)
            if (!details.isNullOrBlank()) put("details", details)
            put("acceptedByBridge", true)
            put("nativeDispatchAttempted", false)
            put("acceptanceOnly", true)
            put("physicalPrintUnverified", true)
            put("retryable", false)
            put("needsAttention", true)
            put("operatorActionRequired", true)
            put("recommendedAction", "Use dedicated native print service/app for this device")
            appendV2sArchitectureStatus(this)
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


    private fun buildReceiptBitmapMonochrome(receiptText: String): Bitmap {
        val argbBitmap = buildReceiptBitmap(receiptText)
        return try {
            toMonochromeBitmap(argbBitmap, MONOCHROME_THRESHOLD)
        } finally {
            argbBitmap.recycle()
        }
    }

    private fun toMonochromeBitmap(source: Bitmap, threshold: Int): Bitmap {
        val out = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.RGB_565)
        for (y in 0 until source.height) {
            for (x in 0 until source.width) {
                val px = source.getPixel(x, y)
                val luma = ((Color.red(px) * 299) + (Color.green(px) * 587) + (Color.blue(px) * 114)) / 1000
                val monoColor = if (luma < threshold) Color.BLACK else Color.WHITE
                out.setPixel(x, y, monoColor)
            }
        }
        return out
    }

    private fun computeBitmapPixelStats(bitmap: Bitmap): BitmapPixelStats {
        var black = 0
        var white = 0
        var other = 0
        for (y in 0 until bitmap.height) {
            for (x in 0 until bitmap.width) {
                val px = bitmap.getPixel(x, y)
                val r = Color.red(px)
                val g = Color.green(px)
                val b = Color.blue(px)
                val isWhite = r >= 245 && g >= 245 && b >= 245
                val isBlack = r <= 10 && g <= 10 && b <= 10
                when {
                    isBlack -> black++
                    isWhite -> white++
                    else -> other++
                }
            }
        }
        return BitmapPixelStats(black, white, other)
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

    private data class BitmapPixelStats(val blackPixelCount: Int, val whitePixelCount: Int, val otherPixelCount: Int)

    private data class PrinterReadiness(val ready: Boolean, val lastState: Int)

    private enum class V2sCapabilityFlag {
        BUFFER_API_CRASHES,
        NONBUFFER_TEXT_UNRELIABLE,
        NONBUFFER_BITMAP_NO_PHYSICAL_OUTPUT,
    }

    private data class ParityLayerStatus(
        var readiness: String = "not_started",
        var bufferEnter: String = "not_started",
        var contentDispatch: String = "not_started",
        var commit: String = "not_started",
        var exit: String = "not_started",
    )

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

    private fun buildAidlCallback(
        op: String,
        onObserved: () -> Unit = {},
        onError: (String) -> Unit = {},
    ): ICallback {
        return object : ICallback.Stub() {
            override fun onRunResult(isSuccess: Boolean) {
                onObserved()
                Log.i(TAG, "low_level_callback op=$op onRunResult success=$isSuccess")
                if (!isSuccess) {
                    onError("op=$op event=onRunResult success=false")
                }
            }

            override fun onReturnString(result: String?) {
                onObserved()
                Log.i(TAG, "low_level_callback op=$op onReturnString result=${result ?: ""}")
            }

            override fun onRaiseException(code: Int, msg: String?) {
                onObserved()
                val err = "op=$op event=onRaiseException code=$code msg=${msg ?: ""}"
                onError(err)
                Log.e(TAG, "low_level_callback $err")
            }
        }
    }

    private fun waitForPrinterReadyState(service: IWoyouService, retries: Int, delayMs: Long): PrinterReadiness {
        var lastState = -999
        repeat(retries.coerceAtLeast(1)) { attempt ->
            lastState = runCatching { service.updatePrinterState() }.getOrDefault(-999)
            val ready = lastState in OFFICIAL_PARITY_READY_STATE_CODES
            Log.i(TAG, "official_parity_readiness_check attempt=${attempt + 1}/$retries state=$lastState ready=$ready")
            if (ready) {
                return PrinterReadiness(true, lastState)
            }
            if (attempt < retries - 1) {
                Thread.sleep(delayMs)
            }
        }
        return PrinterReadiness(false, lastState)
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
        private val OFFICIAL_PARITY_BUFFER_CRASH_CONFIRMED = AtomicBoolean(false)
        private const val DEBUG_SINGLE_ATTEMPT_MODE = true
        private val DEFAULT_MAX_ATTEMPTS = if (DEBUG_SINGLE_ATTEMPT_MODE) 1 else 3
        private const val INIT_FIRST_EXPERIMENT_ENABLED = true
        private const val INIT_FIRST_DELAY_MS = 180L
        private const val TEXT_PATH_PRINTER_INIT_ENABLED = true
        private const val TEXT_PATH_SETTLE_WAIT_MS = 1500L
        private const val BITMAP_SETTLE_WAIT_MS = 1500L
        private const val BITMAP_INTER_CHUNK_DELAY_MS = 90L
        private const val BITMAP_INTER_CHUNK_ADVANCE_LINES = 0
        private const val SECTION_INTER_DISPATCH_DELAY_MS = 120L
        // TEMP device-test override: force one strategy regardless of web payload.
        private const val FORCE_OUTPUT_STRATEGY = ""
        private const val V2S_BITMAP_PRIMARY_ENABLED = true
        private const val V2S_BITMAP_PRIMARY_STRATEGY = "official_parity_synth_text"
        private const val SYNTHETIC_TEST_ENABLED = false
        private const val SYNTHETIC_TEST_NAME = "text_test_3lines_rawfeed"
        private const val FORCE_SYNTHETIC_TEST_NAME = ""
        private const val BITMAP_CHUNK_LINES = 3
        private const val BITMAP_SYNTHETIC_TEST_CHUNK_LINES = 2
        private const val MONOCHROME_THRESHOLD = 160
        private const val OFFICIAL_PARITY_INIT_DELAY_MS = 180L
        private const val OFFICIAL_PARITY_SETTLE_WAIT_MS = 1500L
        private const val OFFICIAL_PARITY_READY_RETRY_DELAY_MS = 250L
        private const val OFFICIAL_PARITY_READY_RETRIES = 8
        private val OFFICIAL_PARITY_READY_STATE_CODES = setOf(1, 2)
        private val OFFICIAL_PARITY_DISPATCHABLE_STATE_CODES = setOf(1, 2, 24)
        private const val OFFICIAL_PARITY_ALLOW_DISPATCH_ON_NON_READY_STATE = true
        private const val OFFICIAL_PARITY_DISABLE_AFTER_BUFFER_CRASH_CONFIRMED = true
        private const val OFFICIAL_PARITY_FINAL_FEED_LINES = 6
        private const val V2S_FINAL_CLASSIFICATION_CONFIRMED = true
        // V2s audit summary:
        // - synthetic printText was physically unreliable.
        // - synthetic bitmap tests produced no reliable physical output.
        // - official parity buffer flow can crash at enterPrinterBuffer on some V2s firmware.
        // - if repeated, bridge/AIDL is unsuitable for production printing; prefer dedicated native path.
    }
}
