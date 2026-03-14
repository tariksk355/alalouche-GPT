package com.alalouche.sunmibridge.nativeprint

import android.content.Context
import android.os.RemoteException
import android.util.Log
import org.json.JSONObject
import java.text.Normalizer
import woyou.aidlservice.jiuiv5.ICallback
import woyou.aidlservice.jiuiv5.IWoyouService

interface NativePrinterWorker {
    fun dispatch(job: NativePrintJobEntity): NativeDispatchReport
}

private enum class PhysicalFidelityStrategy {
    LINE_BY_LINE_TEXT_WITH_DELAY,
    LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP,
    LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII,
    LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING,
    GROUPED_SMALL_BLOCKS,
}

private enum class SemanticSection {
    HEADER,
    CUSTOMER,
    ADDRESS,
    PAYMENT,
    TIMESTAMP,
    HISTORY,
    PREPARATION,
    DIVIDER,
    ARTICLES_HEADER,
    ARTICLE_LINE,
    TOTAL,
    FOOTER_GAP,
}

private data class PhysicalFidelityConfig(
    val strategy: PhysicalFidelityStrategy,
    val dispatchDelayMs: Long,
    val finalSettleMs: Long,
    val perLineWrap: Int,
    val perSectionExtraWrap: Int,
    val finalTicketSpacingLines: Int,
    val addEndDivider: Boolean,
    val asciiSafeMode: Boolean,
    val blockSize: Int,
    val appendNewline: Boolean,
)

private data class SectionLine(
    val section: SemanticSection,
    val text: String,
)

