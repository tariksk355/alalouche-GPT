package com.alalouche.sunmibridge.nativeprint

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.RemoteException
import android.util.Log
import org.json.JSONObject
import java.text.Normalizer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
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
    TEXT_VENDOR_PARITY_UNBUFFERED,
    DIRECT_SELF_CHECK_THEN_MINIMAL_TEXT,
    TEXT_VENDOR_PARITY_BUFFERED,
    BITMAP_RECEIPT_SINGLE_IMAGE,
    BITMAP_RECEIPT_SEGMENTED_BLOCKS,
    BITMAP_SMOKE_TEST_MINIMAL_BLOCKS,
    VENDOR_PARITY_WOYOU_MINIMAL_TEST,
    VENDOR_PARITY_BITMAP_CUSTOM_COMPARE,
    VENDOR_PARITY_BITMAP_PHYSICAL_DIAGNOSTICS,
    TRANSACTION_MODE_TINY_DIAGNOSTIC_TEST,
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
    val bitmapWidthPx: Int,
    val horizontalPaddingPx: Int,
    val topPaddingPx: Int,
    val bottomPaddingPx: Int,
    val lineHeightPx: Int,
    val sectionGapPx: Int,
    val finalFooterGapPx: Int,
    val bitmapInterBlockGapPx: Int,
    val bitmapSegmentedMode: Boolean,
    val smokeTestBitmapWidthPx: Int,
    val smokeTestHorizontalPaddingPx: Int,
    val smokeTestTopPaddingPx: Int,
    val smokeTestBottomPaddingPx: Int,
    val smokeTestLineHeightPx: Int,
    val smokeTestInterBlockSpacingLines: Int,
    val smokeTestFinalSpacingLines: Int,
    val vendorParityMode: String,
    val vendorParityFinalSpacingLines: Int,
    val vendorParityDispatchDelayMs: Int,
    val vendorParityFinalSettleMs: Int,
    val vendorBitmapCompareRunAllModes: Boolean,
    val vendorBitmapCompareMode: String,
    val vendorBitmapWidthPx: Int,
    val vendorBitmapHorizontalPaddingPx: Int,
    val vendorBitmapTopPaddingPx: Int,
    val vendorBitmapBottomPaddingPx: Int,
    val vendorBitmapLineHeightPx: Int,
    val vendorBitmapSpacingLinesAfterEachMode: Int,
    val vendorBitmapFinalSpacingLines: Int,
    val vendorBitmapDispatchDelayMs: Int,
    val vendorBitmapFinalSettleMs: Int,
    val transactionDiagnosticMode: String,
    val transactionDiagnosticFinalSpacingLines: Int,
    val transactionDiagnosticDispatchDelayMs: Int,
    val transactionDiagnosticFinalSettleMs: Int,
    val requestedNativePrintStrategyRaw: String,
    val requestedNativePrintStrategySource: String,
    val requestedOutputStrategyRaw: String,
    val normalizedRequestedStrategy: String,
    val strategyFallbackApplied: Boolean,
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

private data class BitmapRenderResult(
    val bitmap: Bitmap,
    val widthPx: Int,
    val heightPx: Int,
    val lineCount: Int,
    val firstLinePreview: String,
    val lastLinePreview: String,
)

