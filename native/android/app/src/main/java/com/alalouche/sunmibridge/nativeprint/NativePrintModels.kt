package com.alalouche.sunmibridge.nativeprint

enum class NativePrintJobState {
    QUEUED,
    DISPATCHING,
    ACCEPTED_BY_NATIVE,
    PRINTED_IF_CONFIRMABLE,
    NEEDS_ATTENTION,
    FAILED,
}

enum class PhysicalPrintOutcome {
    CONFIRMED,
    UNKNOWN,
    NOT_CONFIRMED,
}

data class NativePrintJobEntity(
    val commandId: String,
    val orderId: String?,
    val sourceJobId: String?,
    val payloadJson: String,
    val state: NativePrintJobState,
    val attemptCount: Int,
    val maxAttempts: Int,
    val retryable: Boolean,
    val errorCode: String?,
    val errorMessage: String?,
    val selectedServiceFamily: String?,
    val dispatchAdapterEntered: Boolean,
    val nativeDispatchAttempted: Boolean,
    val lowLevelSequenceStarted: Boolean,
    val lowLevelSequenceCompleted: Boolean,
    val physicalOutcome: PhysicalPrintOutcome,
    val createdAtEpochMs: Long,
    val updatedAtEpochMs: Long,
    val nextAttemptAtEpochMs: Long?,
)

data class NativeDispatchReport(
    val acceptedByNative: Boolean,
    val dispatchStarted: Boolean,
    val dispatchCompleted: Boolean,
    val dispatchAdapterEntered: Boolean,
    val nativeDispatchAttempted: Boolean,
    val lowLevelSequenceStarted: Boolean,
    val lowLevelSequenceCompleted: Boolean,
    val selectedServiceFamily: String?,
    val physicalOutcome: PhysicalPrintOutcome,
    val retryable: Boolean,
    val errorCode: String? = null,
    val errorMessage: String? = null,
)
