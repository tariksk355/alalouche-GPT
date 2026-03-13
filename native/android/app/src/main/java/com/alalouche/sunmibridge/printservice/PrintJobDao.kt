package com.alalouche.sunmibridge.printservice

interface PrintJobDao {
    fun insert(job: PrintJobEntity)
    fun getById(jobId: String): PrintJobEntity?
    fun getNextRunnableJob(nowEpochMs: Long): PrintJobEntity?
    fun updateState(
        jobId: String,
        expectedCurrent: PrintJobState?,
        newState: PrintJobState,
        attemptCount: Int? = null,
        errorCode: String? = null,
        errorMessage: String? = null,
        nextAttemptAtEpochMs: Long? = null,
    ): Boolean
}
