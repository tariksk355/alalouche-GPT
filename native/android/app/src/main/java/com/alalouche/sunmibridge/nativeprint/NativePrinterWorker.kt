package com.alalouche.sunmibridge.nativeprint

import android.content.Context
import android.os.RemoteException
import android.util.Log
import org.json.JSONObject
import woyou.aidlservice.jiuiv5.ICallback
import woyou.aidlservice.jiuiv5.IWoyouService

interface NativePrinterWorker {
    fun dispatch(job: NativePrintJobEntity): NativeDispatchReport
}

private enum class PhysicalFidelityStrategy {
    LINE_BY_LINE_TEXT_WITH_DELAY,
    LINE_BY_LINE_TEXT_WITH_LINEWRAP,
    GROUPED_SMALL_BLOCKS,
}

private data class PhysicalFidelityConfig(
    val strategy: PhysicalFidelityStrategy,
    val delayMs: Long,
    val blockSize: Int,
    val appendNewline: Boolean,
)

private class LowLevelStepException(
    val step: String,
    cause: Throwable,
) : RuntimeException(cause)

private class RenderTextException(message: String) : RuntimeException(message)

private data class RenderedPrintText(
    val text: String,
    val source: String,
)

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

            val rendered = renderPrintableText(job)
            logRenderedText(job, rendered)

            val fidelityConfig = parsePhysicalFidelityConfig(job)
            Log.i(
                TAG,
                "native_print_strategy_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=${fidelityConfig.strategy.name.lowercase()} delayMs=${fidelityConfig.delayMs} appendNewline=${fidelityConfig.appendNewline} blockSize=${fidelityConfig.blockSize}",
            )

            val callbackErrors = mutableListOf<String>()
            val lowLevelSummary = executeRealLowLevelPrint(
                service = session.service,
                job = job,
                renderedText = rendered.text,
                fidelityConfig = fidelityConfig,
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
                    "native_print_low_level_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} attemptedRealPrint=true primitiveSequence=$lowLevelSummary",
                )
            }
        } catch (e: RenderTextException) {
            Log.e(
                TAG,
                "native_print_low_level_exception commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=render_text reason=${e.message ?: "render_error"}",
            )
            NativeDispatchReport(
                acceptedByNative = false,
                dispatchStarted = true,
                dispatchCompleted = false,
                dispatchAdapterEntered = true,
                nativeDispatchAttempted = false,
                lowLevelSequenceStarted = false,
                lowLevelSequenceCompleted = false,
                selectedServiceFamily = selectedFamily,
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = false,
                errorCode = "NATIVE_PRINT_RENDER_TEXT_FAILED",
                errorMessage = e.message ?: "render_error",
            )
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

    private fun parsePhysicalFidelityConfig(job: NativePrintJobEntity): PhysicalFidelityConfig {
        val payload = runCatching { JSONObject(job.payloadJson) }.getOrNull()
        val hints = payload?.optJSONObject("formattingHints")
        val rawStrategy = hints?.optString("nativePrintStrategy", "")?.trim().orEmpty()
        val strategy = when (rawStrategy.lowercase()) {
            "line_by_line_text_with_linewrap" -> PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_LINEWRAP
            "grouped_small_blocks" -> PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS
            else -> PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_DELAY
        }
        val delayMs = hints?.optLong("nativePrintLineDelayMs", DEFAULT_LINE_DELAY_MS) ?: DEFAULT_LINE_DELAY_MS
        val appendNewline = hints?.optBoolean("nativePrintAppendNewline", true) ?: true
        val blockSize = (hints?.optInt("nativePrintBlockSize", DEFAULT_BLOCK_SIZE) ?: DEFAULT_BLOCK_SIZE)
            .coerceIn(2, 3)
        return PhysicalFidelityConfig(
            strategy = strategy,
            delayMs = delayMs.coerceIn(0L, 250L),
            blockSize = blockSize,
            appendNewline = appendNewline,
        )
    }

    private fun executeRealLowLevelPrint(
        service: IWoyouService,
        job: NativePrintJobEntity,
        renderedText: String,
        fidelityConfig: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
    ): String {
        callPrinterPrimitive(job, "printerInit") {
            service.printerInit(callbackFor(job, "printerInit", callbackErrors))
        }

        callPrinterPrimitive(job, "setAlignment", detail = "value=0") {
            service.setAlignment(0, callbackFor(job, "setAlignment", callbackErrors))
        }

        val numberedLines = renderedText
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .split("\n")
            .map { it.trimEnd() }
            .filter { it.isNotBlank() }
            .mapIndexed { idx, line -> "%02d %s".format(idx + 1, line) }

        Log.i(
            TAG,
            "native_print_physical_fidelity_test commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=${fidelityConfig.strategy.name.lowercase()} renderedLineCount=${numberedLines.size} renderedCharLength=${renderedText.length}",
        )

        when (fidelityConfig.strategy) {
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_DELAY -> {
                numberedLines.forEachIndexed { idx, line ->
                    val payload = if (fidelityConfig.appendNewline) "$line\n" else line
                    Log.i(
                        TAG,
                        "native_print_line_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=line_by_line_text_with_delay lineIndex=$idx payloadLength=${payload.length} newlineAppended=${fidelityConfig.appendNewline} text=$line",
                    )
                    callPrinterPrimitive(job, "printText", detail = "strategy=A lineIndex=$idx payloadLength=${payload.length}") {
                        service.printText(payload, callbackFor(job, "printText_line_$idx", callbackErrors))
                    }
                    sleepAfterDispatch(job, idx, fidelityConfig.delayMs)
                }
            }

            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_LINEWRAP -> {
                numberedLines.forEachIndexed { idx, line ->
                    Log.i(
                        TAG,
                        "native_print_line_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=line_by_line_text_with_linewrap lineIndex=$idx payloadLength=${line.length} newlineAppended=false text=$line",
                    )
                    callPrinterPrimitive(job, "printText", detail = "strategy=B lineIndex=$idx payloadLength=${line.length}") {
                        service.printText(line, callbackFor(job, "printText_line_$idx", callbackErrors))
                    }
                    callPrinterPrimitive(job, "lineWrap", detail = "strategy=B lineIndex=$idx lines=1") {
                        service.lineWrap(1, callbackFor(job, "lineWrap_line_$idx", callbackErrors))
                    }
                    sleepAfterDispatch(job, idx, fidelityConfig.delayMs)
                }
            }

            PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS -> {
                var blockIndex = 0
                numberedLines.chunked(fidelityConfig.blockSize).forEach { chunk ->
                    val block = if (fidelityConfig.appendNewline) {
                        chunk.joinToString(separator = "\n", postfix = "\n")
                    } else {
                        chunk.joinToString(separator = "\n")
                    }
                    Log.i(
                        TAG,
                        "native_print_block_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=grouped_small_blocks blockIndex=$blockIndex lineCount=${chunk.size} payloadLength=${block.length} newlineAppended=${fidelityConfig.appendNewline}",
                    )
                    callPrinterPrimitive(job, "printText", detail = "strategy=C blockIndex=$blockIndex payloadLength=${block.length}") {
                        service.printText(block, callbackFor(job, "printText_block_$blockIndex", callbackErrors))
                    }
                    sleepAfterDispatch(job, blockIndex, fidelityConfig.delayMs)
                    blockIndex += 1
                }
            }
        }

        callPrinterPrimitive(job, "lineWrap", detail = "lines=3") {
            service.lineWrap(3, callbackFor(job, "lineWrap", callbackErrors))
        }

        val rawFeed = byteArrayOf(0x1B, 0x64, 0x03)
        callPrinterPrimitive(job, "sendRAWData", detail = "bytes=${rawFeed.size}") {
            service.sendRAWData(rawFeed, callbackFor(job, "sendRAWData", callbackErrors))
        }

        return when (fidelityConfig.strategy) {
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_DELAY -> "printerInit->setAlignment->printText(line_by_line_with_delay)->lineWrap->sendRAWData"
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_LINEWRAP -> "printerInit->setAlignment->printText(line_by_line)+lineWrap(1 each)->lineWrap->sendRAWData"
            PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS -> "printerInit->setAlignment->printText(grouped_small_blocks)->lineWrap->sendRAWData"
        }
    }

    private fun sleepAfterDispatch(job: NativePrintJobEntity, stepIndex: Int, delayMs: Long) {
        if (delayMs <= 0) return
        Log.i(
            TAG,
            "native_print_dispatch_delay commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} stepIndex=$stepIndex delayMs=$delayMs",
        )
        runCatching { Thread.sleep(delayMs) }
            .onFailure { err ->
                Log.w(
                    TAG,
                    "native_print_dispatch_delay_interrupted commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} stepIndex=$stepIndex reason=${err.message ?: "interrupted"}",
                )
            }
    }

    private fun renderPrintableText(job: NativePrintJobEntity): RenderedPrintText {
        val payload = runCatching { JSONObject(job.payloadJson) }
            .getOrElse { throw RenderTextException("invalid_json:${it.message ?: "malformed"}") }

        val hints = payload.optJSONObject("formattingHints")
        val useSynthetic = hints?.optBoolean("nativeSyntheticTest", false) == true
        if (useSynthetic) {
            return RenderedPrintText(
                text = "NP TEST A\nNP TEST B\nNP TEST C\n",
                source = "synthetic_test",
            )
        }

        val lines = mutableListOf<String>()
        val primaryHeader = payload.optString("orderNumber").ifBlank {
            payload.optString("order_number").ifBlank {
                payload.optString("orderId").ifBlank { payload.optString("order_id") }
            }
        }.ifBlank { "ORDER" }

        val receiptLinesFromDisplay = mutableListOf<String>()
        payload.optJSONObject("displayModel")
            ?.optJSONArray("receiptLines")
            ?.let { receiptLines ->
                for (i in 0 until receiptLines.length()) {
                    val line = receiptLines.optString(i).trimEnd()
                    if (line.isNotBlank()) receiptLinesFromDisplay += line
                }
            }

        if (receiptLinesFromDisplay.isNotEmpty()) {
            lines += receiptLinesFromDisplay
            if (receiptLinesFromDisplay.first().trim() == primaryHeader.trim()) {
                Log.i(TAG, "native_print_render_dedup_header commandId=${job.commandId} orderId=${job.orderId ?: ""} dedupApplied=true header=$primaryHeader")
            } else {
                lines.add(0, primaryHeader)
                Log.i(TAG, "native_print_render_dedup_header commandId=${job.commandId} orderId=${job.orderId ?: ""} dedupApplied=false headerPrepended=true header=$primaryHeader")
            }
        } else {
            lines += primaryHeader
        }

        if (receiptLinesFromDisplay.isEmpty()) {
            val items = payload.optJSONArray("lines") ?: payload.optJSONArray("items")
            if (items != null) {
                lines += "Articles:"
                for (i in 0 until items.length()) {
                    val item = items.optJSONObject(i) ?: continue
                    val qty = item.optInt("quantity", 1)
                    val name = item.optString("name").ifBlank {
                        item.optString("title").ifBlank { "Article" }
                    }
                    val totalPrice = when {
                        item.has("totalPrice") -> item.optDouble("totalPrice")
                        item.has("total_price") -> item.optDouble("total_price")
                        item.has("unitPrice") -> item.optDouble("unitPrice")
                        else -> Double.NaN
                    }
                    val priceText = if (!totalPrice.isNaN()) "  ${"%.2f".format(totalPrice)}" else ""
                    lines += "$qty x $name$priceText"
                }
            }

            payload.optJSONObject("totals")?.let { totals ->
                if (totals.has("total")) {
                    val currency = totals.optString("currency").ifBlank { "CHF" }
                    lines += "TOTAL: ${"%.2f".format(totals.optDouble("total"))} $currency"
                }
            }
        }

        val finalText = lines
            .map { it.trimEnd() }
            .filter { it.isNotBlank() }
            .joinToString(separator = "\n", postfix = "\n")

        if (finalText.isBlank() || finalText == "ORDER\n") {
            throw RenderTextException("empty_rendered_text")
        }

        return RenderedPrintText(
            text = finalText,
            source = "real_order_payload",
        )
    }

    private fun logRenderedText(job: NativePrintJobEntity, rendered: RenderedPrintText) {
        val renderedLines = rendered.text.lines().filter { it.isNotBlank() }
        val containsArticles = rendered.text.contains("article", ignoreCase = true) || rendered.text.contains("x ")
        val containsTotal = rendered.text.contains("total", ignoreCase = true)
        val markerInjected = rendered.text.contains("NATIVE COMMAND DISPATCH", ignoreCase = true)

        Log.i(
            TAG,
            "native_print_content_source commandId=${job.commandId} orderId=${job.orderId ?: ""} source=${rendered.source}",
        )
        Log.i(
            TAG,
            "native_print_rendered_text_meta commandId=${job.commandId} orderId=${job.orderId ?: ""} source=${rendered.source} renderedLineCount=${renderedLines.size} renderedCharLength=${rendered.text.length} containsArticles=$containsArticles containsTotal=$containsTotal markerInjected=$markerInjected",
        )
        Log.i(TAG, "native_print_rendered_text_start commandId=${job.commandId} orderId=${job.orderId ?: ""}")
        renderedLines.forEachIndexed { idx, line ->
            Log.i(TAG, "native_print_rendered_text_line commandId=${job.commandId} orderId=${job.orderId ?: ""} lineIndex=$idx text=$line")
        }
        Log.i(TAG, "native_print_rendered_text_end commandId=${job.commandId} orderId=${job.orderId ?: ""}")
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

    companion object {
        private const val TAG = "NativePrinterWorker"
        private const val DEFAULT_LINE_DELAY_MS = 35L
        private const val DEFAULT_BLOCK_SIZE = 2
    }
}
