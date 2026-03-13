package com.alalouche.sunmibridge.printservice

import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class PrintQueueOrchestrator(
    private val dao: PrintJobDao,
    private val executor: PrintTransportExecutor,
) {
    private val worker = Executors.newSingleThreadExecutor()
    private val isDraining = AtomicBoolean(false)

    fun enqueue(job: PrintJobEntity) {
        dao.insert(job)
        scheduleDrain()
    }

    fun getStatus(jobId: String): PrintJobEntity? = dao.getById(jobId)

    fun scheduleDrain() {
        if (!isDraining.compareAndSet(false, true)) return
        worker.execute {
            try {
                drainLoop()
            } finally {
                isDraining.set(false)
                if (dao.getNextRunnableJob(System.currentTimeMillis()) != null) {
                    scheduleDrain()
                }
            }
        }
    }

    private fun drainLoop() {
        while (true) {
            val now = System.currentTimeMillis()
            val next = dao.getNextRunnableJob(now) ?: return

            val locked = dao.updateState(
                jobId = next.jobId,
                expectedCurrent = next.state,
                newState = PrintJobState.PRINTING,
                attemptCount = next.attemptCount + 1,
                errorCode = null,
                errorMessage = null,
                nextAttemptAtEpochMs = null,
            )
            if (!locked) {
                continue
            }

            val active = dao.getById(next.jobId) ?: continue
            val result = runCatching { executor.execute(active) }.getOrElse {
                PrintExecutionResult(success = false, errorCode = "EXECUTOR_EXCEPTION", errorMessage = it.message ?: "unknown")
            }

            if (result.success) {
                dao.updateState(
                    jobId = active.jobId,
                    expectedCurrent = PrintJobState.PRINTING,
                    newState = PrintJobState.PRINTED,
                    errorCode = null,
                    errorMessage = null,
                    nextAttemptAtEpochMs = null,
                )
                continue
            }

            val canRetry = active.attemptCount + 1 < active.maxAttempts
            if (canRetry) {
                val backoffMs = RETRY_BACKOFF_MS.coerceAtLeast(0L)
                dao.updateState(
                    jobId = active.jobId,
                    expectedCurrent = PrintJobState.PRINTING,
                    newState = PrintJobState.RETRY_SCHEDULED,
                    errorCode = result.errorCode,
                    errorMessage = result.errorMessage,
                    nextAttemptAtEpochMs = System.currentTimeMillis() + backoffMs,
                )
                Log.w(TAG, "Print job scheduled for retry jobId=${active.jobId} error=${result.errorCode}")
            } else {
                dao.updateState(
                    jobId = active.jobId,
                    expectedCurrent = PrintJobState.PRINTING,
                    newState = PrintJobState.NEEDS_ATTENTION,
                    errorCode = result.errorCode,
                    errorMessage = result.errorMessage,
                    nextAttemptAtEpochMs = null,
                )
                Log.e(TAG, "Print job needs attention jobId=${active.jobId} error=${result.errorCode}")
            }
        }
    }

    companion object {
        private const val TAG = "PrintQueueOrchestrator"
        private const val RETRY_BACKOFF_MS = 3000L
    }
}

fun interface PrintTransportExecutor {
    fun execute(job: PrintJobEntity): PrintExecutionResult
}

data class PrintExecutionResult(
    val success: Boolean,
    val errorCode: String? = null,
    val errorMessage: String? = null,
)
