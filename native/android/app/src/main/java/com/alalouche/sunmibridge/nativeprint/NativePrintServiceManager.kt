package com.alalouche.sunmibridge.nativeprint

import android.content.Context
import android.os.Build
import android.util.Log
import org.json.JSONObject
import java.util.Locale

class NativePrintServiceManager(context: Context) {
    private val db = NativePrintDatabase(context)
    private val dao = db.nativePrintJobDao()
    private val queue = NativePrintQueueManager(dao, SunmiNativePrinterWorker(context))

    fun submitPrintCommand(printJobJson: String?): JSONObject {
        if (printJobJson.isNullOrBlank()) {
            return error(
                code = "INVALID_PRINT_COMMAND",
                message = "print command payload is required.",
                retryable = false,
                needsAttention = true,
            )
        }

        val payload = runCatching { JSONObject(printJobJson) }.getOrElse {
            return error(
                code = "INVALID_PRINT_COMMAND_JSON",
                message = "print command payload is malformed.",
                details = it.message,
                retryable = false,
                needsAttention = true,
            )
        }

        val orderId = payload.optString("orderId").ifBlank {
            payload.optString("order_id").ifBlank { null }
        }

        val now = System.currentTimeMillis()
        val commandId = "npc_${java.util.UUID.randomUUID()}"
        val job = NativePrintJobEntity(
            commandId = commandId,
            orderId = orderId,
            payloadJson = printJobJson,
            state = NativePrintJobState.QUEUED,
            attemptCount = 0,
            maxAttempts = DEFAULT_MAX_ATTEMPTS,
            retryable = true,
            errorCode = null,
            errorMessage = null,
            physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
            createdAtEpochMs = now,
            updatedAtEpochMs = now,
            nextAttemptAtEpochMs = null,
        )

        queue.enqueue(job)
        Log.i(TAG, "native_print_command accepted commandId=$commandId orderId=${orderId ?: ""}")
        return JSONObject().apply {
            put("ok", true)
            put("code", "COMMAND_ACCEPTED")
            put("commandAccepted", true)
            put("commandId", commandId)
            put("orderId", orderId ?: JSONObject.NULL)
            put("state", NativePrintJobState.QUEUED.name)
            put("nativeDispatchAttempted", false)
            put("physicalPrintOutcome", PhysicalPrintOutcome.UNKNOWN.name)
            put("message", "Print command accepted by native queue.")
            put("mode", "native_print_service")
            put("bridgeDeprecated", true)
        }
    }

    fun getPrintCommandStatus(commandId: String): JSONObject {
        if (commandId.isBlank()) {
            return error("INVALID_COMMAND_ID", "commandId is required.", retryable = false, needsAttention = true)
        }
        val job = dao.getById(commandId)
            ?: return error("PRINT_COMMAND_NOT_FOUND", "No print command found for commandId.", retryable = false, needsAttention = true)

        val physicalConfirmable = job.physicalOutcome == PhysicalPrintOutcome.CONFIRMED
        val successful = job.state == NativePrintJobState.PRINTED_IF_CONFIRMABLE && physicalConfirmable
        return JSONObject().apply {
            put("ok", true)
            put("commandId", job.commandId)
            put("orderId", job.orderId ?: JSONObject.NULL)
            put("state", job.state.name)
            put("attemptCount", job.attemptCount)
            put("maxAttempts", job.maxAttempts)
            put("retryable", job.retryable)
            put("needsAttention", job.state == NativePrintJobState.NEEDS_ATTENTION || job.state == NativePrintJobState.FAILED)
            put("nativeDispatchStarted", job.state != NativePrintJobState.QUEUED)
            put("nativeDispatchCompleted", job.state != NativePrintJobState.QUEUED && job.state != NativePrintJobState.DISPATCHING)
            put("acceptedByNative", job.state == NativePrintJobState.ACCEPTED_BY_NATIVE || successful)
            put("printCompleted", successful)
            put("physicalPrintConfirmable", physicalConfirmable)
            put("physicalPrintOutcome", job.physicalOutcome.name)
            put("errorCode", job.errorCode ?: JSONObject.NULL)
            put("errorMessage", job.errorMessage ?: JSONObject.NULL)
            put("updatedAt", job.updatedAtEpochMs)
            put("createdAt", job.createdAtEpochMs)
            put("mode", "native_print_service")
        }
    }

    fun retryPrintCommand(commandId: String): JSONObject {
        if (commandId.isBlank()) {
            return error("INVALID_COMMAND_ID", "commandId is required.", retryable = false, needsAttention = true)
        }
        val current = dao.getById(commandId)
            ?: return error("PRINT_COMMAND_NOT_FOUND", "No print command found for commandId.", retryable = false, needsAttention = true)

        if (!current.retryable || current.state != NativePrintJobState.NEEDS_ATTENTION) {
            return error(
                code = "PRINT_COMMAND_NOT_RETRYABLE",
                message = "Print command is not retryable.",
                retryable = false,
                needsAttention = true,
            )
        }

        val retried = queue.retry(commandId)
            ?: return error("PRINT_COMMAND_NOT_FOUND", "No print command found for commandId.", retryable = false, needsAttention = true)

        return JSONObject().apply {
            put("ok", true)
            put("code", "COMMAND_REQUEUED")
            put("commandAccepted", true)
            put("commandId", retried.commandId)
            put("orderId", retried.orderId ?: JSONObject.NULL)
            put("state", retried.state.name)
            put("retryable", retried.retryable)
            put("nativeDispatchAttempted", false)
            put("physicalPrintOutcome", retried.physicalOutcome.name)
            put("message", "Print command re-queued.")
            put("mode", "native_print_service")
        }
    }

    fun release() {
        runCatching { db.close() }
    }

    private fun error(
        code: String,
        message: String,
        details: String? = null,
        retryable: Boolean,
        needsAttention: Boolean,
    ): JSONObject {
        val isLikelyV2s = (Build.MODEL ?: "").lowercase(Locale.ROOT).contains("v2s")
        return JSONObject().apply {
            put("ok", false)
            put("code", code)
            put("message", message)
            if (!details.isNullOrBlank()) put("details", details)
            put("retryable", retryable)
            put("needsAttention", needsAttention)
            put("mode", "native_print_service")
            if (isLikelyV2s) {
                put("architectureStatus", "UNSUITABLE_BRIDGE_AIDL_V2S")
                put("recommendedNextStep", "DEDICATED_NATIVE_PRINT_SERVICE")
            }
        }
    }

    companion object {
        private const val TAG = "NativePrintSvcManager"
        private const val DEFAULT_MAX_ATTEMPTS = 3
    }
}
