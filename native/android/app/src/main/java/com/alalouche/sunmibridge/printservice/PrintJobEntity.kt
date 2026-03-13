package com.alalouche.sunmibridge.printservice

data class PrintJobEntity(
    val jobId: String,
    val orderId: String?,
    val payloadJson: String,
    val state: PrintJobState,
    val attemptCount: Int,
    val maxAttempts: Int,
    val errorCode: String?,
    val errorMessage: String?,
    val createdAtEpochMs: Long,
    val updatedAtEpochMs: Long,
    val nextAttemptAtEpochMs: Long?,
)