private data class TransactionCallbackStats(
    var anyCallbackFired: Boolean = false,
    var onRunResultFired: Boolean = false,
    var onReturnStringFired: Boolean = false,
    var onRaiseExceptionFired: Boolean = false,
    var onPrintResultFired: Boolean = false,
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

private enum class RobustPrintTestMode(
    val strategyMode: String,
    val usePrinterInit: Boolean,
) {
    MODE_A(strategyMode = "buffered_transactional_text", usePrinterInit = true),
    MODE_B(strategyMode = "buffered_transactional_text", usePrinterInit = false),
    MODE_C(strategyMode = "single_block_text", usePrinterInit = false),
    MODE_D(strategyMode = "single_block_text", usePrinterInit = true),
    MODE_E(strategyMode = "bitmap_segmented", usePrinterInit = false),
    MODE_F(strategyMode = "bitmap_segmented", usePrinterInit = true),
    BUFFER_PROBE_ONLY(strategyMode = "buffer_probe_only", usePrinterInit = false),
    SINGLE_BLOCK_TEXT_CALLBACK_GATED(strategyMode = "single_block_text_callback_gated", usePrinterInit = false),
}

private enum class FinalizePolicy {
    FINALIZE_NONE,
    FINALIZE_LINEWRAP_ONLY,
    FINALIZE_LINEWRAP_PLUS_RAW,
    FINALIZE_EXTRA_FEED_THEN_SLEEP,
}

private data class LowLevelExecutionTelemetry(
    var selectedTestMode: String = "LEGACY_DEFAULT",
    var fallbackUsed: Boolean = false,
    var binderAccepted: Boolean = true,
    var callbackObserved: Boolean = false,
    var callbackSuccess: Boolean = false,
    var exceptionObserved: Boolean = false,
    var exceptionOriginOp: String = "none",
    var exceptionClass: String = "none",
    var exceptionMessage: String = "",
)

class SunmiNativePrinterWorker(
    context: Context,
) : NativePrinterWorker {

    private val connector = NativePrinterServiceConnector(context)

    override fun dispatch(job: NativePrintJobEntity): NativeDispatchReport {
        val session = connector.connect(job.commandId, job.orderId, job.sourceJobId)
        val selectedFamily = session.selectedFamily?.familyName
        val selectedPackage = session.selectedFamily?.packageName
        val selectedAction = session.selectedFamily?.action
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

            val fidelityConfig = parsePhysicalFidelityConfig(job)
            Log.i(
                TAG,
                "native_print_strategy_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=${strategyName(fidelityConfig.strategy)} requestedOutputStrategyRaw=${fidelityConfig.requestedOutputStrategyRaw} normalizedStrategyName=${fidelityConfig.normalizedRequestedStrategy} strategySource=${fidelityConfig.requestedNativePrintStrategySource} fallbackApplied=${fidelityConfig.strategyFallbackApplied} dispatchDelayMs=${fidelityConfig.dispatchDelayMs} finalSettleMs=${fidelityConfig.finalSettleMs} asciiSafeMode=${fidelityConfig.asciiSafeMode} perLineWrap=${fidelityConfig.perLineWrap} perSectionExtraWrap=${fidelityConfig.perSectionExtraWrap} finalTicketSpacingLines=${fidelityConfig.finalTicketSpacingLines} addEndDivider=${fidelityConfig.addEndDivider} bitmapSegmentedMode=${fidelityConfig.bitmapSegmentedMode} selectedFamily=${selectedFamily ?: ""} packageName=${selectedPackage ?: ""} action=${selectedAction ?: ""}",
            )

            val renderedTextForDispatch = if (fidelityConfig.strategy == PhysicalFidelityStrategy.BITMAP_SMOKE_TEST_MINIMAL_BLOCKS || fidelityConfig.strategy == PhysicalFidelityStrategy.VENDOR_PARITY_WOYOU_MINIMAL_TEST || fidelityConfig.strategy == PhysicalFidelityStrategy.VENDOR_PARITY_BITMAP_CUSTOM_COMPARE || fidelityConfig.strategy == PhysicalFidelityStrategy.VENDOR_PARITY_BITMAP_PHYSICAL_DIAGNOSTICS || fidelityConfig.strategy == PhysicalFidelityStrategy.TRANSACTION_MODE_TINY_DIAGNOSTIC_TEST || fidelityConfig.strategy == PhysicalFidelityStrategy.DIRECT_SELF_CHECK_THEN_MINIMAL_TEXT) {
                Log.i(
                    TAG,
                    "native_print_smoke_test_render_bypass commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=${strategyName(fidelityConfig.strategy)} bypassRealPayloadRender=true",
                )
                ""
            } else {
                val rendered = renderPrintableText(job)
                logRenderedText(job, rendered)
                rendered.text
            }

            val callbackErrors = mutableListOf<String>()
            val dispatchStartMs = System.currentTimeMillis()
            val lowLevelSummary = executeRealLowLevelPrint(
                service = session.service,
                job = job,
                renderedText = renderedTextForDispatch,
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
            Log.e(TAG, "native_print_low_level_exception commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=render_text reason=${e.message ?: "render_error"}")
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
            Log.e(TAG, "native_print_low_level_exception commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} step=${e.step} reason=${cause.message ?: "unknown"} exceptionClass=${cause::class.java.name} exceptionOriginOp=${e.step} exceptionMessage=${cause.message ?: "unknown"} modeCompatibilityHint=${modeCompatibilityHint(e.step, cause)}")
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
        val strategyFromNativeHint = hints?.optString("nativePrintStrategy", "")?.trim().orEmpty()
        val strategyFromOutputHint = hints?.optString("outputStrategy", "")?.trim().orEmpty()
        val strategyRawCandidate = when {
            strategyFromNativeHint.isNotBlank() -> strategyFromNativeHint
            strategyFromOutputHint.isNotBlank() -> strategyFromOutputHint
            else -> ""
        }
        val normalizedStrategyRawCandidate = strategyRawCandidate.lowercase().trim()
        val strategyRaw = when {
            normalizedStrategyRawCandidate.contains("direct_self_check_then_minimal_text") -> "direct_self_check_then_minimal_text"
            normalizedStrategyRawCandidate.contains("text_vendor_parity_unbuffered") -> "text_vendor_parity_unbuffered"
            normalizedStrategyRawCandidate.contains("text_vendor_parity_buffered") -> "text_vendor_parity_buffered"
            else -> normalizedStrategyRawCandidate
        }
        val strategySource = when {
            strategyFromNativeHint.isNotBlank() -> "formattingHints.nativePrintStrategy"
            strategyFromOutputHint.isNotBlank() -> "formattingHints.outputStrategy"
            else -> "default"
        }
        val bitmapSegmentedMode = hints?.optBoolean("bitmapSegmentedMode", true) ?: true
        val strategy = when (strategyRaw) {
            "bitmap_receipt_single_image" -> PhysicalFidelityStrategy.BITMAP_RECEIPT_SINGLE_IMAGE
            "bitmap_receipt_segmented_blocks" -> PhysicalFidelityStrategy.BITMAP_RECEIPT_SEGMENTED_BLOCKS
            "bitmap_smoke_test_minimal_blocks" -> PhysicalFidelityStrategy.BITMAP_SMOKE_TEST_MINIMAL_BLOCKS
            "vendor_parity_woyou_minimal_test" -> PhysicalFidelityStrategy.VENDOR_PARITY_WOYOU_MINIMAL_TEST
            "vendor_parity_bitmap_custom_compare" -> PhysicalFidelityStrategy.VENDOR_PARITY_BITMAP_CUSTOM_COMPARE
            "vendor_parity_bitmap_physical_diagnostics" -> PhysicalFidelityStrategy.VENDOR_PARITY_BITMAP_PHYSICAL_DIAGNOSTICS
            "transaction_mode_tiny_diagnostic_test" -> PhysicalFidelityStrategy.TRANSACTION_MODE_TINY_DIAGNOSTIC_TEST
            "line_by_line_text_with_delay" -> PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_DELAY
            "line_by_line_text_with_explicit_linewrap" -> PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP
            "line_by_line_text_with_explicit_linewrap_ascii" -> PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII
            "line_by_line_ascii_explicit_linewrap_with_ticket_spacing" -> PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING
            "text_vendor_parity_unbuffered" -> PhysicalFidelityStrategy.TEXT_VENDOR_PARITY_UNBUFFERED
            "direct_self_check_then_minimal_text" -> PhysicalFidelityStrategy.DIRECT_SELF_CHECK_THEN_MINIMAL_TEXT
            "text_vendor_parity_buffered" -> PhysicalFidelityStrategy.TEXT_VENDOR_PARITY_UNBUFFERED
            "grouped_small_blocks" -> PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS
            else -> DEFAULT_ACTIVE_STRATEGY
        }
        val strategyFallbackApplied = strategyRaw.isBlank() || (strategy == DEFAULT_ACTIVE_STRATEGY && strategyRaw !in setOf(
            "bitmap_receipt_single_image",
            "bitmap_receipt_segmented_blocks",
            "bitmap_smoke_test_minimal_blocks",
            "vendor_parity_woyou_minimal_test",
            "vendor_parity_bitmap_custom_compare",
            "vendor_parity_bitmap_physical_diagnostics",
            "transaction_mode_tiny_diagnostic_test",
            "line_by_line_text_with_delay",
            "line_by_line_text_with_explicit_linewrap",
            "line_by_line_text_with_explicit_linewrap_ascii",
            "line_by_line_ascii_explicit_linewrap_with_ticket_spacing",
            "text_vendor_parity_unbuffered",
            "direct_self_check_then_minimal_text",
            "text_vendor_parity_buffered",
            "grouped_small_blocks",
        ))
        Log.i(TAG, "native_print_strategy_parse commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} requestedOutputStrategyRaw=${strategyFromOutputHint} requestedNativePrintStrategyRaw=${strategyFromNativeHint} normalizedStrategyName=${strategyRaw} selectedStrategy=${strategyName(strategy)} strategySource=$strategySource fallbackApplied=$strategyFallbackApplied")

        return PhysicalFidelityConfig(
            strategy = strategy,
            dispatchDelayMs = (hints?.optLong("dispatchDelayMs", 35L) ?: 35L).coerceIn(0L, 400L),
            finalSettleMs = (hints?.optLong("finalSettleMs", 150L) ?: 150L).coerceIn(0L, 1000L),
            perLineWrap = (hints?.optInt("perLineWrap", 1) ?: 1).coerceIn(0, 3),
            perSectionExtraWrap = (hints?.optInt("perSectionExtraWrap", 1) ?: 1).coerceIn(0, 3),
            finalTicketSpacingLines = (hints?.optInt("finalTicketSpacingLines", 4) ?: 4).coerceIn(1, 10),
            addEndDivider = hints?.optBoolean("addEndDivider", false) ?: false,
            asciiSafeMode = hints?.optBoolean("asciiSafeMode", true) ?: true,
            blockSize = (hints?.optInt("nativePrintBlockSize", 2) ?: 2).coerceIn(2, 3),
            appendNewline = hints?.optBoolean("nativePrintAppendNewline", false) ?: false,
            bitmapWidthPx = (hints?.optInt("bitmapWidthPx", DEFAULT_BITMAP_WIDTH_PX) ?: DEFAULT_BITMAP_WIDTH_PX).coerceIn(280, 640),
            horizontalPaddingPx = (hints?.optInt("horizontalPaddingPx", 16) ?: 16).coerceIn(4, 40),
            topPaddingPx = (hints?.optInt("topPaddingPx", 20) ?: 20).coerceIn(0, 80),
            bottomPaddingPx = (hints?.optInt("bottomPaddingPx", 20) ?: 20).coerceIn(0, 120),
            lineHeightPx = (hints?.optInt("lineHeightPx", 34) ?: 34).coerceIn(20, 64),
            sectionGapPx = (hints?.optInt("sectionGapPx", 20) ?: 20).coerceIn(0, 80),
            finalFooterGapPx = (hints?.optInt("finalFooterGapPx", 80) ?: 80).coerceIn(0, 220),
            bitmapInterBlockGapPx = (hints?.optInt("bitmapInterBlockGapPx", 12) ?: 12).coerceIn(0, 80),
            bitmapSegmentedMode = bitmapSegmentedMode,
            smokeTestBitmapWidthPx = (hints?.optInt("smokeTestBitmapWidthPx", 384) ?: 384).coerceIn(280, 640),
            smokeTestHorizontalPaddingPx = (hints?.optInt("smokeTestHorizontalPaddingPx", 16) ?: 16).coerceIn(4, 40),
            smokeTestTopPaddingPx = (hints?.optInt("smokeTestTopPaddingPx", 20) ?: 20).coerceIn(0, 80),
            smokeTestBottomPaddingPx = (hints?.optInt("smokeTestBottomPaddingPx", 20) ?: 20).coerceIn(0, 120),
            smokeTestLineHeightPx = (hints?.optInt("smokeTestLineHeightPx", 36) ?: 36).coerceIn(20, 64),
            smokeTestInterBlockSpacingLines = (hints?.optInt("smokeTestInterBlockSpacingLines", 5) ?: 5).coerceIn(1, 10),
            smokeTestFinalSpacingLines = (hints?.optInt("smokeTestFinalSpacingLines", 6) ?: 6).coerceIn(1, 12),
            vendorParityMode = hints?.optString("vendorParityMode", "text")?.lowercase()?.let { if (it == "bitmap") "bitmap" else "text" } ?: "text",
            vendorParityFinalSpacingLines = (hints?.optInt("vendorParityFinalSpacingLines", 4) ?: 4).coerceIn(1, 12),
            vendorParityDispatchDelayMs = (hints?.optInt("vendorParityDispatchDelayMs", 35) ?: 35).coerceIn(0, 400),
            vendorParityFinalSettleMs = (hints?.optInt("vendorParityFinalSettleMs", 150) ?: 150).coerceIn(0, 1000),
            vendorBitmapCompareRunAllModes = hints?.optBoolean("vendorBitmapCompareRunAllModes", true) ?: true,
            vendorBitmapCompareMode = hints?.optString("vendorBitmapCompareMode", "A")?.uppercase()?.let { if (it in setOf("A","B","C","D")) it else "A" } ?: "A",
            vendorBitmapWidthPx = (hints?.optInt("vendorBitmapWidthPx", 384) ?: 384).coerceIn(280, 640),
            vendorBitmapHorizontalPaddingPx = (hints?.optInt("vendorBitmapHorizontalPaddingPx", 16) ?: 16).coerceIn(4, 40),
            vendorBitmapTopPaddingPx = (hints?.optInt("vendorBitmapTopPaddingPx", 20) ?: 20).coerceIn(0, 80),
            vendorBitmapBottomPaddingPx = (hints?.optInt("vendorBitmapBottomPaddingPx", 20) ?: 20).coerceIn(0, 120),
            vendorBitmapLineHeightPx = (hints?.optInt("vendorBitmapLineHeightPx", 36) ?: 36).coerceIn(20, 64),
            vendorBitmapSpacingLinesAfterEachMode = (hints?.optInt("vendorBitmapSpacingLinesAfterEachMode", 5) ?: 5).coerceIn(1, 12),
            vendorBitmapFinalSpacingLines = (hints?.optInt("vendorBitmapFinalSpacingLines", 6) ?: 6).coerceIn(1, 14),
            vendorBitmapDispatchDelayMs = (hints?.optInt("vendorBitmapDispatchDelayMs", 35) ?: 35).coerceIn(0, 400),
            vendorBitmapFinalSettleMs = (hints?.optInt("vendorBitmapFinalSettleMs", 150) ?: 150).coerceIn(0, 1000),
            transactionDiagnosticMode = hints?.optString("transactionDiagnosticMode", "text")?.lowercase()?.let { if (it == "bitmap") "bitmap" else "text" } ?: "text",
            transactionDiagnosticFinalSpacingLines = (hints?.optInt("transactionDiagnosticFinalSpacingLines", 4) ?: 4).coerceIn(1, 12),
            transactionDiagnosticDispatchDelayMs = (hints?.optInt("transactionDiagnosticDispatchDelayMs", 35) ?: 35).coerceIn(0, 400),
            transactionDiagnosticFinalSettleMs = (hints?.optInt("transactionDiagnosticFinalSettleMs", 200) ?: 200).coerceIn(0, 1200),
            requestedNativePrintStrategyRaw = strategyRaw,
            requestedNativePrintStrategySource = strategySource,
            requestedOutputStrategyRaw = strategyFromOutputHint,
            normalizedRequestedStrategy = strategyRaw,
            strategyFallbackApplied = strategyFallbackApplied,
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
        val testMode = resolveRobustTestMode()
        val usePrinterInit = testMode?.usePrinterInit ?: ENABLE_PRINTER_INIT_BEFORE_DISPATCH
        val finalizePolicy = resolveFinalizePolicy()
        val telemetry = LowLevelExecutionTelemetry(selectedTestMode = testMode?.name ?: "LEGACY_DEFAULT")
        activeTelemetry.set(telemetry)
        Log.i(TAG, "native_print_test_matrix_selection commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=${telemetry.selectedTestMode} selectedFamily=woyou_legacy_packaged strategyHint=${testMode?.strategyMode ?: "legacy"} usePrinterInit=$usePrinterInit finalizeMode=${finalizePolicy.name.lowercase()} defaultRecommendation=$DEFAULT_ROBUST_TEST_MODE")
        try {
            Log.i(TAG, "native_print_printer_init_policy commandId=${job.commandId} orderId=${job.orderId ?: ""} usePrinterInit=$usePrinterInit selectedTestMode=${telemetry.selectedTestMode}")
            if (usePrinterInit) {
                callPrinterPrimitive(job, "printerInit") {
                    service.printerInit(callbackFor(job, "printerInit", callbackErrors, dispatchStartMs))
                }
            } else {
                Log.i(TAG, "native_print_printer_init_skipped commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=${telemetry.selectedTestMode}")
            }
            callPrinterPrimitive(job, "setAlignment", detail = "value=0") {
                service.setAlignment(0, callbackFor(job, "setAlignment", callbackErrors, dispatchStartMs))
            }

            val lines = renderedText.replace("\r\n", "\n").replace("\r", "\n").split("\n").map { it.trimEnd() }.filter { it.isNotBlank() }
            val sectionLines = lines.mapIndexed { idx, line -> SectionLine(inferSection(idx, line), "%02d %s".format(idx + 1, line)) }

            if (fidelityConfig.requestedNativePrintStrategyRaw == "transaction_mode_tiny_diagnostic_test" && fidelityConfig.strategy != PhysicalFidelityStrategy.TRANSACTION_MODE_TINY_DIAGNOSTIC_TEST) {
                Log.e(TAG, "native_print_transaction_strategy_misroute commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} requestedStrategy=${fidelityConfig.requestedNativePrintStrategyRaw} selectedStrategy=${strategyName(fidelityConfig.strategy)} strategySource=${fidelityConfig.requestedNativePrintStrategySource}")
                throw LowLevelStepException("strategy_resolution", IllegalStateException("transaction_mode_tiny_diagnostic_test requested but resolved to ${strategyName(fidelityConfig.strategy)}"))
            }

            val lowLevelSummary = if (testMode != null) {
                telemetry.fallbackUsed = false
                executeStrictExperimentMode(service, job, sectionLines, fidelityConfig, callbackErrors, dispatchStartMs, finalizePolicy, testMode)
            } else {
                when (fidelityConfig.strategy) {
                    PhysicalFidelityStrategy.BITMAP_RECEIPT_SINGLE_IMAGE,
                    PhysicalFidelityStrategy.BITMAP_RECEIPT_SEGMENTED_BLOCKS,
                    PhysicalFidelityStrategy.BITMAP_SMOKE_TEST_MINIMAL_BLOCKS,
                    -> executeBitmapStrategies(service, job, sectionLines, fidelityConfig, callbackErrors, dispatchStartMs, finalizePolicy, null)
                    PhysicalFidelityStrategy.VENDOR_PARITY_WOYOU_MINIMAL_TEST -> executeVendorParityWoyouMinimalTest(service, job, fidelityConfig, callbackErrors, dispatchStartMs)
                    PhysicalFidelityStrategy.VENDOR_PARITY_BITMAP_CUSTOM_COMPARE -> executeVendorParityBitmapCustomCompare(service, job, fidelityConfig, callbackErrors, dispatchStartMs)
                    PhysicalFidelityStrategy.VENDOR_PARITY_BITMAP_PHYSICAL_DIAGNOSTICS -> executeVendorParityBitmapPhysicalDiagnostics(service, job, fidelityConfig, callbackErrors, dispatchStartMs)
                    PhysicalFidelityStrategy.TRANSACTION_MODE_TINY_DIAGNOSTIC_TEST -> executeTransactionModeTinyDiagnosticTest(service, job, fidelityConfig, callbackErrors, dispatchStartMs)
                    PhysicalFidelityStrategy.TEXT_VENDOR_PARITY_UNBUFFERED -> executeTextVendorParityRobust(service, job, sectionLines, fidelityConfig, callbackErrors, dispatchStartMs, finalizePolicy)
                    PhysicalFidelityStrategy.DIRECT_SELF_CHECK_THEN_MINIMAL_TEXT -> executeDirectSelfCheckThenMinimalText(service, job, fidelityConfig, callbackErrors, dispatchStartMs)
                    PhysicalFidelityStrategy.TEXT_VENDOR_PARITY_BUFFERED -> executeTextVendorParityBuffered(service, job, sectionLines, fidelityConfig, callbackErrors, dispatchStartMs, finalizePolicy, null)
                    else -> executeTextStrategies(service, job, sectionLines, fidelityConfig, callbackErrors, dispatchStartMs)
                }
            }

            Log.i(TAG, "native_print_experiment_result commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=${telemetry.selectedTestMode} fallbackUsed=${telemetry.fallbackUsed} exceptionOriginOp=${telemetry.exceptionOriginOp} primitiveSequence=$lowLevelSummary binderAccepted=${telemetry.binderAccepted} callbackObserved=${telemetry.callbackObserved} callbackSuccess=${telemetry.callbackSuccess} exceptionObserved=${telemetry.exceptionObserved} physicalOutcome=UNKNOWN")
            return lowLevelSummary
        } finally {
            activeTelemetry.remove()
        }
    }

    private fun executeVendorParityWoyouMinimalTest(
        service: IWoyouService,
        job: NativePrintJobEntity,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        Log.i(TAG, "native_print_vendor_parity_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} strategy=vendor_parity_woyou_minimal_test")
        Log.i(TAG, "native_print_vendor_parity_mode commandId=${job.commandId} orderId=${job.orderId ?: ""} mode=${config.vendorParityMode}")
        Log.i(TAG, "native_print_vendor_parity_service_info commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedFamily=woyou_legacy_packaged packageName=woyou.aidlservice.jiuiv5 interfaceAction=woyou.aidlservice.jiuiv5.IWoyouService")

        callPrinterPrimitive(job, "setAlignment", detail = "vendorParity value=0") {
            service.setAlignment(0, callbackFor(job, "vendorParity_setAlignment", callbackErrors, dispatchStartMs))
        }

        if (config.vendorParityMode == "bitmap") {
            val render = renderSmokeBitmapBlock(listOf("WOYOU TEST B", "0987654321"), config)
            Log.i(TAG, "native_print_vendor_parity_bitmap_dimensions commandId=${job.commandId} orderId=${job.orderId ?: ""} widthPx=${render.widthPx} heightPx=${render.heightPx} lineCount=${render.lineCount}")
            Log.i(TAG, "native_print_vendor_parity_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=printBitmap")
            callPrinterPrimitive(job, "printBitmap", detail = "vendorParity bitmap width=${render.widthPx} height=${render.heightPx}") {
                service.printBitmap(render.bitmap, callbackFor(job, "vendorParity_printBitmap", callbackErrors, dispatchStartMs))
            }
            render.bitmap.recycle()
        } else {
            Log.i(TAG, "native_print_vendor_parity_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=printText_1")
            Log.i(TAG, "native_print_vendor_parity_text_payload commandId=${job.commandId} orderId=${job.orderId ?: ""} payload=WOYOU TEST A payloadLength=12")
            callPrinterPrimitive(job, "printText", detail = "vendorParity payloadLength=12") {
                service.printText("WOYOU TEST A", callbackFor(job, "vendorParity_printText_1", callbackErrors, dispatchStartMs))
            }
            Log.i(TAG, "native_print_vendor_parity_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=lineWrap_1")
            callPrinterPrimitive(job, "lineWrap", detail = "vendorParity lines=1") {
                service.lineWrap(1, callbackFor(job, "vendorParity_lineWrap_1", callbackErrors, dispatchStartMs))
            }

            sleepAfterDispatch(job, 0, config.vendorParityDispatchDelayMs.toLong())

            Log.i(TAG, "native_print_vendor_parity_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=printText_2")
            Log.i(TAG, "native_print_vendor_parity_text_payload commandId=${job.commandId} orderId=${job.orderId ?: ""} payload=1234567890 payloadLength=10")
            callPrinterPrimitive(job, "printText", detail = "vendorParity payloadLength=10") {
                service.printText("1234567890", callbackFor(job, "vendorParity_printText_2", callbackErrors, dispatchStartMs))
            }
        }

        Log.i(TAG, "native_print_vendor_parity_spacing commandId=${job.commandId} orderId=${job.orderId ?: ""} requestedLines=${config.vendorParityFinalSpacingLines}")
        callPrinterPrimitive(job, "lineWrap", detail = "vendorParity finalSpacing lines=${config.vendorParityFinalSpacingLines}") {
            service.lineWrap(config.vendorParityFinalSpacingLines, callbackFor(job, "vendorParity_lineWrap_final", callbackErrors, dispatchStartMs))
        }

        if (config.vendorParityFinalSettleMs > 0) {
            runCatching { Thread.sleep(config.vendorParityFinalSettleMs.toLong()) }
        }

        val rawFeed = byteArrayOf(0x1B, 0x64, 0x03)
        callPrinterPrimitive(job, "sendRAWData", detail = "vendorParity bytes=${rawFeed.size}") {
            service.sendRAWData(rawFeed, callbackFor(job, "vendorParity_sendRaw", callbackErrors, dispatchStartMs))
        }

        val sequence = if (config.vendorParityMode == "bitmap") {
            "printerInit->setAlignment->printBitmap(tiny)->lineWrap(final)->sendRAWData"
        } else {
            "printerInit->setAlignment->printText->lineWrap(1)->printText->lineWrap(final)->sendRAWData"
        }
        Log.i(TAG, "native_print_vendor_parity_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} mode=${config.vendorParityMode} finalSpacingLines=${config.vendorParityFinalSpacingLines} dispatchDelayMs=${config.vendorParityDispatchDelayMs} finalSettleMs=${config.vendorParityFinalSettleMs} primitiveSequence=$sequence")
        return sequence
    }

    private fun executeVendorParityBitmapCustomCompare(
        service: IWoyouService,
        job: NativePrintJobEntity,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        val localAidlHasPrintBitmap = true
        val localAidlHasPrintBitmapCustom = false
        Log.i(TAG, "native_print_vendor_bitmap_compare_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=vendor_parity_bitmap_custom_compare runAllModes=${config.vendorBitmapCompareRunAllModes} requestedMode=${config.vendorBitmapCompareMode}")
        Log.i(TAG, "native_print_vendor_bitmap_compare_service_info commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedFamily=woyou_legacy_packaged packageName=woyou.aidlservice.jiuiv5 interfaceAction=woyou.aidlservice.jiuiv5.IWoyouService")
        Log.i(TAG, "native_print_vendor_bitmap_capability printBitmapAvailable=$localAidlHasPrintBitmap printBitmapCustomAvailable=$localAidlHasPrintBitmapCustom")
        Log.i(TAG, "native_print_vendor_capability_summary localAidlHasPrintBitmap=$localAidlHasPrintBitmap localAidlHasPrintBitmapCustom=$localAidlHasPrintBitmapCustom")

        val modes = if (config.vendorBitmapCompareRunAllModes) listOf("A", "B", "C", "D") else listOf(config.vendorBitmapCompareMode)

        modes.forEachIndexed { modeIndex, mode ->
            val (label, variant) = when (mode) {
                "A" -> Pair("MODE A printBitmap baseline", "printBitmap")
                "B" -> Pair("MODE B printBitmap compare-slot-0", "printBitmap")
                "C" -> Pair("MODE C printBitmap compare-slot-1", "printBitmap")
                else -> Pair("MODE D printBitmap compare-slot-2", "printBitmap")
            }
            val lines = listOf(label, "1234567890", "ABCDEFGHIJ")
            val render = renderVendorBitmapComparePayload(lines, config)
            Log.i(TAG, "native_print_vendor_bitmap_compare_mode_start commandId=${job.commandId} orderId=${job.orderId ?: ""} modeLabel=$label variant=$variant payloadPreview=${lines.joinToString(" | ")}")
            Log.i(TAG, "native_print_vendor_bitmap_compare_bitmap_dimensions commandId=${job.commandId} orderId=${job.orderId ?: ""} modeLabel=$label variant=$variant widthPx=${render.widthPx} heightPx=${render.heightPx} lineCount=${render.lineCount}")
            try {
                Log.i(TAG, "native_print_vendor_bitmap_compare_print_call commandId=${job.commandId} orderId=${job.orderId ?: ""} modeLabel=$label variant=$variant event=start")
                callPrinterPrimitive(job, "printBitmap", detail = "vendorCompare mode=$mode variant=$variant width=${render.widthPx} height=${render.heightPx}") {
                    service.printBitmap(render.bitmap, callbackFor(job, "vendorCompare_${mode}_printBitmap", callbackErrors, dispatchStartMs))
                }
                Log.i(TAG, "native_print_vendor_bitmap_compare_print_call commandId=${job.commandId} orderId=${job.orderId ?: ""} modeLabel=$label variant=$variant event=end")
            } finally {
                render.bitmap.recycle()
            }

            val spacing = if (modeIndex == modes.lastIndex) config.vendorBitmapFinalSpacingLines else config.vendorBitmapSpacingLinesAfterEachMode
            Log.i(TAG, "native_print_vendor_bitmap_compare_spacing_applied commandId=${job.commandId} orderId=${job.orderId ?: ""} modeLabel=$label spacingType=${if (modeIndex == modes.lastIndex) "final" else "between_modes"} requestedLines=$spacing")
            callPrinterPrimitive(job, "lineWrap", detail = "vendorCompare mode=$mode lines=$spacing") {
                service.lineWrap(spacing, callbackFor(job, "vendorCompare_${mode}_lineWrap", callbackErrors, dispatchStartMs))
            }
            Log.i(TAG, "native_print_vendor_bitmap_compare_mode_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} modeLabel=$label variant=$variant spacingLinesAfterMode=$spacing")
            sleepAfterDispatch(job, modeIndex, config.vendorBitmapDispatchDelayMs.toLong())
        }

        if (config.vendorBitmapFinalSettleMs > 0) {
            runCatching { Thread.sleep(config.vendorBitmapFinalSettleMs.toLong()) }
        }

        val rawFeed = byteArrayOf(0x1B, 0x64, 0x03)
        callPrinterPrimitive(job, "sendRAWData", detail = "vendorBitmapCompare bytes=${rawFeed.size}") {
            service.sendRAWData(rawFeed, callbackFor(job, "vendorBitmapCompare_sendRaw", callbackErrors, dispatchStartMs))
        }

        val sequence = "printerInit->setAlignment->printBitmap(compare A/B/C/D)->lineWrap(spacing)->sendRAWData"
        Log.i(TAG, "native_print_vendor_bitmap_compare_final_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} modes=${modes.joinToString(",")} spacingLinesAfterEachMode=${config.vendorBitmapSpacingLinesAfterEachMode} finalSpacingLines=${config.vendorBitmapFinalSpacingLines} dispatchDelayMs=${config.vendorBitmapDispatchDelayMs} finalSettleMs=${config.vendorBitmapFinalSettleMs} primitiveSequence=$sequence")
        return sequence
    }



    private fun executeVendorParityBitmapPhysicalDiagnostics(
        service: IWoyouService,
        job: NativePrintJobEntity,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        val strategy = "vendor_parity_bitmap_physical_diagnostics"
        val events = mutableListOf<String>()
        Log.i(TAG, "native_print_vendor_physical_diagnostics_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=$strategy selectedFamily=woyou_legacy_packaged packageName=woyou.aidlservice.jiuiv5 action=woyou.aidlservice.jiuiv5.IWoyouService")

        // Experiment 1: single tall bitmap
        runCatching {
            val lines = listOf("HEADER", "", "BLOCK A", "", "BLOCK B", "", "FOOTER")
            val render = renderVendorBitmapDiagnosticsPayload(lines, config.vendorBitmapWidthPx, config)
            try {
                Log.i(TAG, "native_print_vendor_physical_diagnostics_experiment commandId=${job.commandId} orderId=${job.orderId ?: ""} name=single_tall_bitmap textIncluded=${lines.joinToString("|")} bitmapWidthPx=${render.widthPx} bitmapHeightPx=${render.heightPx} printedBlocks=1 lineWrapPlan=8 transactionModeUsed=false rawFeedUsed=false")
                callPrinterPrimitive(job, "printBitmap", detail = "vendorPhysicalDiag experiment=single_tall_bitmap width=${render.widthPx} height=${render.heightPx}") {
                    service.printBitmap(render.bitmap, callbackFor(job, "vendorPhysicalDiag_exp1_printBitmap", callbackErrors, dispatchStartMs))
                }
            } finally {
                render.bitmap.recycle()
            }
            callPrinterPrimitive(job, "lineWrap", detail = "vendorPhysicalDiag experiment=single_tall_bitmap lines=8") {
                service.lineWrap(8, callbackFor(job, "vendorPhysicalDiag_exp1_lineWrap", callbackErrors, dispatchStartMs))
            }
            events += "exp1:ok"
        }.onFailure {
            Log.e(TAG, "native_print_vendor_physical_diagnostics_experiment_failed commandId=${job.commandId} orderId=${job.orderId ?: ""} name=single_tall_bitmap reason=${it.message ?: "unknown"}")
            events += "exp1:failed"
        }

        // Experiment 2: segmented bitmap + large inter-block feed
        runCatching {
            val blockLines = listOf(listOf("HEADER"), listOf("BLOCK A", "BLOCK B"), listOf("FOOTER"))
            blockLines.forEachIndexed { idx, lines ->
                val render = renderVendorBitmapDiagnosticsPayload(lines, config.vendorBitmapWidthPx, config)
                try {
                    val wrap = if (idx == blockLines.lastIndex) 10 else 8
                    Log.i(TAG, "native_print_vendor_physical_diagnostics_experiment commandId=${job.commandId} orderId=${job.orderId ?: ""} name=segmented_large_feed blockIndex=$idx bitmapWidthPx=${render.widthPx} bitmapHeightPx=${render.heightPx} printedBlocks=${blockLines.size} lineWrapAfterBlock=$wrap transactionModeUsed=false rawFeedUsed=false textIncluded=${lines.joinToString("|")}")
                    callPrinterPrimitive(job, "printBitmap", detail = "vendorPhysicalDiag experiment=segmented_large_feed block=$idx width=${render.widthPx} height=${render.heightPx}") {
                        service.printBitmap(render.bitmap, callbackFor(job, "vendorPhysicalDiag_exp2_printBitmap_$idx", callbackErrors, dispatchStartMs))
                    }
                } finally {
                    render.bitmap.recycle()
                }
                val wrap = if (idx == blockLines.lastIndex) 10 else 8
                callPrinterPrimitive(job, "lineWrap", detail = "vendorPhysicalDiag experiment=segmented_large_feed block=$idx lines=$wrap") {
                    service.lineWrap(wrap, callbackFor(job, "vendorPhysicalDiag_exp2_lineWrap_$idx", callbackErrors, dispatchStartMs))
                }
            }
            events += "exp2:ok"
        }.onFailure {
            Log.e(TAG, "native_print_vendor_physical_diagnostics_experiment_failed commandId=${job.commandId} orderId=${job.orderId ?: ""} name=segmented_large_feed reason=${it.message ?: "unknown"}")
            events += "exp2:failed"
        }

        // Experiment 3: segmented bitmap in transaction mode
        runCatching {
            val blockLines = listOf(listOf("TX HEADER"), listOf("TX BLOCK A", "TX BLOCK B"), listOf("TX FOOTER"))
            var flushMethod = "exitPrinterBufferWithCallback"
            Log.i(TAG, "native_print_vendor_physical_diagnostics_experiment commandId=${job.commandId} orderId=${job.orderId ?: ""} name=segmented_transaction_mode transactionModeUsed=true bufferEnter=true")
            service.enterPrinterBuffer(true)
            blockLines.forEachIndexed { idx, lines ->
                val render = renderVendorBitmapDiagnosticsPayload(lines, config.vendorBitmapWidthPx, config)
                try {
                    callPrinterPrimitive(job, "printBitmap", detail = "vendorPhysicalDiag experiment=segmented_transaction_mode block=$idx width=${render.widthPx} height=${render.heightPx}") {
                        service.printBitmap(render.bitmap, callbackFor(job, "vendorPhysicalDiag_exp3_printBitmap_$idx", callbackErrors, dispatchStartMs))
                    }
                } finally {
                    render.bitmap.recycle()
                }
                val wrap = if (idx == blockLines.lastIndex) 10 else 8
                Log.i(TAG, "native_print_vendor_physical_diagnostics_experiment commandId=${job.commandId} orderId=${job.orderId ?: ""} name=segmented_transaction_mode blockIndex=$idx lineWrapAfterBlock=$wrap bitmapBlocks=${blockLines.size}")
                callPrinterPrimitive(job, "lineWrap", detail = "vendorPhysicalDiag experiment=segmented_transaction_mode block=$idx lines=$wrap") {
                    service.lineWrap(wrap, callbackFor(job, "vendorPhysicalDiag_exp3_lineWrap_$idx", callbackErrors, dispatchStartMs))
                }
            }
            runCatching {
                callPrinterPrimitive(job, "exitPrinterBufferWithCallback", detail = "vendorPhysicalDiag experiment=segmented_transaction_mode commit=true") {
                    service.exitPrinterBufferWithCallback(true, callbackFor(job, "vendorPhysicalDiag_exp3_exitBuffer", callbackErrors, dispatchStartMs))
                }
            }.onFailure {
                flushMethod = "commitPrinterBuffer"
                callPrinterPrimitive(job, "commitPrinterBuffer", detail = "vendorPhysicalDiag experiment=segmented_transaction_mode fallback=true") {
                    service.commitPrinterBuffer()
                }
            }
            Log.i(TAG, "native_print_vendor_physical_diagnostics_experiment commandId=${job.commandId} orderId=${job.orderId ?: ""} name=segmented_transaction_mode flushMethod=$flushMethod")
            events += "exp3:ok"
        }.onFailure {
            Log.e(TAG, "native_print_vendor_physical_diagnostics_experiment_failed commandId=${job.commandId} orderId=${job.orderId ?: ""} name=segmented_transaction_mode reason=${it.message ?: "unknown"}")
            events += "exp3:failed"
        }

        // Experiment 4: bitmap + explicit ESC/POS feed tail
        runCatching {
            val lines = listOf("RAW FEED TEST", "BLOCK X")
            val render = renderVendorBitmapDiagnosticsPayload(lines, config.vendorBitmapWidthPx, config)
            val rawTail = byteArrayOf(0x1B, 0x64, 0x08)
            try {
                Log.i(TAG, "native_print_vendor_physical_diagnostics_experiment commandId=${job.commandId} orderId=${job.orderId ?: ""} name=bitmap_plus_escpos_tail bitmapWidthPx=${render.widthPx} bitmapHeightPx=${render.heightPx} printedBlocks=1 lineWrapPlan=8 transactionModeUsed=false rawFeedUsed=true rawFeedHex=${rawTail.joinToString(" ") { b -> "0x%02X".format(b) }}")
                callPrinterPrimitive(job, "printBitmap", detail = "vendorPhysicalDiag experiment=bitmap_plus_escpos_tail width=${render.widthPx} height=${render.heightPx}") {
                    service.printBitmap(render.bitmap, callbackFor(job, "vendorPhysicalDiag_exp4_printBitmap", callbackErrors, dispatchStartMs))
                }
            } finally {
                render.bitmap.recycle()
            }
            callPrinterPrimitive(job, "sendRAWData", detail = "vendorPhysicalDiag experiment=bitmap_plus_escpos_tail bytes=${rawTail.size}") {
                service.sendRAWData(rawTail, callbackFor(job, "vendorPhysicalDiag_exp4_sendRaw", callbackErrors, dispatchStartMs))
            }
            callPrinterPrimitive(job, "lineWrap", detail = "vendorPhysicalDiag experiment=bitmap_plus_escpos_tail lines=8") {
                service.lineWrap(8, callbackFor(job, "vendorPhysicalDiag_exp4_lineWrap", callbackErrors, dispatchStartMs))
            }
            events += "exp4:ok"
        }.onFailure {
            Log.e(TAG, "native_print_vendor_physical_diagnostics_experiment_failed commandId=${job.commandId} orderId=${job.orderId ?: ""} name=bitmap_plus_escpos_tail reason=${it.message ?: "unknown"}")
            events += "exp4:failed"
        }

        // Experiment 5: reduced width comparison
        runCatching {
            val widths = listOf(384, 360, 320)
            val lines = listOf("WIDTH TEST", "1234567890", "ABCDEFGHIJ")
            widths.forEachIndexed { idx, width ->
                val render = renderVendorBitmapDiagnosticsPayload(lines, width, config)
                try {
                    Log.i(TAG, "native_print_vendor_physical_diagnostics_experiment commandId=${job.commandId} orderId=${job.orderId ?: ""} name=reduced_bitmap_width widthVariantPx=$width bitmapWidthPx=${render.widthPx} bitmapHeightPx=${render.heightPx} printedBlocks=${widths.size} lineWrapAfterBlock=8 transactionModeUsed=false rawFeedUsed=false textIncluded=${lines.joinToString("|")}")
                    callPrinterPrimitive(job, "printBitmap", detail = "vendorPhysicalDiag experiment=reduced_bitmap_width index=$idx width=${render.widthPx} height=${render.heightPx}") {
                        service.printBitmap(render.bitmap, callbackFor(job, "vendorPhysicalDiag_exp5_printBitmap_$idx", callbackErrors, dispatchStartMs))
                    }
                } finally {
                    render.bitmap.recycle()
                }
                callPrinterPrimitive(job, "lineWrap", detail = "vendorPhysicalDiag experiment=reduced_bitmap_width index=$idx lines=8") {
                    service.lineWrap(8, callbackFor(job, "vendorPhysicalDiag_exp5_lineWrap_$idx", callbackErrors, dispatchStartMs))
                }
            }
            events += "exp5:ok"
        }.onFailure {
            Log.e(TAG, "native_print_vendor_physical_diagnostics_experiment_failed commandId=${job.commandId} orderId=${job.orderId ?: ""} name=reduced_bitmap_width reason=${it.message ?: "unknown"}")
            events += "exp5:failed"
        }

        val sequence = "printerInit->exp1(single_tall)->exp2(segmented_large_feed)->exp3(segmented_transaction)->exp4(raw_tail)->exp5(width_384_360_320)"
        Log.i(TAG, "native_print_vendor_physical_diagnostics_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} experimentResults=${events.joinToString(",")} primitiveSequence=$sequence")
        return sequence
    }

    private fun renderVendorBitmapDiagnosticsPayload(
        lines: List<String>,
        widthPx: Int,
        config: PhysicalFidelityConfig,
    ): BitmapRenderResult {
        val safeWidth = widthPx.coerceIn(280, 640)
        val height = max(
            120,
            config.vendorBitmapTopPaddingPx + config.vendorBitmapBottomPaddingPx + (lines.size * config.vendorBitmapLineHeightPx),
        )
        val bmp = Bitmap.createBitmap(safeWidth, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 28f
            typeface = Typeface.MONOSPACE
        }
        var y = config.vendorBitmapTopPaddingPx + config.vendorBitmapLineHeightPx
        lines.forEach { line ->
            canvas.drawText(line, config.vendorBitmapHorizontalPaddingPx.toFloat(), y.toFloat(), paint)
            y += config.vendorBitmapLineHeightPx
        }
        return BitmapRenderResult(
            bitmap = bmp,
            widthPx = safeWidth,
            heightPx = height,
            lineCount = lines.size,
            firstLinePreview = lines.firstOrNull().orEmpty(),
            lastLinePreview = lines.lastOrNull().orEmpty(),
        )
    }

    private fun executeTransactionModeTinyDiagnosticTest(
        service: IWoyouService,
        job: NativePrintJobEntity,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        val strategy = "transaction_mode_tiny_diagnostic_test"
        val submode = config.transactionDiagnosticMode
        val callbackStats = TransactionCallbackStats()
        Log.i(TAG, "native_print_transaction_diagnostic_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=$strategy selectedFamily=woyou_legacy_packaged packageName=woyou.aidlservice.jiuiv5 action=woyou.aidlservice.jiuiv5.IWoyouService")
        Log.i(TAG, "native_print_transaction_mode commandId=${job.commandId} orderId=${job.orderId ?: ""} submode=$submode requestedStrategy=${config.requestedNativePrintStrategyRaw} strategySource=${config.requestedNativePrintStrategySource} finalSpacingLines=${config.transactionDiagnosticFinalSpacingLines} dispatchDelayMs=${config.transactionDiagnosticDispatchDelayMs} finalSettleMs=${config.transactionDiagnosticFinalSettleMs}")

        Log.i(TAG, "native_print_transaction_buffer_enter commandId=${job.commandId} orderId=${job.orderId ?: ""} clean=true event=start")
        callPrinterPrimitive(job, "enterPrinterBuffer", detail = "transactionDiagnostic clean=true") {
            service.enterPrinterBuffer(true)
        }
        Log.i(TAG, "native_print_transaction_buffer_enter commandId=${job.commandId} orderId=${job.orderId ?: ""} clean=true event=end")

        callPrinterPrimitive(job, "setAlignment", detail = "transactionDiagnostic value=0") {
            service.setAlignment(0, callbackForTransaction(job, strategy, submode, "setAlignment", callbackErrors, dispatchStartMs, callbackStats))
        }

        if (submode == "bitmap") {
            val render = renderSmokeBitmapBlock(listOf("TX TEST B", "0987654321"), config)
            try {
                Log.i(TAG, "native_print_transaction_payload commandId=${job.commandId} orderId=${job.orderId ?: ""} submode=bitmap payload=TX TEST B|0987654321")
                Log.i(TAG, "native_print_transaction_bitmap_dimensions commandId=${job.commandId} orderId=${job.orderId ?: ""} widthPx=${render.widthPx} heightPx=${render.heightPx} lineCount=${render.lineCount}")
                callPrinterPrimitive(job, "printBitmap", detail = "transactionDiagnostic submode=bitmap width=${render.widthPx} height=${render.heightPx}") {
                    service.printBitmap(render.bitmap, callbackForTransaction(job, strategy, submode, "printBitmap", callbackErrors, dispatchStartMs, callbackStats))
                }
            } finally {
                render.bitmap.recycle()
            }
        } else {
            Log.i(TAG, "native_print_transaction_payload commandId=${job.commandId} orderId=${job.orderId ?: ""} submode=text payload=TX TEST A|1234567890")
            callPrinterPrimitive(job, "printText", detail = "transactionDiagnostic submode=text line=TX TEST A") {
                service.printText("TX TEST A", callbackForTransaction(job, strategy, submode, "printText_1", callbackErrors, dispatchStartMs, callbackStats))
            }
            callPrinterPrimitive(job, "lineWrap", detail = "transactionDiagnostic submode=text lines=1") {
                service.lineWrap(1, callbackForTransaction(job, strategy, submode, "lineWrap_1", callbackErrors, dispatchStartMs, callbackStats))
            }
            sleepAfterDispatch(job, 0, config.transactionDiagnosticDispatchDelayMs.toLong())
            callPrinterPrimitive(job, "printText", detail = "transactionDiagnostic submode=text line=1234567890") {
                service.printText("1234567890", callbackForTransaction(job, strategy, submode, "printText_2", callbackErrors, dispatchStartMs, callbackStats))
            }
        }

        val finalSpacingLines = if (submode == "text") 4 else config.transactionDiagnosticFinalSpacingLines
        callPrinterPrimitive(job, "lineWrap", detail = "transactionDiagnostic submode=$submode lines=$finalSpacingLines") {
            service.lineWrap(finalSpacingLines, callbackForTransaction(job, strategy, submode, "lineWrap_final", callbackErrors, dispatchStartMs, callbackStats))
        }

        if (config.transactionDiagnosticFinalSettleMs > 0) {
            runCatching { Thread.sleep(config.transactionDiagnosticFinalSettleMs.toLong()) }
        }

        val flushMethod = "exitPrinterBufferWithCallback"
        Log.i(TAG, "native_print_transaction_buffer_exit commandId=${job.commandId} orderId=${job.orderId ?: ""} commit=true callback=true flushMethod=$flushMethod event=start")
        callPrinterPrimitive(job, "exitPrinterBufferWithCallback", detail = "transactionDiagnostic commit=true") {
            service.exitPrinterBufferWithCallback(true, callbackForTransaction(job, strategy, submode, "exitPrinterBufferWithCallback", callbackErrors, dispatchStartMs, callbackStats))
        }
        Log.i(TAG, "native_print_transaction_buffer_exit commandId=${job.commandId} orderId=${job.orderId ?: ""} commit=true callback=true flushMethod=$flushMethod event=end")
        Log.i(TAG, "native_print_transaction_commit commandId=${job.commandId} orderId=${job.orderId ?: ""} called=false method=commitPrinterBufferWithCallback")

        val sequence = if (submode == "bitmap") {
            "printerInit->enterPrinterBuffer(true)->setAlignment->printBitmap(tiny)->lineWrap(final)->exitPrinterBufferWithCallback(true)"
        } else {
            "printerInit->enterPrinterBuffer(true)->setAlignment->printText->lineWrap(1)->printText->lineWrap(final)->exitPrinterBufferWithCallback(true)"
        }
        Log.i(TAG, "native_print_transaction_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedFamily=woyou_legacy_packaged packageName=woyou.aidlservice.jiuiv5 action=woyou.aidlservice.jiuiv5.IWoyouService mode=$submode enteredBuffer=true flushMethod=$flushMethod callbacksFired=${callbackStats.anyCallbackFired} onRunResultFired=${callbackStats.onRunResultFired} onReturnStringFired=${callbackStats.onReturnStringFired} onRaiseExceptionFired=${callbackStats.onRaiseExceptionFired} onPrintResultFired=${callbackStats.onPrintResultFired} primitiveSequence=$sequence")
        return sequence
    }

    private fun callbackForTransaction(
        job: NativePrintJobEntity,
        strategy: String,
        submode: String,
        stage: String,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
        callbackStats: TransactionCallbackStats,
    ): ICallback {
        return object : ICallback.Stub() {
            override fun onRunResult(isSuccess: Boolean) {
                callbackStats.anyCallbackFired = true
                callbackStats.onRunResultFired = true
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                Log.i(TAG, "native_print_transaction_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=$strategy submode=$submode callback=onRunResult stage=$stage success=$isSuccess code=NA message=NA deltaMs=$deltaMs")
                if (!isSuccess) callbackErrors += "$stage:onRunResult:false"
            }

            override fun onReturnString(result: String?) {
                callbackStats.anyCallbackFired = true
                callbackStats.onReturnStringFired = true
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                Log.i(TAG, "native_print_transaction_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=$strategy submode=$submode callback=onReturnString stage=$stage success=true code=NA message=${result ?: ""} deltaMs=$deltaMs")
            }

            override fun onRaiseException(code: Int, msg: String?) {
                callbackStats.anyCallbackFired = true
                callbackStats.onRaiseExceptionFired = true
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                Log.i(TAG, "native_print_transaction_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=$strategy submode=$submode callback=onRaiseException stage=$stage success=false code=$code message=${msg ?: "unknown"} deltaMs=$deltaMs")
                callbackErrors += "$stage:onRaiseException:$code:${msg ?: "unknown"}"
            }

            override fun onPrintResult(code: Int, msg: String?) {
                callbackStats.anyCallbackFired = true
                callbackStats.onPrintResultFired = true
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                val success = code == 0
                Log.i(TAG, "native_print_transaction_callback commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=$strategy submode=$submode callback=onPrintResult stage=$stage success=$success code=$code message=${msg ?: ""} deltaMs=$deltaMs")
                if (!success) callbackErrors += "$stage:onPrintResult:$code:${msg ?: "unknown"}"
            }
        }
    }

    private fun renderVendorBitmapComparePayload(
        lines: List<String>,
        config: PhysicalFidelityConfig,
    ): BitmapRenderResult {
        val width = config.vendorBitmapWidthPx
        val height = max(
            120,
            config.vendorBitmapTopPaddingPx + config.vendorBitmapBottomPaddingPx + (lines.size * config.vendorBitmapLineHeightPx),
        )
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 28f
            typeface = Typeface.MONOSPACE
        }
        var y = config.vendorBitmapTopPaddingPx + config.vendorBitmapLineHeightPx
        lines.forEach { line ->
            canvas.drawText(line, config.vendorBitmapHorizontalPaddingPx.toFloat(), y.toFloat(), paint)
            y += config.vendorBitmapLineHeightPx
        }
        return BitmapRenderResult(
            bitmap = bmp,
            widthPx = width,
            heightPx = height,
            lineCount = lines.size,
            firstLinePreview = lines.firstOrNull().orEmpty(),
            lastLinePreview = lines.lastOrNull().orEmpty(),
        )
    }

    private fun executeBitmapStrategies(
        service: IWoyouService,
        job: NativePrintJobEntity,
        sectionLines: List<SectionLine>,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
        finalizePolicy: FinalizePolicy,
        testMode: RobustPrintTestMode?,
    ): String {
        if (config.strategy == PhysicalFidelityStrategy.BITMAP_SMOKE_TEST_MINIMAL_BLOCKS) {
            return executeBitmapSmokeTestMinimalBlocks(service, job, config, callbackErrors, dispatchStartMs)
        }

        val processed = sectionLines.mapIndexed { idx, s ->
            val ascii = if (config.asciiSafeMode) toSafeAscii(s.text) else AsciiNormalizationResult(s.text, 0, 0)
            Log.i(
                TAG,
                "native_print_bitmap_render_line commandId=${job.commandId} orderId=${job.orderId ?: ""} lineIndex=$idx semanticSection=${s.section.name} originalRenderedLine=${s.text} bitmapRenderedLine=${ascii.text} asciiNormalized=${config.asciiSafeMode} nonAsciiDetectedCount=${ascii.nonAsciiDetectedCount} replacedGlyphCount=${ascii.replacedGlyphCount}",
            )
            SectionLine(s.section, ascii.text)
        }

        Log.i(
            TAG,
            "native_print_bitmap_strategy_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=${strategyName(config.strategy)} asciiSafeMode=${config.asciiSafeMode} bitmapWidthPx=${config.bitmapWidthPx} horizontalPaddingPx=${config.horizontalPaddingPx} topPaddingPx=${config.topPaddingPx} bottomPaddingPx=${config.bottomPaddingPx} lineHeightPx=${config.lineHeightPx} sectionGapPx=${config.sectionGapPx} finalFooterGapPx=${config.finalFooterGapPx} bitmapInterBlockGapPx=${config.bitmapInterBlockGapPx}",
        )

        val estimatedHeightPx = estimateBitmapHeight(processed, config)
        Log.i(TAG, "native_print_bitmap_render_start commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=${strategyName(config.strategy)} estimatedHeightPx=$estimatedHeightPx lineCount=${processed.size}")

        val effectiveStrategy = if (config.strategy == PhysicalFidelityStrategy.BITMAP_RECEIPT_SINGLE_IMAGE && estimatedHeightPx > MAX_SINGLE_BITMAP_HEIGHT_PX) {
            Log.w(TAG, "native_print_bitmap_height_warning commandId=${job.commandId} orderId=${job.orderId ?: ""} estimatedHeightPx=$estimatedHeightPx threshold=$MAX_SINGLE_BITMAP_HEIGHT_PX fallbackStrategy=bitmap_receipt_segmented_blocks")
            PhysicalFidelityStrategy.BITMAP_RECEIPT_SEGMENTED_BLOCKS
        } else {
            config.strategy
        }

        val blocks = if (effectiveStrategy == PhysicalFidelityStrategy.BITMAP_RECEIPT_SINGLE_IMAGE) {
            listOf("single_receipt" to processed)
        } else {
            groupedBitmapBlocks(processed)
        }

        var blockIndex = 0
        for ((blockName, blockLines) in blocks) {
            if (blockLines.isEmpty()) continue
            val render = renderBitmapBlock(blockLines, config)
            Log.i(
                TAG,
                "native_print_bitmap_render_block commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=${strategyName(effectiveStrategy)} blockIndex=$blockIndex blockName=$blockName widthPx=${render.widthPx} heightPx=${render.heightPx} lineCount=${render.lineCount} firstLinePreview=${render.firstLinePreview} lastLinePreview=${render.lastLinePreview} asciiSafeMode=${config.asciiSafeMode} sectionGapPx=${config.sectionGapPx} finalFooterGapPx=${config.finalFooterGapPx}",
            )
            Log.i(TAG, "native_print_bitmap_dimensions commandId=${job.commandId} orderId=${job.orderId ?: ""} blockIndex=$blockIndex widthPx=${render.widthPx} heightPx=${render.heightPx}")
            try {
                Log.i(TAG, "native_print_bitmap_print_call commandId=${job.commandId} orderId=${job.orderId ?: ""} blockIndex=$blockIndex event=start")
                callPrinterPrimitive(job, "printBitmap", detail = "blockIndex=$blockIndex blockName=$blockName width=${render.widthPx} height=${render.heightPx}") {
                    service.printBitmap(render.bitmap, callbackFor(job, "printBitmap_block_$blockIndex", callbackErrors, dispatchStartMs))
                }
                Log.i(TAG, "native_print_bitmap_print_call commandId=${job.commandId} orderId=${job.orderId ?: ""} blockIndex=$blockIndex event=end")
            } finally {
                render.bitmap.recycle()
            }

            if (blockIndex < blocks.lastIndex && config.bitmapInterBlockGapPx > 0) {
                val gapLines = pxToLines(config.bitmapInterBlockGapPx, config.lineHeightPx)
                Log.i(TAG, "native_print_bitmap_spacing_applied commandId=${job.commandId} orderId=${job.orderId ?: ""} blockIndex=$blockIndex spacingType=inter_block gapPx=${config.bitmapInterBlockGapPx} lines=$gapLines")
                callPrinterPrimitive(job, "lineWrap", detail = "bitmapInterBlock lines=$gapLines") {
                    service.lineWrap(gapLines, callbackFor(job, "lineWrap_bitmap_gap_$blockIndex", callbackErrors, dispatchStartMs))
                }
            }
            sleepAfterDispatch(job, blockIndex, config.dispatchDelayMs)
            blockIndex += 1
        }

        if (config.finalFooterGapPx > 0) {
            val footerLines = pxToLines(config.finalFooterGapPx, config.lineHeightPx)
            Log.i(TAG, "native_print_bitmap_spacing_applied commandId=${job.commandId} orderId=${job.orderId ?: ""} spacingType=final_footer gapPx=${config.finalFooterGapPx} lines=$footerLines")
            callPrinterPrimitive(job, "lineWrap", detail = "bitmapFinalFooter lines=$footerLines") {
                service.lineWrap(footerLines, callbackFor(job, "lineWrap_bitmap_footer", callbackErrors, dispatchStartMs))
            }
        }

        val bitmapFeedLines = max(6, config.finalTicketSpacingLines)
        applyFinalizePolicy(
            service = service,
            job = job,
            callbackErrors = callbackErrors,
            dispatchStartMs = dispatchStartMs,
            finalizePolicy = finalizePolicy,
            feedLines = bitmapFeedLines,
            settleMs = config.finalSettleMs,
            contextTag = "bitmap",
        )

        if (config.finalSettleMs > 0) {
            Log.i(TAG, "native_print_final_settle_sleep commandId=${job.commandId} orderId=${job.orderId ?: ""} settleMs=${config.finalSettleMs}")
            runCatching { Thread.sleep(config.finalSettleMs) }
        }

        val sequence = if (effectiveStrategy == PhysicalFidelityStrategy.BITMAP_RECEIPT_SINGLE_IMAGE) {
            "printerInit?->setAlignment->printBitmap(single)->bitmapFinalize(${finalizePolicy.name.lowercase()})"
        } else {
            "printerInit?->setAlignment->printBitmap(segmented_blocks)->bitmapFinalize(${finalizePolicy.name.lowercase()})"
        }

        Log.i(
            TAG,
            "native_print_bitmap_render_complete commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=${strategyName(effectiveStrategy)} blocksPrinted=$blockIndex",
        )
        Log.i(
            TAG,
            "native_print_bitmap_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=${testMode?.name ?: "LEGACY_DEFAULT"} strategy=${strategyName(effectiveStrategy)} asciiSafeMode=${config.asciiSafeMode} renderedLineCount=${sectionLines.size} segmentCount=$blockIndex bitmapModeUsed=true transactionalBufferedModeUsed=false finalizeMode=${finalizePolicy.name.lowercase()} finalSpacingAppliedLines=$bitmapFeedLines primitiveSequence=$sequence",
        )
        return sequence
    }


    private fun executeBitmapSmokeTestMinimalBlocks(
        service: IWoyouService,
        job: NativePrintJobEntity,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        Log.i(
            TAG,
            "native_print_bitmap_smoke_test_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=bitmap_smoke_test_minimal_blocks smokeTestBitmapWidthPx=${config.smokeTestBitmapWidthPx} smokeTestHorizontalPaddingPx=${config.smokeTestHorizontalPaddingPx} smokeTestTopPaddingPx=${config.smokeTestTopPaddingPx} smokeTestBottomPaddingPx=${config.smokeTestBottomPaddingPx} smokeTestLineHeightPx=${config.smokeTestLineHeightPx} smokeTestInterBlockSpacingLines=${config.smokeTestInterBlockSpacingLines} smokeTestFinalSpacingLines=${config.smokeTestFinalSpacingLines} dispatchDelayMs=${config.dispatchDelayMs} finalSettleMs=${config.finalSettleMs}",
        )

        val blocks = listOf(
            "block_a" to listOf("TEST BLOCK A", "1111111111"),
            "block_b" to listOf("TEST BLOCK B", "2222222222"),
        )

        blocks.forEachIndexed { idx, (name, lines) ->
            val render = renderSmokeBitmapBlock(lines, config)
            Log.i(
                TAG,
                "native_print_bitmap_smoke_test_block_rendered commandId=${job.commandId} orderId=${job.orderId ?: ""} blockIndex=$idx blockName=$name lineCount=${lines.size} textPreview=${lines.joinToString(" | ")}",
            )
            Log.i(
                TAG,
                "native_print_bitmap_smoke_test_block_dimensions commandId=${job.commandId} orderId=${job.orderId ?: ""} blockIndex=$idx blockName=$name widthPx=${render.widthPx} heightPx=${render.heightPx} lineCount=${render.lineCount}",
            )
            try {
                Log.i(TAG, "native_print_bitmap_smoke_test_print_call commandId=${job.commandId} orderId=${job.orderId ?: ""} blockIndex=$idx blockName=$name event=start")
                callPrinterPrimitive(job, "printBitmap", detail = "smokeTest blockIndex=$idx blockName=$name width=${render.widthPx} height=${render.heightPx}") {
                    service.printBitmap(render.bitmap, callbackFor(job, "printBitmap_smoke_$idx", callbackErrors, dispatchStartMs))
                }
                Log.i(TAG, "native_print_bitmap_smoke_test_print_call commandId=${job.commandId} orderId=${job.orderId ?: ""} blockIndex=$idx blockName=$name event=end")
            } finally {
                render.bitmap.recycle()
            }

            val spacing = if (idx == 0) config.smokeTestInterBlockSpacingLines else config.smokeTestFinalSpacingLines
            val spacingType = if (idx == 0) "inter_block" else "final"
            Log.i(TAG, "native_print_bitmap_smoke_test_spacing_applied commandId=${job.commandId} orderId=${job.orderId ?: ""} spacingType=$spacingType requestedLines=$spacing")
            callPrinterPrimitive(job, "lineWrap", detail = "smokeTest spacingType=$spacingType lines=$spacing") {
                service.lineWrap(spacing, callbackFor(job, "lineWrap_smoke_$idx", callbackErrors, dispatchStartMs))
            }

            sleepAfterDispatch(job, idx, config.dispatchDelayMs)
        }

        if (config.finalSettleMs > 0) {
            Log.i(TAG, "native_print_final_settle_sleep commandId=${job.commandId} orderId=${job.orderId ?: ""} settleMs=${config.finalSettleMs}")
            runCatching { Thread.sleep(config.finalSettleMs) }
        }

        val rawFeed = byteArrayOf(0x1B, 0x64, 0x03)
        callPrinterPrimitive(job, "sendRAWData", detail = "smokeTest bytes=${rawFeed.size}") {
            service.sendRAWData(rawFeed, callbackFor(job, "sendRAWData_smoke", callbackErrors, dispatchStartMs))
        }

        val sequence = "printerInit->setAlignment->printBitmap(blockA)->lineWrap(inter)->printBitmap(blockB)->lineWrap(final)->sendRAWData"
        Log.i(
            TAG,
            "native_print_bitmap_smoke_test_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=bitmap_smoke_test_minimal_blocks blockCount=2 interBlockSpacingLines=${config.smokeTestInterBlockSpacingLines} finalSpacingLines=${config.smokeTestFinalSpacingLines} primitiveSequence=$sequence",
        )
        return sequence
    }

    private fun renderSmokeBitmapBlock(
        lines: List<String>,
        config: PhysicalFidelityConfig,
    ): BitmapRenderResult {
        val width = config.smokeTestBitmapWidthPx
        val height = max(
            120,
            config.smokeTestTopPaddingPx + config.smokeTestBottomPaddingPx + (lines.size * config.smokeTestLineHeightPx),
        )
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 28f
            typeface = Typeface.MONOSPACE
        }
        var y = config.smokeTestTopPaddingPx + config.smokeTestLineHeightPx
        lines.forEach { line ->
            canvas.drawText(line, config.smokeTestHorizontalPaddingPx.toFloat(), y.toFloat(), paint)
            y += config.smokeTestLineHeightPx
        }
        return BitmapRenderResult(
            bitmap = bmp,
            widthPx = width,
            heightPx = height,
            lineCount = lines.size,
            firstLinePreview = lines.firstOrNull().orEmpty(),
            lastLinePreview = lines.lastOrNull().orEmpty(),
        )
    }

    private fun groupedBitmapBlocks(sectionLines: List<SectionLine>): List<Pair<String, List<SectionLine>>> {
        val header = sectionLines.filter { it.section == SemanticSection.HEADER }
        val customer = sectionLines.filter { it.section in setOf(SemanticSection.CUSTOMER, SemanticSection.ADDRESS, SemanticSection.PAYMENT, SemanticSection.TIMESTAMP, SemanticSection.HISTORY, SemanticSection.PREPARATION) }
        val articlesHeader = sectionLines.filter { it.section == SemanticSection.DIVIDER || it.section == SemanticSection.ARTICLES_HEADER }
        val articleLines = sectionLines.filter { it.section == SemanticSection.ARTICLE_LINE }
        val totalFooter = sectionLines.filter { it.section == SemanticSection.TOTAL || it.section == SemanticSection.FOOTER_GAP }

        return listOf(
            "header_block" to header,
            "customer_info_block" to customer,
            "articles_header_block" to articlesHeader,
            "article_lines_block" to articleLines,
            "total_footer_block" to totalFooter,
        ).filter { it.second.isNotEmpty() }
    }

    private fun renderBitmapBlock(lines: List<SectionLine>, config: PhysicalFidelityConfig): BitmapRenderResult {
        val width = config.bitmapWidthPx
        val baseHeight = config.topPaddingPx + config.bottomPaddingPx + (lines.size * config.lineHeightPx) + config.finalFooterGapPx
        val extraGaps = lines.zipWithNext().count { it.first.section != it.second.section } * config.sectionGapPx
        val height = max(120, baseHeight + extraGaps)
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)

        val normalPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 26f
            typeface = Typeface.MONOSPACE
        }
        val headerPaint = Paint(normalPaint).apply { textSize = 30f; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) }
        val totalPaint = Paint(normalPaint).apply { textSize = 28f; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) }

        var y = config.topPaddingPx + config.lineHeightPx
        lines.forEachIndexed { idx, line ->
            val paint = when (line.section) {
                SemanticSection.HEADER -> headerPaint
                SemanticSection.TOTAL -> totalPaint
                else -> normalPaint
            }
            canvas.drawText(line.text, config.horizontalPaddingPx.toFloat(), y.toFloat(), paint)
            y += config.lineHeightPx
            val next = lines.getOrNull(idx + 1)
            if (next != null && next.section != line.section) {
                y += config.sectionGapPx
            }
        }

        return BitmapRenderResult(
            bitmap = bmp,
            widthPx = width,
            heightPx = height,
            lineCount = lines.size,
            firstLinePreview = lines.first().text.take(48),
            lastLinePreview = lines.last().text.take(48),
        )
    }

    private fun estimateBitmapHeight(lines: List<SectionLine>, config: PhysicalFidelityConfig): Int {
        val sectionTransitions = lines.zipWithNext().count { it.first.section != it.second.section }
        return config.topPaddingPx + config.bottomPaddingPx + config.finalFooterGapPx + (lines.size * config.lineHeightPx) + (sectionTransitions * config.sectionGapPx)
    }

    private fun pxToLines(px: Int, lineHeightPx: Int): Int = max(1, px / max(1, lineHeightPx))

    private fun executeDirectSelfCheckThenMinimalText(
        service: IWoyouService,
        job: NativePrintJobEntity,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        Log.i(TAG, "native_print_direct_self_check_then_minimal_text_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=direct_self_check_then_minimal_text")

        Log.i(TAG, "native_print_direct_self_check_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=printerSelfChecking event=start")
        callPrinterPrimitive(job, "printerSelfChecking", detail = "directSelfCheckThenMinimalText") {
            service.printerSelfChecking(callbackFor(job, "directSelfCheck_printerSelfChecking", callbackErrors, dispatchStartMs))
        }
        Log.i(TAG, "native_print_direct_self_check_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=printerSelfChecking event=end")

        if (config.dispatchDelayMs > 0) {
            runCatching { Thread.sleep(minOf(120L, config.dispatchDelayMs)) }
        }

        callPrinterPrimitive(job, "printerInit", detail = "directSelfCheckThenMinimalText secondInit=true") {
            service.printerInit(callbackFor(job, "directSelfCheck_printerInit_2", callbackErrors, dispatchStartMs))
        }
        callPrinterPrimitive(job, "setAlignment", detail = "directSelfCheckThenMinimalText value=1") {
            service.setAlignment(1, callbackFor(job, "directSelfCheck_setAlignment_center", callbackErrors, dispatchStartMs))
        }

        Log.i(TAG, "native_print_direct_self_check_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=printText event=start payload=TEST-123")
        callPrinterPrimitive(job, "printText", detail = "directSelfCheckThenMinimalText payloadLength=9") {
            service.printText("TEST-123\n", callbackFor(job, "directSelfCheck_printText", callbackErrors, dispatchStartMs))
        }
        Log.i(TAG, "native_print_direct_self_check_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=printText event=end payload=TEST-123")

        Log.i(TAG, "native_print_direct_self_check_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=lineWrap event=start lines=3")
        callPrinterPrimitive(job, "lineWrap", detail = "directSelfCheckThenMinimalText lines=3") {
            service.lineWrap(3, callbackFor(job, "directSelfCheck_lineWrap_3", callbackErrors, dispatchStartMs))
        }
        Log.i(TAG, "native_print_direct_self_check_step commandId=${job.commandId} orderId=${job.orderId ?: ""} step=lineWrap event=end lines=3")

        val sequence = "printerInit->printerSelfChecking->printerInit->setAlignment(1)->printText(TEST-123\n)->lineWrap(3)"
        Log.i(TAG, "native_print_direct_self_check_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} primitiveSequence=$sequence")
        return sequence
    }

    private fun executeTextVendorParityUnbuffered(
        service: IWoyouService,
        job: NativePrintJobEntity,
        sectionLines: List<SectionLine>,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        Log.i(TAG, "native_print_text_vendor_parity_unbuffered_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=text_vendor_parity_unbuffered")
        Log.i(TAG, "native_print_text_vendor_parity_unbuffered_service_info commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedFamily=woyou_legacy_packaged packageName=woyou.aidlservice.jiuiv5 action=woyou.aidlservice.jiuiv5.IWoyouService")

        var previousSection: SemanticSection? = null
        sectionLines.forEachIndexed { idx, line ->
            val normalized = if (config.asciiSafeMode) toSafeAscii(line.text).text else line.text
            if (previousSection != null && previousSection != line.section && line.section !in setOf(SemanticSection.ARTICLE_LINE, SemanticSection.FOOTER_GAP)) {
                callPrinterPrimitive(job, "lineWrap", detail = "textVendorParityUnbuffered sectionGap index=$idx lines=1") {
                    service.lineWrap(1, callbackFor(job, "textVendorParityUnbuffered_gap_$idx", callbackErrors, dispatchStartMs))
                }
            }
            val payload = normalized + "\n"
            Log.i(TAG, "native_print_text_vendor_parity_unbuffered_print_before commandId=${job.commandId} orderId=${job.orderId ?: ""} lineIndex=$idx section=${line.section.name} payloadLength=${payload.length} text=${normalized}")
            callPrinterPrimitive(job, "printText", detail = "textVendorParityUnbuffered lineIndex=$idx payloadLength=${payload.length}") {
                service.printText(payload, callbackFor(job, "textVendorParityUnbuffered_printText_$idx", callbackErrors, dispatchStartMs))
            }
            Log.i(TAG, "native_print_text_vendor_parity_unbuffered_print_after commandId=${job.commandId} orderId=${job.orderId ?: ""} lineIndex=$idx section=${line.section.name}")
            previousSection = line.section
            sleepAfterDispatch(job, idx, config.dispatchDelayMs)
        }

        callPrinterPrimitive(job, "lineWrap", detail = "textVendorParityUnbuffered final lines=4") {
            service.lineWrap(4, callbackFor(job, "textVendorParityUnbuffered_finalFeed", callbackErrors, dispatchStartMs))
        }

        val sequence = "printerInit->setAlignment->printText(line+\n)->lineWrap(section_gaps)->lineWrap(4)"
        Log.i(TAG, "native_print_text_vendor_parity_unbuffered_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} renderedLineCount=${sectionLines.size} finalFeedLines=4 primitiveSequence=$sequence")
        return sequence
    }

    private fun executeStrictExperimentMode(
        service: IWoyouService,
        job: NativePrintJobEntity,
        sectionLines: List<SectionLine>,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
        finalizePolicy: FinalizePolicy,
        testMode: RobustPrintTestMode,
    ): String {
        val shortPayload = "TEST\nHELLO\n123\nEND\n"
        Log.i(TAG, "native_print_experiment_strict_mode commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=${testMode.name} fallbackUsed=false")
        return when (testMode) {
            RobustPrintTestMode.MODE_A,
            RobustPrintTestMode.MODE_B,
            -> {
                val payloadLines = shortPayload.trim().split("\n").mapIndexed { idx, line -> SectionLine(inferSection(idx, line), line) }
                executeTextVendorParityBuffered(service, job, payloadLines, config, callbackErrors, dispatchStartMs, finalizePolicy, testMode)
            }
            RobustPrintTestMode.MODE_C,
            RobustPrintTestMode.MODE_D,
            -> executeSingleBlockText(service, job, shortPayload, config, callbackErrors, dispatchStartMs, finalizePolicy, testMode)
            RobustPrintTestMode.MODE_E,
            RobustPrintTestMode.MODE_F,
            -> {
                val bitmapConfig = config.copy(strategy = PhysicalFidelityStrategy.BITMAP_RECEIPT_SEGMENTED_BLOCKS)
                executeBitmapStrategies(service, job, sectionLines, bitmapConfig, callbackErrors, dispatchStartMs, finalizePolicy, testMode)
            }
            RobustPrintTestMode.BUFFER_PROBE_ONLY,
            -> executeBufferProbeOnly(service, job, callbackErrors, dispatchStartMs)
            RobustPrintTestMode.SINGLE_BLOCK_TEXT_CALLBACK_GATED,
            -> executeSingleBlockTextCallbackGated(service, job, callbackErrors, dispatchStartMs)
        }
    }

    private fun executeBufferProbeOnly(
        service: IWoyouService,
        job: NativePrintJobEntity,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        callPrinterPrimitive(job, "enterPrinterBuffer", detail = "bufferProbe clean=true") {
            service.enterPrinterBuffer(true)
        }
        callPrinterPrimitive(job, "commitPrinterBuffer", detail = "bufferProbe") {
            service.commitPrinterBuffer()
        }
        callPrinterPrimitive(job, "exitPrinterBuffer", detail = "bufferProbe commit=true") {
            service.exitPrinterBuffer(true)
        }
        val sequence = "printerInit?->setAlignment->enterPrinterBuffer(true)->commitPrinterBuffer()->exitPrinterBuffer(true)"
        Log.i(TAG, "native_print_buffer_probe_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=BUFFER_PROBE_ONLY fallbackUsed=false primitiveSequence=$sequence")
        return sequence
    }

    private fun executeSingleBlockTextCallbackGated(
        service: IWoyouService,
        job: NativePrintJobEntity,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        val payload = "TEST\nHELLO\n123\nEND\n"
        val gateLatch = CountDownLatch(1)
        val gateSeen = AtomicBoolean(false)
        callPrinterPrimitive(job, "printText", detail = "callbackGated payloadLength=${payload.length}") {
            service.printText(payload, callbackFor(job, "callbackGated_printText", callbackErrors, dispatchStartMs, gateLatch, gateSeen))
        }
        val callbackArrived = gateLatch.await(CALLBACK_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        if (!callbackArrived) {
            Log.w(TAG, "native_print_low_level_phase commandId=${job.commandId} orderId=${job.orderId ?: ""} op=callbackGated_printText phase=callback_timeout timeoutMs=$CALLBACK_TIMEOUT_MS")
        }
        callPrinterPrimitive(job, "lineWrap", detail = "callbackGated lines=4 callbackArrived=$callbackArrived") {
            service.lineWrap(4, callbackFor(job, "callbackGated_lineWrap", callbackErrors, dispatchStartMs))
        }
        val sequence = "printerInit?->setAlignment->printText(short_fixed)->waitCallbackOrTimeout->lineWrap(4)"
        Log.i(TAG, "native_print_callback_gated_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=SINGLE_BLOCK_TEXT_CALLBACK_GATED fallbackUsed=false callbackObserved=$callbackArrived primitiveSequence=$sequence")
        return sequence
    }

    private fun executeTextVendorParityRobust(
        service: IWoyouService,
        job: NativePrintJobEntity,
        sectionLines: List<SectionLine>,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
        finalizePolicy: FinalizePolicy,
    ): String {
        val fullTextPayload = sectionLines.joinToString("\n") {
            if (config.asciiSafeMode) toSafeAscii(it.text).text else it.text
        } + "\n"


        Log.i(
            TAG,
            "native_print_text_vendor_parity_robust_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=LEGACY_DEFAULT requestedStrategy=${config.requestedNativePrintStrategyRaw} robustPrimary=buffered_transactional_text fallbackOrder=buffered_transactional_text->single_block_text->bitmap_segmented",
        )

        val candidates = listOf("buffered_transactional_text", "single_block_text", "bitmap_segmented")
        candidates.forEach { candidateMode ->
            val callbackErrorStart = callbackErrors.size
            val attemptResult = runCatching {
                when (candidateMode) {
                    "buffered_transactional_text" -> executeTextVendorParityBuffered(service, job, sectionLines, config, callbackErrors, dispatchStartMs, finalizePolicy, null)
                    "single_block_text" -> executeSingleBlockText(service, job, fullTextPayload, config, callbackErrors, dispatchStartMs, finalizePolicy, null)
                    else -> {
                        val bitmapConfig = config.copy(strategy = PhysicalFidelityStrategy.BITMAP_RECEIPT_SEGMENTED_BLOCKS)
                        executeBitmapStrategies(service, job, sectionLines, bitmapConfig, callbackErrors, dispatchStartMs, finalizePolicy, null)
                    }
                }
            }
            val hadCallbackError = callbackErrors.size > callbackErrorStart
            if (attemptResult.isSuccess && !hadCallbackError) return attemptResult.getOrThrow()
            Log.w(TAG, "native_print_text_vendor_parity_robust_attempt_result commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=LEGACY_DEFAULT mode=$candidateMode success=false callbackErrorsAdded=${callbackErrors.size - callbackErrorStart} reason=${attemptResult.exceptionOrNull()?.message ?: "callback_error"}")
        }

        throw LowLevelStepException("robust_strategy_all_attempts_failed", IllegalStateException("buffered_transactional_text, single_block_text and bitmap_segmented all failed"))
    }

    private fun executeSingleBlockText(

        service: IWoyouService,
        job: NativePrintJobEntity,
        fullTextPayload: String,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
        finalizePolicy: FinalizePolicy,
        testMode: RobustPrintTestMode?,
    ): String {
        callPrinterPrimitive(job, "printText", detail = "robustSingleBlock payloadLength=${fullTextPayload.length}") {
            service.printText(fullTextPayload, callbackFor(job, "robustSingleBlock_printText", callbackErrors, dispatchStartMs))
        }
        val finalFeedLines = max(4, config.finalTicketSpacingLines)
        applyFinalizePolicy(
            service = service,
            job = job,
            callbackErrors = callbackErrors,
            dispatchStartMs = dispatchStartMs,
            finalizePolicy = finalizePolicy,
            feedLines = finalFeedLines,
            settleMs = config.finalSettleMs,
            contextTag = "single_block_text",
        )

        val sequence = "printerInit?->setAlignment->printText(full_ticket_single_block)->finalize(${finalizePolicy.name.lowercase()})"
        Log.i(TAG, "native_print_single_block_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=${testMode?.name ?: "LEGACY_DEFAULT"} strategy=single_block_text printerInitUsed=${testMode?.usePrinterInit ?: ENABLE_PRINTER_INIT_BEFORE_DISPATCH} bitmapModeUsed=false transactionalBufferedModeUsed=false lineCount=${fullTextPayload.lines().size} segmentCount=1 finalizeMode=${finalizePolicy.name.lowercase()} primitiveSequence=$sequence")
        return sequence
    }

    private fun applyFinalizePolicy(
        service: IWoyouService,
        job: NativePrintJobEntity,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
        finalizePolicy: FinalizePolicy,
        feedLines: Int,
        settleMs: Long,
        contextTag: String,
    ) {
        Log.i(TAG, "native_print_finalize_policy commandId=${job.commandId} orderId=${job.orderId ?: ""} context=$contextTag finalizeMode=${finalizePolicy.name.lowercase()} feedLines=$feedLines settleMs=$settleMs")
        when (finalizePolicy) {
            FinalizePolicy.FINALIZE_NONE -> {
                Log.i(TAG, "native_print_finalize_skipped commandId=${job.commandId} orderId=${job.orderId ?: ""} context=$contextTag reason=finalize_none")
            }
            FinalizePolicy.FINALIZE_LINEWRAP_ONLY -> {
                callPrinterPrimitive(job, "lineWrap", detail = "$contextTag finalize_linewrap_only lines=$feedLines") {
                    service.lineWrap(feedLines, callbackFor(job, "${contextTag}_finalize_lineWrap", callbackErrors, dispatchStartMs))
                }
            }
            FinalizePolicy.FINALIZE_LINEWRAP_PLUS_RAW -> {
                callPrinterPrimitive(job, "lineWrap", detail = "$contextTag finalize_linewrap_plus_raw lines=$feedLines") {
                    service.lineWrap(feedLines, callbackFor(job, "${contextTag}_finalize_lineWrap", callbackErrors, dispatchStartMs))
                }
                val rawFeed = byteArrayOf(0x1B, 0x64, 0x03)
                callPrinterPrimitive(job, "sendRAWData", detail = "$contextTag finalize_linewrap_plus_raw bytes=${rawFeed.size}") {
                    service.sendRAWData(rawFeed, callbackFor(job, "${contextTag}_finalize_sendRAWData", callbackErrors, dispatchStartMs))
                }
            }
            FinalizePolicy.FINALIZE_EXTRA_FEED_THEN_SLEEP -> {
                val extraFeedLines = feedLines + 2
                callPrinterPrimitive(job, "lineWrap", detail = "$contextTag finalize_extra_feed_then_sleep lines=$extraFeedLines") {
                    service.lineWrap(extraFeedLines, callbackFor(job, "${contextTag}_finalize_extra_feed", callbackErrors, dispatchStartMs))
                }
                val extraSleepMs = max(200L, settleMs)
                Log.i(TAG, "native_print_finalize_sleep commandId=${job.commandId} orderId=${job.orderId ?: ""} context=$contextTag sleepMs=$extraSleepMs")
                runCatching { Thread.sleep(extraSleepMs) }
            }
        }
    }

    private fun modeCompatibilityHint(op: String, throwable: Throwable): String {
        val message = throwable.message.orEmpty()
        return when {
            op == "enterPrinterBuffer" && throwable is NullPointerException -> "NPE_ON_ENTER_PRINTER_BUFFER"
            op.contains("PrinterBuffer", ignoreCase = true) && message.contains("TransBean", ignoreCase = true) -> "BUFFER_API_INCOMPATIBLE"
            else -> "GENERIC_LOW_LEVEL_EXCEPTION"
        }
    }

    private fun resolveRobustTestMode(): RobustPrintTestMode? {
        val normalized = ROBUST_TEST_MODE.trim().uppercase()
        if (normalized.isBlank() || normalized == "LEGACY") return null
        return RobustPrintTestMode.entries.firstOrNull { it.name == normalized } ?: DEFAULT_ROBUST_TEST_MODE
    }

    private fun resolveFinalizePolicy(): FinalizePolicy {
        val normalized = FINALIZE_POLICY_MODE.trim().lowercase()
        return when (normalized) {
            "finalize_none" -> FinalizePolicy.FINALIZE_NONE
            "finalize_linewrap_plus_raw" -> FinalizePolicy.FINALIZE_LINEWRAP_PLUS_RAW
            "finalize_extra_feed_then_sleep" -> FinalizePolicy.FINALIZE_EXTRA_FEED_THEN_SLEEP
            else -> FinalizePolicy.FINALIZE_LINEWRAP_ONLY
        }
    }

    private fun executeTextVendorParityBuffered(
        service: IWoyouService,
        job: NativePrintJobEntity,
        sectionLines: List<SectionLine>,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
        finalizePolicy: FinalizePolicy,
        testMode: RobustPrintTestMode?,
    ): String {
        Log.i(TAG, "native_print_text_vendor_parity_buffered_selected commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=text_vendor_parity_buffered")
        Log.i(TAG, "native_print_text_vendor_parity_buffered_service_info commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedFamily=woyou_legacy_packaged packageName=woyou.aidlservice.jiuiv5 action=woyou.aidlservice.jiuiv5.IWoyouService")

        callPrinterPrimitive(job, "enterPrinterBuffer", detail = "textVendorParity clean=true") {
            service.enterPrinterBuffer(true)
        }

        val headerLines = sectionLines.filter { it.section in setOf(SemanticSection.HEADER, SemanticSection.CUSTOMER, SemanticSection.ADDRESS, SemanticSection.PAYMENT, SemanticSection.TIMESTAMP, SemanticSection.HISTORY, SemanticSection.PREPARATION) }
        val articleLines = sectionLines.filter { it.section == SemanticSection.ARTICLE_LINE }
        val totalLines = sectionLines.filter { it.section == SemanticSection.TOTAL }
        val otherLines = sectionLines.filter { it.section in setOf(SemanticSection.ARTICLES_HEADER, SemanticSection.DIVIDER, SemanticSection.FOOTER_GAP) }

        headerLines.forEachIndexed { idx, line ->
            callPrinterPrimitive(job, "printText", detail = "textVendorParity section=header index=$idx") {
                service.printText(line.text, callbackFor(job, "textVendorParity_header_$idx", callbackErrors, dispatchStartMs))
            }
        }
        callPrinterPrimitive(job, "lineWrap", detail = "textVendorParity sectionGap=header_to_articles lines=2") {
            service.lineWrap(2, callbackFor(job, "textVendorParity_gap_header_articles", callbackErrors, dispatchStartMs))
        }

        otherLines.forEachIndexed { idx, line ->
            callPrinterPrimitive(job, "printText", detail = "textVendorParity section=articlesHeader index=$idx") {
                service.printText(line.text, callbackFor(job, "textVendorParity_articlesHeader_$idx", callbackErrors, dispatchStartMs))
            }
        }
        if (otherLines.isNotEmpty()) {
            callPrinterPrimitive(job, "lineWrap", detail = "textVendorParity sectionGap=articles_header_to_items lines=1") {
                service.lineWrap(1, callbackFor(job, "textVendorParity_gap_articles_header_items", callbackErrors, dispatchStartMs))
            }
        }

        articleLines.forEachIndexed { idx, line ->
            val src = if (config.asciiSafeMode) toSafeAscii(line.text).text else line.text
            val match = Regex("^(\\d+)\\s*x\\s+(.+)$", RegexOption.IGNORE_CASE).find(src)
            val qty = match?.groupValues?.getOrNull(1) ?: "1"
            val name = (match?.groupValues?.getOrNull(2) ?: src).take(24)
            val colsText = arrayOf(qty, name)
            val colsWidth = intArrayOf(6, 26)
            val colsAlign = intArrayOf(0, 0)
            callPrinterPrimitive(job, "printColumnsText", detail = "textVendorParity section=articles index=$idx qty=$qty") {
                service.printColumnsText(colsText, colsWidth, colsAlign, callbackFor(job, "textVendorParity_articleCols_$idx", callbackErrors, dispatchStartMs))
            }
            callPrinterPrimitive(job, "lineWrap", detail = "textVendorParity section=articles rowSpacing lines=1") {
                service.lineWrap(1, callbackFor(job, "textVendorParity_articleRowWrap_$idx", callbackErrors, dispatchStartMs))
            }
        }

        if (totalLines.isNotEmpty()) {
            callPrinterPrimitive(job, "lineWrap", detail = "textVendorParity sectionGap=items_to_total lines=2") {
                service.lineWrap(2, callbackFor(job, "textVendorParity_gap_items_total", callbackErrors, dispatchStartMs))
            }
        }

        totalLines.forEachIndexed { idx, line ->
            val src = if (config.asciiSafeMode) toSafeAscii(line.text).text else line.text
            val parts = src.split(":", limit = 2)
            val left = parts.firstOrNull()?.trim()?.ifBlank { "TOTAL" } ?: "TOTAL"
            val right = parts.getOrNull(1)?.trim().orEmpty().ifBlank { src.take(12) }
            val colsText = arrayOf(left.take(20), right.take(12))
            val colsWidth = intArrayOf(20, 12)
            val colsAlign = intArrayOf(0, 2)
            callPrinterPrimitive(job, "printColumnsText", detail = "textVendorParity section=total index=$idx") {
                service.printColumnsText(colsText, colsWidth, colsAlign, callbackFor(job, "textVendorParity_totalCols_$idx", callbackErrors, dispatchStartMs))
            }
        }

        callPrinterPrimitive(job, "commitPrinterBufferWithCallback", detail = "textVendorParity") {
            service.commitPrinterBufferWithCallback(callbackFor(job, "textVendorParity_commitBuffer", callbackErrors, dispatchStartMs))
        }

        val ticketSpacingLines = max(6, config.finalTicketSpacingLines)
        applyFinalizePolicy(
            service = service,
            job = job,
            callbackErrors = callbackErrors,
            dispatchStartMs = dispatchStartMs,
            finalizePolicy = finalizePolicy,
            feedLines = ticketSpacingLines,
            settleMs = config.finalSettleMs,
            contextTag = "buffered_text",
        )

        val sequence = "printerInit?->setAlignment->enterPrinterBuffer(true)->printText/printColumnsText(sections)->lineWrap(section_spacing)->finalize(${finalizePolicy.name.lowercase()})"
        Log.i(TAG, "native_print_text_vendor_parity_buffered_summary commandId=${job.commandId} orderId=${job.orderId ?: ""} selectedTestMode=${testMode?.name ?: "LEGACY_DEFAULT"} strategy=buffered_transactional_text printerInitUsed=${testMode?.usePrinterInit ?: ENABLE_PRINTER_INIT_BEFORE_DISPATCH} bitmapModeUsed=false transactionalBufferedModeUsed=true lineCount=${sectionLines.size} segmentCount=0 headerLines=${headerLines.size} articleLines=${articleLines.size} totalLines=${totalLines.size} finalizeMode=${finalizePolicy.name.lowercase()} primitiveSequence=$sequence")
        return sequence
    }

    private fun executeTextStrategies(
        service: IWoyouService,
        job: NativePrintJobEntity,
        sectionLines: List<SectionLine>,
        config: PhysicalFidelityConfig,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
    ): String {
        val asciiStats = if (config.asciiSafeMode) {
            sectionLines.fold(Pair(0, 0)) { acc, s ->
                val n = toSafeAscii(s.text)
                Pair(acc.first + n.nonAsciiDetectedCount, acc.second + n.replacedGlyphCount)
            }
        } else Pair(0, 0)

        val explicitWrap = config.strategy in setOf(
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP,
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII,
            PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING,
        )

        Log.i(TAG, "native_print_physical_fidelity_test commandId=${job.commandId} orderId=${job.orderId ?: ""} strategy=${strategyName(config.strategy)} renderedLineCount=${sectionLines.size} explicitLineWrapPerLine=$explicitWrap newlineEmbeddedInPayload=${!explicitWrap && config.appendNewline} asciiNormalized=${config.asciiSafeMode} nonAsciiDetectedCount=${asciiStats.first} replacedGlyphCount=${asciiStats.second}")

        when (config.strategy) {
            PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS -> {
                var idx = 0
                sectionLines.chunked(config.blockSize).forEach { chunk ->
                    val payload = chunk.joinToString("\n") { it.text } + if (config.appendNewline) "\n" else ""
                    Log.i(TAG, "native_print_block_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} blockIndex=$idx lineCount=${chunk.size} payloadLength=${payload.length}")
                    callPrinterPrimitive(job, "printText", detail = "blockIndex=$idx payloadLength=${payload.length}") {
                        service.printText(payload, callbackFor(job, "printText_block_$idx", callbackErrors, dispatchStartMs))
                    }
                    sleepAfterDispatch(job, idx, config.dispatchDelayMs)
                    idx++
                }
            }

            else -> {
                sectionLines.forEachIndexed { i, s ->
                    val ascii = if (config.asciiSafeMode) toSafeAscii(s.text) else AsciiNormalizationResult(s.text, 0, 0)
                    val payload = if (explicitWrap) ascii.text else if (config.appendNewline) ascii.text + "\n" else ascii.text
                    Log.i(TAG, "native_print_line_dispatch commandId=${job.commandId} orderId=${job.orderId ?: ""} lineIndex=$i semanticSection=${s.section.name} payloadLength=${payload.length} newlineAppended=${!explicitWrap && config.appendNewline} explicitLineWrapAfterLine=$explicitWrap asciiNormalized=${config.asciiSafeMode} text=$payload")
                    callPrinterPrimitive(job, "printText", detail = "lineIndex=$i payloadLength=${payload.length}") {
                        service.printText(payload, callbackFor(job, "printText_line_$i", callbackErrors, dispatchStartMs))
                    }
                    if (explicitWrap && config.perLineWrap > 0) {
                        callPrinterPrimitive(job, "lineWrap", detail = "lineIndex=$i lines=${config.perLineWrap}") {
                            service.lineWrap(config.perLineWrap, callbackFor(job, "lineWrap_line_$i", callbackErrors, dispatchStartMs))
                        }
                    }
                    sleepAfterDispatch(job, i, config.dispatchDelayMs)
                }
            }
        }

        callPrinterPrimitive(job, "lineWrap", detail = "finalTicketSpacing lines=${config.finalTicketSpacingLines}") {
            service.lineWrap(config.finalTicketSpacingLines, callbackFor(job, "lineWrap_final_spacing", callbackErrors, dispatchStartMs))
        }
        if (config.finalSettleMs > 0) runCatching { Thread.sleep(config.finalSettleMs) }
        callPrinterPrimitive(job, "sendRAWData", detail = "bytes=3") {
            service.sendRAWData(byteArrayOf(0x1B, 0x64, 0x03), callbackFor(job, "sendRAWData", callbackErrors, dispatchStartMs))
        }
        return "printerInit->setAlignment->printText(text_modes)->lineWrap(finalSpacing)->sendRAWData"
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
        Log.i(TAG, "native_print_dispatch_delay commandId=${job.commandId} orderId=${job.orderId ?: ""} stepIndex=$stepIndex delayMs=$delayMs")
        runCatching { Thread.sleep(delayMs) }
    }

    private fun toSafeAscii(input: String): AsciiNormalizationResult {
        var replaced = 0
        var nonAscii = 0
        val mapped = buildString {
            for (ch in input) {
                val r = when (ch) {
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
                if (ch.code > 127) nonAscii++
                if (r != ch) replaced++
                append(r)
            }
        }
        val normalized = Normalizer.normalize(mapped, Normalizer.Form.NFD)
        val out = buildString {
            for (ch in normalized) {
                if (Character.getType(ch) == Character.NON_SPACING_MARK.toInt()) {
                    replaced++
                    continue
                }
                if (ch.code in 32..126) append(ch) else {
                    append('?')
                    replaced++
                }
            }
        }
        return AsciiNormalizationResult(out, nonAscii, replaced)
    }

    private fun strategyName(strategy: PhysicalFidelityStrategy): String {
        return when (strategy) {
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_DELAY -> "line_by_line_text_with_delay"
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP -> "line_by_line_text_with_explicit_linewrap"
            PhysicalFidelityStrategy.LINE_BY_LINE_TEXT_WITH_EXPLICIT_LINEWRAP_ASCII -> "line_by_line_text_with_explicit_linewrap_ascii"
            PhysicalFidelityStrategy.LINE_BY_LINE_ASCII_EXPLICIT_LINEWRAP_WITH_TICKET_SPACING -> "line_by_line_ascii_explicit_linewrap_with_ticket_spacing"
            PhysicalFidelityStrategy.TEXT_VENDOR_PARITY_UNBUFFERED -> "text_vendor_parity_unbuffered"
            PhysicalFidelityStrategy.DIRECT_SELF_CHECK_THEN_MINIMAL_TEXT -> "direct_self_check_then_minimal_text"
            PhysicalFidelityStrategy.TEXT_VENDOR_PARITY_BUFFERED -> "text_vendor_parity_buffered"
            PhysicalFidelityStrategy.BITMAP_RECEIPT_SINGLE_IMAGE -> "bitmap_receipt_single_image"
            PhysicalFidelityStrategy.BITMAP_RECEIPT_SEGMENTED_BLOCKS -> "bitmap_receipt_segmented_blocks"
            PhysicalFidelityStrategy.BITMAP_SMOKE_TEST_MINIMAL_BLOCKS -> "bitmap_smoke_test_minimal_blocks"
            PhysicalFidelityStrategy.VENDOR_PARITY_WOYOU_MINIMAL_TEST -> "vendor_parity_woyou_minimal_test"
            PhysicalFidelityStrategy.VENDOR_PARITY_BITMAP_CUSTOM_COMPARE -> "vendor_parity_bitmap_custom_compare"
            PhysicalFidelityStrategy.VENDOR_PARITY_BITMAP_PHYSICAL_DIAGNOSTICS -> "vendor_parity_bitmap_physical_diagnostics"
            PhysicalFidelityStrategy.TRANSACTION_MODE_TINY_DIAGNOSTIC_TEST -> "transaction_mode_tiny_diagnostic_test"
            PhysicalFidelityStrategy.GROUPED_SMALL_BLOCKS -> "grouped_small_blocks"
        }
    }

    private fun renderPrintableText(job: NativePrintJobEntity): RenderedPrintText {
        val payload = runCatching { JSONObject(job.payloadJson) }
            .getOrElse { throw RenderTextException("invalid_json:${it.message ?: "malformed"}") }

        val lines = mutableListOf<String>()
        val primaryHeader = payload.optString("orderNumber").ifBlank {
            payload.optString("order_number").ifBlank { payload.optString("orderId").ifBlank { payload.optString("order_id") } }
        }.ifBlank { "ORDER" }

        val receiptLines = mutableListOf<String>()
        payload.optJSONObject("displayModel")?.optJSONArray("receiptLines")?.let { arr ->
            for (i in 0 until arr.length()) {
                val line = arr.optString(i).trimEnd()
                if (line.isNotBlank()) receiptLines += line
            }
        }

        if (receiptLines.isNotEmpty()) {
            lines += receiptLines
            if (receiptLines.first().trim() != primaryHeader.trim()) lines.add(0, primaryHeader)
        } else {
            lines += primaryHeader
            val items = payload.optJSONArray("lines") ?: payload.optJSONArray("items")
            if (items != null) {
                lines += "Articles:"
                for (i in 0 until items.length()) {
                    val item = items.optJSONObject(i) ?: continue
                    lines += "${item.optInt("quantity", 1)} x ${item.optString("name").ifBlank { item.optString("title", "Article") }}"
                }
            }
            payload.optJSONObject("totals")?.takeIf { it.has("total") }?.let {
                lines += "TOTAL: ${"%.2f".format(it.optDouble("total"))} ${it.optString("currency", "CHF")}" }
        }

        val text = lines.map { it.trimEnd() }.filter { it.isNotBlank() }.joinToString("\n", postfix = "\n")
        if (text.isBlank() || text == "ORDER\n") throw RenderTextException("empty_rendered_text")
        return RenderedPrintText(text, "real_order_payload")
    }

    private fun logRenderedText(job: NativePrintJobEntity, rendered: RenderedPrintText) {
        val renderedLines = rendered.text.lines().filter { it.isNotBlank() }
        Log.i(TAG, "native_print_rendered_text_meta commandId=${job.commandId} orderId=${job.orderId ?: ""} source=${rendered.source} renderedLineCount=${renderedLines.size} renderedCharLength=${rendered.text.length}")
        Log.i(TAG, "native_print_rendered_text_start commandId=${job.commandId} orderId=${job.orderId ?: ""}")
        renderedLines.forEachIndexed { idx, line -> Log.i(TAG, "native_print_rendered_text_line commandId=${job.commandId} orderId=${job.orderId ?: ""} lineIndex=$idx text=$line") }
        Log.i(TAG, "native_print_rendered_text_end commandId=${job.commandId} orderId=${job.orderId ?: ""}")
    }

    private fun callPrinterPrimitive(job: NativePrintJobEntity, step: String, detail: String? = null, call: () -> Unit) {
        val suffix = if (detail.isNullOrBlank()) "" else " $detail"
        Log.i(TAG, "native_print_low_level_phase commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step phase=begin sourceJobId=${job.sourceJobId ?: ""}$suffix")
        try {
            call()
            Log.i(TAG, "native_print_low_level_phase commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step phase=binder_return sourceJobId=${job.sourceJobId ?: ""}$suffix")
        } catch (t: Throwable) {
            activeTelemetry.get()?.let {
                it.binderAccepted = false
                it.exceptionObserved = true
                it.exceptionOriginOp = step
                it.exceptionClass = t::class.java.simpleName
                it.exceptionMessage = t.message ?: "unknown"
            }
            Log.e(TAG, "native_print_low_level_phase commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step phase=exception exceptionClass=${t::class.java.name} exceptionOriginOp=$step exceptionMessage=${t.message ?: "unknown"} modeCompatibilityHint=${modeCompatibilityHint(step, t)}")
            throw LowLevelStepException(step, t)
        }
    }

    private fun callbackFor(
        job: NativePrintJobEntity,
        step: String,
        callbackErrors: MutableList<String>,
        dispatchStartMs: Long,
        gateLatch: CountDownLatch? = null,
        gateSeen: AtomicBoolean? = null,
    ): ICallback {
        val callbackResolved = AtomicBoolean(false)
        Thread {
            runCatching { Thread.sleep(CALLBACK_TIMEOUT_MS) }
            if (!callbackResolved.get()) {
                Log.w(TAG, "native_print_low_level_phase commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step phase=callback_timeout timeoutMs=$CALLBACK_TIMEOUT_MS")
            }
        }.start()

        return object : ICallback.Stub() {
            override fun onRunResult(isSuccess: Boolean) {
                callbackResolved.set(true)
                gateSeen?.set(true)
                gateLatch?.countDown()
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                activeTelemetry.get()?.let {
                    it.callbackObserved = true
                    if (isSuccess) it.callbackSuccess = true
                }
                Log.i(TAG, "native_print_low_level_phase commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step phase=callback_received callback=onRunResult success=$isSuccess code=NA message=NA deltaMs=$deltaMs")
                if (!isSuccess) callbackErrors += "$step:onRunResult:false"
            }
            override fun onReturnString(result: String?) {
                callbackResolved.set(true)
                gateSeen?.set(true)
                gateLatch?.countDown()
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                activeTelemetry.get()?.callbackObserved = true
                Log.i(TAG, "native_print_low_level_phase commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step phase=callback_received callback=onReturnString success=true code=NA message=${result ?: ""} deltaMs=$deltaMs")
            }
            override fun onRaiseException(code: Int, msg: String?) {
                callbackResolved.set(true)
                gateSeen?.set(true)
                gateLatch?.countDown()
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                activeTelemetry.get()?.let {
                    it.callbackObserved = true
                    it.exceptionObserved = true
                    it.exceptionOriginOp = step
                    it.exceptionClass = "CallbackException"
                    it.exceptionMessage = msg ?: "unknown"
                }
                Log.i(TAG, "native_print_low_level_phase commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step phase=callback_received callback=onRaiseException success=false code=$code message=${msg ?: "unknown"} deltaMs=$deltaMs")
                callbackErrors += "$step:onRaiseException:$code:${msg ?: "unknown"}"
            }
            override fun onPrintResult(code: Int, msg: String?) {
                callbackResolved.set(true)
                gateSeen?.set(true)
                gateLatch?.countDown()
                val deltaMs = System.currentTimeMillis() - dispatchStartMs
                val success = code == 0
                activeTelemetry.get()?.let {
                    it.callbackObserved = true
                    if (success) it.callbackSuccess = true
                }
                Log.i(TAG, "native_print_low_level_phase commandId=${job.commandId} orderId=${job.orderId ?: ""} op=$step phase=callback_received callback=onPrintResult success=$success code=$code message=${msg ?: ""} deltaMs=$deltaMs")
                if (!success) callbackErrors += "$step:onPrintResult:$code:${msg ?: "unknown"}"
            }
        }
    }


    companion object {
        private const val TAG = "NativePrinterWorker"
        private val DEFAULT_ACTIVE_STRATEGY = PhysicalFidelityStrategy.TEXT_VENDOR_PARITY_UNBUFFERED
        // Controlled test matrix switch for robust vendor parity path.
        private val DEFAULT_ROBUST_TEST_MODE = RobustPrintTestMode.MODE_C
        private const val ROBUST_TEST_MODE = "MODE_C" // MODE_A..MODE_F, LEGACY
        private const val ENABLE_PRINTER_INIT_BEFORE_DISPATCH = false // Used only when ROBUST_TEST_MODE=LEGACY
        private const val FINALIZE_POLICY_MODE = "finalize_linewrap_only" // finalize_none, finalize_linewrap_only, finalize_linewrap_plus_raw, finalize_extra_feed_then_sleep
        private const val CALLBACK_TIMEOUT_MS = 1800L
        private val activeTelemetry = ThreadLocal<LowLevelExecutionTelemetry>()
        private const val DEFAULT_BITMAP_WIDTH_PX = 384
        private const val MAX_SINGLE_BITMAP_HEIGHT_PX = 2600
        private const val DEFAULT_LINE_DELAY_MS = 35L
        private const val DEFAULT_FINAL_SETTLE_MS = 150L
        private const val DEFAULT_BLOCK_SIZE = 2
    }
}
