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
        Log.i(TAG, "native_print_command_persisted commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""} state=${job.state}")
        scheduleDrain()
    }

    fun getStatus(commandId: String): NativePrintJobEntity? = dao.getById(commandId)

    fun reconcileUnfinishedOnStartup() {
        val inFlight = dao.getByStates(setOf(NativePrintJobState.DISPATCHING))
        for (job in inFlight) {
            val updated = job.copy(
                state = NativePrintJobState.NEEDS_ATTENTION,
                retryable = true,
                errorCode = "NATIVE_PRINT_RECOVERED_FROM_INFLIGHT_ON_STARTUP",
                errorMessage = "Recovered DISPATCHING job on startup; manual retry recommended.",
                updatedAtEpochMs = System.currentTimeMillis(),
                nextAttemptAtEpochMs = null,
            )
            persistTransition(job, updated, "startup_reconcile")
        }

        val queued = dao.getByStates(setOf(NativePrintJobState.QUEUED))
        if (queued.isNotEmpty()) {
            Log.i(TAG, "native_print_queue_resume_startup queuedCount=${queued.size}")
            scheduleDrain()
        }
    }

    fun retry(commandId: String): NativePrintJobEntity? {
        val current = dao.getById(commandId) ?: return null
        if (current.state != NativePrintJobState.NEEDS_ATTENTION || !current.retryable) {
            Log.i(TAG, "native_print_retry_rejected commandId=${current.commandId} orderId=${current.orderId ?: ""} sourceJobId=${current.sourceJobId ?: ""} state=${current.state} retryable=${current.retryable}")
            return current
        }
        val updated = current.copy(
            state = NativePrintJobState.QUEUED,
            attemptCount = 0,
            errorCode = null,
            errorMessage = null,
            updatedAtEpochMs = System.currentTimeMillis(),
            nextAttemptAtEpochMs = null,
        )
        persistTransition(current, updated, "retry_requested")
        scheduleDrain()
        return dao.getById(commandId)
    }

    fun scheduleDrain() {
        if (!draining.compareAndSet(false, true)) {
            Log.i(TAG, "native_print_queue_drain_skip command=inflight")
            return
        }
        singleWorker.execute {
            Log.i(TAG, "native_print_queue_drain_start")
            try {
                drainLoop()
            } finally {
                draining.set(false)
                Log.i(TAG, "native_print_queue_drain_finish")
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

            val dispatching = next.copy(
                state = NativePrintJobState.DISPATCHING,
                attemptCount = next.attemptCount + 1,
                updatedAtEpochMs = now,
            )
            persistTransition(next, dispatching, "worker_pickup")
            Log.i(TAG, "native_print_worker_started commandId=${dispatching.commandId} orderId=${dispatching.orderId ?: ""} sourceJobId=${dispatching.sourceJobId ?: ""} attempt=${dispatching.attemptCount}/${dispatching.maxAttempts}")

            val report = try {
                Log.i(TAG, "native_print_dispatch_start commandId=${dispatching.commandId} orderId=${dispatching.orderId ?: ""} sourceJobId=${dispatching.sourceJobId ?: ""}")
                worker.dispatch(dispatching)
            } catch (t: Throwable) {
                Log.e(TAG, "native_print_dispatch_error commandId=${dispatching.commandId} orderId=${dispatching.orderId ?: ""} sourceJobId=${dispatching.sourceJobId ?: ""} reason=${t.message ?: "unknown"}")
                NativeDispatchReport(
                    acceptedByNative = false,
                    dispatchStarted = true,
                    dispatchCompleted = false,
                    physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                    retryable = false,
                    errorCode = "NATIVE_WORKER_EXCEPTION",
                    errorMessage = t.message ?: "unknown",
                )
            }

            Log.i(
                TAG,
                "native_print_dispatch_result commandId=${dispatching.commandId} orderId=${dispatching.orderId ?: ""} sourceJobId=${dispatching.sourceJobId ?: ""} acceptedByNative=${report.acceptedByNative} dispatchStarted=${report.dispatchStarted} dispatchCompleted=${report.dispatchCompleted} physicalOutcome=${report.physicalOutcome} retryable=${report.retryable} errorCode=${report.errorCode ?: ""}",
            )

            val updatedAt = System.currentTimeMillis()
            val terminal = when {
                report.acceptedByNative && report.dispatchCompleted && report.physicalOutcome == PhysicalPrintOutcome.CONFIRMED -> {
                    dispatching.copy(
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
                    dispatching.copy(
                        state = NativePrintJobState.ACCEPTED_BY_NATIVE,
                        retryable = false,
                        physicalOutcome = report.physicalOutcome,
                        errorCode = report.errorCode,
                        errorMessage = report.errorMessage,
                        updatedAtEpochMs = updatedAt,
                        nextAttemptAtEpochMs = null,
                    )
                }

                report.retryable && dispatching.attemptCount < dispatching.maxAttempts -> {
                    dispatching.copy(
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
                    dispatching.copy(
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
                    dispatching.copy(
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

            persistTransition(dispatching, terminal, "dispatch_result")
            val isTerminal = terminal.state in setOf(
                NativePrintJobState.ACCEPTED_BY_NATIVE,
                NativePrintJobState.PRINTED_IF_CONFIRMABLE,
                NativePrintJobState.NEEDS_ATTENTION,
                NativePrintJobState.FAILED,
            )
            if (isTerminal) {
                Log.i(TAG, "native_print_terminal_state commandId=${terminal.commandId} orderId=${terminal.orderId ?: ""} sourceJobId=${terminal.sourceJobId ?: ""} state=${terminal.state} retryable=${terminal.retryable} physicalOutcome=${terminal.physicalOutcome} errorCode=${terminal.errorCode ?: ""}")
            }
        }
    }

    private fun persistTransition(from: NativePrintJobEntity, to: NativePrintJobEntity, reason: String) {
        dao.update(to)
        Log.i(
            TAG,
            "native_print_state_transition commandId=${to.commandId} orderId=${to.orderId ?: ""} sourceJobId=${to.sourceJobId ?: ""} from=${from.state} to=${to.state} reason=$reason",
        )
        Log.i(TAG, "native_print_status_persisted commandId=${to.commandId} orderId=${to.orderId ?: ""} sourceJobId=${to.sourceJobId ?: ""} state=${to.state}")

        if (to.state == NativePrintJobState.QUEUED && to.nextAttemptAtEpochMs != null && to.errorCode != null) {
            Log.i(
                TAG,
                "native_print_retry_scheduled commandId=${to.commandId} orderId=${to.orderId ?: ""} sourceJobId=${to.sourceJobId ?: ""} nextAttemptAtMs=${to.nextAttemptAtEpochMs} errorCode=${to.errorCode}",
            )
        }
    }

    companion object {
        private const val TAG = "NativePrintQueueMgr"
        private const val RETRY_BACKOFF_MS = 3000L
    }
}