private data class AsciiNormalizationResult(
    val text: String,
    val nonAsciiDetectedCount: Int,
    val replacedGlyphCount: Int,
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
                "native_print_strategy_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=${strategyName(fidelityConfig.strategy)} dispatchDelayMs=${fidelityConfig.dispatchDelayMs} finalSettleMs=${fidelityConfig.finalSettleMs} asciiSafeMode=${fidelityConfig.asciiSafeMode} perLineWrap=${fidelityConfig.perLineWrap} perSectionExtraWrap=${fidelityConfig.perSectionExtraWrap} finalTicketSpacingLines=${fidelityConfig.finalTicketSpacingLines} addEndDivider=${fidelityConfig.addEndDivider} appendNewline=${fidelityConfig.appendNewline} blockSize=${fidelityConfig.blockSize}",
            )

            val callbackErrors = mutableListOf<String>()
            val dispatchStartMs = System.currentTimeMillis()
            val lowLevelSummary = executeRealLowLevelPrint(
                service = session.service,
                job = job,
                renderedText = rendered.text,
                fidelityConfig = fidelityConfig,
                callbackErrors = callbackErrors,
                dispatchStartMs = dispatchStartMs,
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
            "line_by_line_text_with_delay" -> PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_DELAY
            "line_by_line_text_with_explicit_linewrap" -> PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP
            "line_by_line_text_with_explicit_linewrap_ascii" -> PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII
            "line_by_line_ascii_explicit_linewrap_with_ticket_spacing" -> PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING
            "grouped_small_blocks" -> PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS
            else -> DEFAULT_ACTIVE_STRATEGY
        }

        val defaults = if (strategy == PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING) {
            PhysicalFidelityConfig(
                strategy = strategy,
                dispatchDelayMs = 35L,
                finalSettleMs = 120L,
                perLineWrap = 1,
                perSectionExtraWrap = 1,
                finalTicketSpacingLines = 4,
                addEndDivider = false,
                asciiSafeMode = true,
                blockSize = DEFAULT_BLOCK_SIZE,
                appendNewline = false,
            )
        } else {
            PhysicalFidelityConfig(
                strategy = strategy,
                dispatchDelayMs = DEFAULT_LINE_DELAY_MS,
                finalSettleMs = DEFAULT_FINAL_SETTLE_MS,
                perLineWrap = 1,
                perSectionExtraWrap = 0,
                finalTicketSpacingLines = 3,
                addEndDivider = false,
                asciiSafeMode = strategy == PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII,
                blockSize = DEFAULT_BLOCK_SIZE,
                appendNewline = true,
            )
        }

        return defaults.copy(
            dispatchDelayMs = (hints?.optLong("dispatchDelayMs", defaults.dispatchDelayMs)
                ?: hints?.optLong("nativePrintLineDelayMs", defaults.dispatchDelayMs)
                ?: defaults.dispatchDelayMs).coerceIn(0L, 300L),
            finalSettleMs = (hints?.optLong("finalSettleMs", defaults.finalSettleMs)
                ?: hints?.optLong("nativePrintFinalSettleMs", defaults.finalSettleMs)
                ?: defaults.finalSettleMs).coerceIn(0L, 800L),
            perLineWrap = (hints?.optInt("perLineWrap", defaults.perLineWrap) ?: defaults.perLineWrap).coerceIn(0, 3),
            perSectionExtraWrap = (hints?.optInt("perSectionExtraWrap", defaults.perSectionExtraWrap) ?: defaults.perSectionExtraWrap).coerceIn(0, 2),
            finalTicketSpacingLines = (hints?.optInt("finalTicketSpacingLines", defaults.finalTicketSpacingLines) ?: defaults.finalTicketSpacingLines).coerceIn(1, 8),
            addEndDivider = hints?.optBoolean("addEndDivider", defaults.addEndDivider) ?: defaults.addEndDivider,
            asciiSafeMode = hints?.optBoolean("asciiSafeMode", defaults.asciiSafeMode) ?: defaults.asciiSafeMode,
            blockSize = (hints?.optInt("nativePrintBlockSize", defaults.blockSize) ?: defaults.blockSize).coerceIn(2, 3),
            appendNewline = hints?.optBoolean("nativePrintAppendNewline", defaults.appendNewline) ?: defaults.appendNewline,
        )
    }

    private fun executeRealLowLevelPrint(
        service: IWoyouService,
        job: NativePrintJobEntity,
        renderedText: String,
        fidelityConfig: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        callPrinterPrimitive(job, "printerInit") {
            service.printerInit(callbackFor(job, "printerInit", callbackErrors, dispatchStartMs))
        }

        callPrinterPrimitive(job, "setAlignment", detail = "value=0") {
            service.setAlignment(0, callbackFor(job, "setAlignment", callbackErrors, dispatchStartMs))
        }

        val lines = renderedText
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .split("\n")
            .map { it.trimEnd() }
            .filter { it.isNotBlank() }
        val sectionLines = lines.mapIndexed { idx, line ->
            SectionLine(
                section = inferSection(idx, line),
                text = line,
            )
        }

        val asciiStats = if (fidelityConfig.asciiSafeMode) {
            sectionLines.fold(Pair(0, 0)) { acc, sectionLine ->
                val normalized = toSafeAscii(sectionLine.text)
                Pair(acc.first + normalized.nonAsciiDetectedCount, acc.second + normalized.replacedGlyphCount)
            }
        } else {
            Pair(0, 0)
        }

        val useExplicitLineWrapPerLine = fidelityConfig.strategy == PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP ||
            fidelityConfig.strategy == PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII ||
            fidelityConfig.strategy == PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING
        val newlineEmbeddedInPayload = !useExplicitLineWrapPerLine && fidelityConfig.appendNewline

        Log.i(
            TAG,
            "native_print_physical_fidelity_test commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=${strategyName(fidelityConfig.strategy)} renderedLineCount=${sectionLines.size} renderedCharLength=${renderedText.length} explicitLineWrapPerLine=$useExplicitLineWrapPerLine newlineEmbeddedInPayload=$newlineEmbeddedInPayload asciiNormalized=${fidelityConfig.asciiSafeMode} nonAsciiDetectedCount=${asciiStats.first} replacedGlyphCount=${asciiStats.second} perLineWrap=${fidelityConfig.perLineWrap} perSectionExtraWrap=${fidelityConfig.perSectionExtraWrap} finalTicketSpacingLines=${fidelityConfig.finalTicketSpacingLines}",
        )

        when (fidelityConfig.strategy) {
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_DELAY -> {
                sectionLines.forEachIndexed { idx, sectionLine ->
                    val payload = if (fidelityConfig.appendNewline) "${sectionLine.text}\n" else sectionLine.text
                    Log.i(
                        TAG,
                        "native_print_line_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} lineIndex=$idx semanticSection=${sectionLine.section.name} strategy=${strategyName(fidelityConfig.strategy)} originalLength=${sectionLine.text.length} asciiLength=${sectionLine.text.length} payloadLength=${payload.length} newlineAppended=${fidelityConfig.appendNewline} lineWrapAfter=0 extraSectionWrapApplied=false asciiNormalized=false text=${sectionLine.text}",
                    )
                    callPrinterPrimitive(job, "printText", detail = "strategy=delay lineIndex=$idx payloadLength=${payload.length}") {
                        service.printText(payload, callbackFor(job, "printText_line_$idx", callbackErrors, dispatchStartMs))
                    }
                    sleepAfterDispatch(job, idx, fidelityConfig.dispatchDelayMs)
                }
                callPrinterPrimitive(job, "lineWrap", detail = "lines=${fidelityConfig.finalTicketSpacingLines}") {
                    service.lineWrap(fidelityConfig.finalTicketSpacingLines, callbackFor(job, "lineWrap_final", callbackErrors, dispatchStartMs))
                }
            }

            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP,
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII,
            PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING,
            -> {
                sectionLines.forEachIndexed { idx, sectionLine ->
                    val normalized = if (fidelityConfig.asciiSafeMode) toSafeAscii(sectionLine.text) else AsciiNormalizationResult(sectionLine.text, 0, 0)
                    if (fidelityConfig.asciiSafeMode) {
                        Log.i(
                            TAG,
                            "native_print_ascii_normalization commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} lineIndex=$idx semanticSection=${sectionLine.section.name} originalRenderedLine=${sectionLine.text} asciiNormalizedLine=${normalized.text} nonAsciiDetectedCount=${normalized.nonAsciiDetectedCount} replacedGlyphCount=${normalized.replacedGlyphCount}",
                        )
                    }
                    val payload = normalized.text
                    val extraSectionWrap = sectionExtraWrapFor(idx, sectionLines, fidelityConfig.perSectionExtraWrap)
                    Log.i(
                        TAG,
                        "native_print_line_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} lineIndex=$idx semanticSection=${sectionLine.section.name} strategy=${strategyName(fidelityConfig.strategy)} originalLength=${sectionLine.text.length} asciiLength=${normalized.text.length} payloadLength=${payload.length} newlineAppended=false lineWrapAfter=${fidelityConfig.perLineWrap} extraSectionWrapApplied=${extraSectionWrap > 0} asciiNormalized=${fidelityConfig.asciiSafeMode} text=$payload",
                    )
                    callPrinterPrimitive(job, "printText", detail = "strategy=explicit_wrap lineIndex=$idx payloadLength=${payload.length}") {
                        service.printText(payload, callbackFor(job, "printText_line_$idx", callbackErrors, dispatchStartMs))
                    }
                    if (fidelityConfig.perLineWrap > 0) {
                        Log.i(TAG, "native_print_linewrap_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} lineIndex=$idx semanticSection=${sectionLine.section.name} lines=${fidelityConfig.perLineWrap} event=start")
                        callPrinterPrimitive(job, "lineWrap", detail = "lineIndex=$idx lines=${fidelityConfig.perLineWrap}") {
                            service.lineWrap(fidelityConfig.perLineWrap, callbackFor(job, "lineWrap_line_$idx", callbackErrors, dispatchStartMs))
                        }
                        Log.i(TAG, "native_print_linewrap_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} lineIndex=$idx semanticSection=${sectionLine.section.name} lines=${fidelityConfig.perLineWrap} event=end")
                    }
                    if (extraSectionWrap > 0) {
                        Log.i(TAG, "native_print_linewrap_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} lineIndex=$idx semanticSection=${sectionLine.section.name} lines=$extraSectionWrap event=section_extra")
                        callPrinterPrimitive(job, "lineWrap", detail = "lineIndex=$idx sectionExtraWrap=$extraSectionWrap") {
                            service.lineWrap(extraSectionWrap, callbackFor(job, "lineWrap_section_$idx", callbackErrors, dispatchStartMs))
                        }
                    }
                    sleepAfterDispatch(job, idx, fidelityConfig.dispatchDelayMs)
                }
            }

            PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS -> {
                var blockIndex = 0
                sectionLines.chunked(fidelityConfig.blockSize).forEach { chunk ->
                    val block = if (fidelityConfig.appendNewline) {
                        chunk.joinToString(separator = "\n", postfix = "\n") { it.text }
                    } else {
                        chunk.joinToString(separator = "\n") { it.text }
                    }
                    Log.i(
                        TAG,
                        "native_print_block_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=${strategyName(fidelityConfig.strategy)} blockIndex=$blockIndex lineCount=${chunk.size} payloadLength=${block.length} newlineAppended=${fidelityConfig.appendNewline}",
                    )
                    callPrinterPrimitive(job, "printText", detail = "strategy=block blockIndex=$blockIndex payloadLength=${block.length}") {
                        service.printText(block, callbackFor(job, "printText_block_$blockIndex", callbackErrors, dispatchStartMs))
                    }
                    sleepAfterDispatch(job, blockIndex, fidelityConfig.dispatchDelayMs)
                    blockIndex += 1
                }
                callPrinterPrimitive(job, "lineWrap", detail = "lines=${fidelityConfig.finalTicketSpacingLines}") {
                    service.lineWrap(fidelityConfig.finalTicketSpacingLines, callbackFor(job, "lineWrap_final", callbackErrors, dispatchStartMs))
                }
            }
        }

        if (fidelityConfig.addEndDivider) {
            val divider = "--------------------------------"
            Log.i(TAG, "native_print_ticket_divider commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} dividerPrintedAtEnd=true")
            callPrinterPrimitive(job, "printText", detail = "ticketDivider payloadLength=${divider.length}") {
                service.printText(divider, callbackFor(job, "printText_ticket_divider", callbackErrors, dispatchStartMs))
            }
            callPrinterPrimitive(job, "lineWrap", detail = "ticketDivider lines=1") {
                service.lineWrap(1, callbackFor(job, "lineWrap_ticket_divider", callbackErrors, dispatchStartMs))
            }
        }

        if (fidelityConfig.finalTicketSpacingLines > 0) {
            callPrinterPrimitive(job, "lineWrap", detail = "finalTicketSpacing lines=${fidelityConfig.finalTicketSpacingLines}") {
                service.lineWrap(fidelityConfig.finalTicketSpacingLines, callbackFor(job, "lineWrap_final_spacing", callbackErrors, dispatchStartMs))
            }
        }

        if (fidelityConfig.finalSettleMs > 0) {
            Log.i(
                TAG,
                "native_print_final_settle_sleep commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} settleMs=${fidelityConfig.finalSettleMs}",
            )
            runCatching { Thread.sleep(fidelityConfig.finalSettleMs) }
        }

        val rawFeed = byteArrayOf(0x1B, 0x64, 0x03)
        callPrinterPrimitive(job, "sendRAWData", detail = "bytes=${rawFeed.size}") {
            service.sendRAWData(rawFeed, callbackFor(job, "sendRAWData", callbackErrors, dispatchStartMs))
        }

        val primitiveSequence = when (fidelityConfig.strategy) {
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_DELAY -> "printerInit->setAlignment->printText(line+newline)->lineWrap(finalSpacing)->sendRAWData"
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP -> "printerInit->setAlignment->printText(line)->lineWrap(1 each)->lineWrap(finalSpacing)->sendRAWData"
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII -> "printerInit->setAlignment->printText(line_ascii)->lineWrap(1 each)->lineWrap(finalSpacing)->sendRAWData"
            PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING -> "printerInit->setAlignment->printText(line_ascii)->lineWrap(perLine+section+finalSpacing)->sendRAWData"
            PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS -> "printerInit->setAlignment->printText(grouped_small_blocks)->lineWrap(finalSpacing)->sendRAWData"
        }

        Log.i(
            TAG,
            "native_print_physical_fidelity_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=${strategyName(fidelityConfig.strategy)} renderedLineCount=${sectionLines.size} explicitLineWrapPerLine=$useExplicitLineWrapPerLine newlineEmbeddedInPayload=$newlineEmbeddedInPayload asciiNormalized=${fidelityConfig.asciiSafeMode} nonAsciiDetectedCount=${asciiStats.first} replacedGlyphCount=${asciiStats.second} delayMs=${fidelityConfig.dispatchDelayMs} finalSettleMs=${fidelityConfig.finalSettleMs} perLineWrap=${fidelityConfig.perLineWrap} perSectionExtraWrap=${fidelityConfig.perSectionExtraWrap} finalTicketSpacingLines=${fidelityConfig.finalTicketSpacingLines} ticketSeparationMode=explicit_linewrap dividerPrintedAtEnd=${fidelityConfig.addEndDivider} finalSpacingAppliedLines=${fidelityConfig.finalTicketSpacingLines} primitiveSequence=$primitiveSequence",
        )

        return primitiveSequence
    }

    private fun sectionExtraWrapFor(index: Int, lines: List<SectionLine>, perSectionExtraWrap: Int): Int {
        if (perSectionExtraWrap <= 0 || lines.isEmpty()) return 0
        val current = lines[index].section
        val next = lines.getOrNull(index + 1)?.section
        return when {
            current == SemanticSection.HEADER && next != SemanticSection.HEADER -> perSectionExtraWrap
            next == SemanticSection.ARTICLES_HEADER -> perSectionExtraWrap
            next == SemanticSection.TOTAL -> perSectionExtraWrap
            else -> 0
        }
    }

    private fun inferSection(index: Int, line: String): SemanticSection {
        val lower = line.lowercase()
        if (index == 0) return SemanticSection.HEADER
        return when {
            lower.startsWith("adresse") -> SemanticSection.ADDRESS
            lower.startsWith("paiement") -> SemanticSection.PAYMENT
            lower.startsWith("commande") -> SemanticSection.TIMESTAMP
            lower.startsWith("historique") -> SemanticSection.HISTORY
            lower.startsWith("preparation") || lower.startsWith("préparation") -> SemanticSection.PREPARATION
            lower.startsWith("articles") -> SemanticSection.ARTICLES_HEADER
            lower.startsWith("total") -> SemanticSection.TOTAL
            lower.startsWith("----") -> SemanticSection.DIVIDER
            Regex("^\\d+\\s*x\\s+", RegexOption.IGNORE_CASE).containsMatchIn(line) -> SemanticSection.ARTICLE_LINE
            lower.contains("client") -> SemanticSection.CUSTOMER
            else -> SemanticSection.FOOTER_GAP
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

    private fun toSafeAscii(input: String): AsciiNormalizationResult {
        var replacedCount = 0
        var nonAsciiDetected = 0
        val mapped = buildString {
            for (ch in input) {
                val replacement = when (ch) {
                    '•' -> '-'
                    'é', 'è', 'ê', 'ë' -> 'e'
                    'à', 'â', 'ä' -> 'a'
                    'î', 'ï' -> 'i'
                    'ô', 'ö' -> 'o'
                    'ù', 'û', 'ü' -> 'u'
                    'ç' -> 'c'
                    'É', 'È', 'Ê', 'Ë' -> 'E'
                    'À', 'Â', 'Ä' -> 'A'
                    'Î', 'Ï' -> 'I'
                    'Ô', 'Ö' -> 'O'
                    'Ù', 'Û', 'Ü' -> 'U'
                    'Ç' -> 'C'
                    '–', '—' -> '-'
                    '’' -> '\''
                    '“', '”' -> '"'
                    else -> ch
                }
                if (ch.code > 127) nonAsciiDetected += 1
                if (replacement != ch) replacedCount += 1
                append(replacement)
            }
        }

        val normalized = Normalizer.normalize(mapped, Normalizer.Form.NFD)
        val stripped = buildString {
            for (ch in normalized) {
                if (Character.getType(ch) == Character.NON_SPACING_MARK.toInt()) {
                    replacedCount += 1
                    continue
                }
                if (ch.code in 32..126) {
                    append(ch)
                } else {
                    append('?')
                    replacedCount += 1
                }
            }
        }

        return AsciiNormalizationResult(
            text = stripped,
            nonAsciiDetectedCount = nonAsciiDetected,
            replacedGlyphCount = replacedCount,
        )
    }

    private fun strategyName(strategy: PhysicalFidelityStrategy): String {
        return when (strategy) {
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_DELAY -> "line_by_line_text_with_delay"
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP -> "line_by_line_text_with_explicit_linewrap"
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII -> "line_by_line_text_with_explicit_linewrap_ascii"
            PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING -> "line_by_line_ascii_explicit_linewrap_with_ticket_spacing"
            PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS -> "grouped_small_blocks"
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
        dispatchStartMs: Long,
    ): ICallback {
        return object : ICallback.Stub() {
            override fun onRunResult(isSuccess: Boolean) {
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                Log.i(
                    TAG,
                    "native_print_low_level_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=$step callback=onRunResult success=$isSuccess code=NA message=NA deltaMs=$deltaMs",
                )
                if (!isSuccess) {
                    callbackErrors += "$step:onRunResult:false"
                }
            }

            override fun onReturnString(result: String?) {
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                Log.i(
                    TAG,
                    "native_print_low_level_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=$step callback=onReturnString success=true code=NA message=${result ?: ""} deltaMs=$deltaMs",
                )
            }

            override fun onRaiseException(code: Int, msg: String?) {
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                Log.i(
                    TAG,
                    "native_print_low_level_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=$step callback=onRaiseException success=false code=$code message=${msg ?: "unknown"} deltaMs=$deltaMs",
                )
                callbackErrors += "$step:onRaiseException:$code:${msg ?: "unknown"}"
            }
        }
    }

    companion object {
        private const val TAG = "NativePrinterWorker"
        private val DEFAULT_ACTIVE_STRATEGY = PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING
        private const val DEFAULT_LINE_DELAY_MS = 35L
        private const val DEFAULT_FINAL_SETTLE_MS = 120L
        private const val DEFAULT_BLOCK_SIZE = 2
    }
}
