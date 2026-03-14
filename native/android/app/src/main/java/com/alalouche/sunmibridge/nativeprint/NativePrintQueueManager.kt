package com.alalouche.sunmibridge.nativeprint

import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class NativePrintQueueManager(
    private val dao: NativePrintJobDao,
    private val worker: NativePrinterWorker,
) {
    private val singleWorker = Executors.newSingleThreadExecutor()
    private val draining = AtomicBoolean(false)

    fun enqueue(job: NativePrintJobEntity) {
        dao.insert(job)
        scheduleDrain()
    }

    fun getStatus(commandId: String): NativePrintJobEntity? = dao.getById(commandId)

    fun retry(commandId: String): NativePrintJobEntity? {
        val current = dao.getById(commandId) ?: return null
        if (current.state != NativePrintJobState.NEEDS_ATTENTION || !current.retryable) return current
        val now = System.currentTimeMillis()
        dao.update(
            current.copy(
                state = NativePrintJobState.QUEUED,
                attemptCount = 0,
                errorCode = null,
                errorMessage = null,
                updatedAtEpochMs = now,
                nextAttemptAtEpochMs = null,
            ),
        )
        scheduleDrain()
        return dao.getById(commandId)
    }

    fun scheduleDrain() {
        if (!draining.compareAndSet(false, true)) return
        singleWorker.execute {
            try {
                drainLoop()
            } finally {
                draining.set(false)
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
            dao.update(
                next.copy(
                    state = NativePrintJobState.DISPATCHING,
                    attemptCount = next.attemptCount + 1,
                    updatedAtEpochMs = now,
                ),
            )

            val active = dao.getById(next.commandId) ?: continue
            val report = runCatching { worker.dispatch(active) }.getOrElse {
                NativeDispatchReport(
                    acceptedByNative = false,
                    dispatchStarted = false,
                    dispatchCompleted = false,
                    physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                    retryable = false,
                    errorCode = "NATIVE_WORKER_EXCEPTION",
                    errorMessage = it.message ?: "unknown",
                )
            }

            val updatedAt = System.currentTimeMillis()
            val updated = when {
                report.acceptedByNative && report.dispatchCompleted && report.physicalOutcome == PhysicalPrintOutcome.CONFIRMED -> {
                    active.copy(
                        state = NativePrintJobState.PRINTED_IF_CONFIRMABLE,
                        retryable = false,
                        physicalOutcome = report.physicalOutcome,
                        errorCode = null,
                        errorMessage = null,
                        updatedAtEpochMs = updatedAt,
                        nextAttemptAtEpochMs = null,
                    )
                }

                report.acceptedByNative -> {
                    // Honest status: accepted by native, physical print might be unknown on some devices.
                    active.copy(
                        state = NativePrintJobState.ACCEPTED_BY_NATIVE,
                        retryable = false,
                        physicalOutcome = report.physicalOutcome,
                        errorCode = report.errorCode,
                        errorMessage = report.errorMessage,
                        updatedAtEpochMs = updatedAt,
                        nextAttemptAtEpochMs = null,
                    )
                }

                report.retryable && active.attemptCount + 1 < active.maxAttempts -> {
                    active.copy(
                        state = NativePrintJobState.QUEUED,
                        retryable = true,
                        physicalOutcome = report.physicalOutcome,
                        errorCode = report.errorCode,
                        errorMessage = report.errorMessage,
                        updatedAtEpochMs = updatedAt,
                        nextAttemptAtEpochMs = updatedAt + RETRY_BACKOFF_MS,
                    )
                }

                report.retryable -> {
                    active.copy(
                        state = NativePrintJobState.NEEDS_ATTENTION,
                        retryable = true,
                        physicalOutcome = report.physicalOutcome,
                        errorCode = report.errorCode,
                        errorMessage = report.errorMessage,
                        updatedAtEpochMs = updatedAt,
                        nextAttemptAtEpochMs = null,
                    )
                }

                else -> {
                    active.copy(
                        state = NativePrintJobState.FAILED,
                        retryable = false,
                        physicalOutcome = report.physicalOutcome,
                        errorCode = report.errorCode,
                        errorMessage = report.errorMessage,
                        updatedAtEpochMs = updatedAt,
                        nextAttemptAtEpochMs = null,
                    )
                }
            }

            dao.update(updated)
            Log.i(TAG, "native_print_queue_update commandId=${updated.commandId} state=${updated.state} retryable=${updated.retryable} physicalOutcome=${updated.physicalOutcome} errorCode=${updated.errorCode ?: ""}")
        }
    }

    companion object {
        private const val TAG = "NativePrintQueueMgr"
        private const val RETRY_BACKOFF_MS = 3000L
    }
}
