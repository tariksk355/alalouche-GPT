package com.alalouche.sunmibridge.nativeprint

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.os.RemoteException
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import woyou.aidlservice.jiuiv5.ICallback
import woyou.aidlservice.jiuiv5.IWoyouService

interface NativePrinterWorker {
    fun dispatch(job: NativePrintJobEntity): NativeDispatchReport
}

class SunmiNativePrinterWorker(
    private val context: Context,
) : NativePrinterWorker {

    override fun dispatch(job: NativePrintJobEntity): NativeDispatchReport {
        val service = bindServiceWithTimeout(BIND_TIMEOUT_MS)
            ?: return NativeDispatchReport(
                acceptedByNative = false,
                dispatchStarted = false,
                dispatchCompleted = false,
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = true,
                errorCode = "NATIVE_PRINT_SERVICE_UNAVAILABLE",
                errorMessage = "Unable to bind Sunmi printer service.",
            )

        val callbackErrors = mutableListOf<String>()
        val callback = object : ICallback.Stub() {
            override fun onRunResult(isSuccess: Boolean) {
                if (!isSuccess) callbackErrors += "onRunResult:false"
            }

            override fun onReturnString(result: String?) = Unit

            override fun onRaiseException(code: Int, msg: String?) {
                callbackErrors += "onRaiseException:$code:${msg ?: "unknown"}"
            }
        }

        return try {
            Log.i(TAG, "native_print_dispatch_start commandId=${job.commandId} orderId=${job.orderId ?: ""} sourceJobId=${job.sourceJobId ?: ""}")
            val marker = buildDispatchMarker(job)
            service.setAlignment(0, callback)
            service.printText(marker, callback)
            val feed = byteArrayOf(0x1B, 0x64, 3)
            service.sendRAWData(feed, callback)

            val error = callbackErrors.firstOrNull()
            if (error != null) {
                NativeDispatchReport(
                    acceptedByNative = false,
                    dispatchStarted = true,
                    dispatchCompleted = true,
                    physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                    retryable = true,
                    errorCode = "NATIVE_PRINT_CALLBACK_ERROR",
                    errorMessage = error,
                )
            } else {
                NativeDispatchReport(
                    acceptedByNative = true,
                    dispatchStarted = true,
                    dispatchCompleted = true,
                    physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                    retryable = false,
                    errorCode = null,
                    errorMessage = null,
                )
            }
        } catch (e: RemoteException) {
            NativeDispatchReport(
                acceptedByNative = false,
                dispatchStarted = true,
                dispatchCompleted = false,
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = true,
                errorCode = "NATIVE_PRINT_REMOTE_ERROR",
                errorMessage = e.message ?: "remote_exception",
            )
        } catch (t: Throwable) {
            NativeDispatchReport(
                acceptedByNative = false,
                dispatchStarted = true,
                dispatchCompleted = false,
                physicalOutcome = PhysicalPrintOutcome.UNKNOWN,
                retryable = false,
                errorCode = "NATIVE_PRINT_DISPATCH_EXCEPTION",
                errorMessage = t.message ?: "dispatch_exception",
            )
        }
    }

    private fun buildDispatchMarker(job: NativePrintJobEntity): String {
        val order = job.orderId ?: "unknown"
        return "NATIVE COMMAND DISPATCH\nCMD:${job.commandId}\nORDER:$order\n"
    }

    private fun bindServiceWithTimeout(timeoutMs: Long): IWoyouService? {
        val latch = CountDownLatch(1)
        var bound = false
        var serviceRef: IWoyouService? = null

        val conn = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                serviceRef = IWoyouService.Stub.asInterface(service)
                latch.countDown()
            }

            override fun onServiceDisconnected(name: ComponentName?) {
                serviceRef = null
            }
        }

        val candidates = listOf(
            Intent().apply {
                setPackage("com.sunmi.peripheral.printer")
                action = "com.sunmi.peripheral.printer.InnerPrinterService"
            },
            Intent("com.sunmi.peripheral.printer.InnerPrinterService"),
            Intent().apply {
                setPackage("woyou.aidlservice.jiuiv5")
                action = "woyou.aidlservice.jiuiv5.IWoyouService"
            },
            Intent("woyou.aidlservice.jiuiv5.IWoyouService"),
        )

        try {
            for (intent in candidates) {
                bound = runCatching { context.bindService(intent, conn, Context.BIND_AUTO_CREATE) }.getOrDefault(false)
                if (bound) break
            }
            if (!bound) return null
            latch.await(timeoutMs, TimeUnit.MILLISECONDS)
            return serviceRef
        } catch (t: Throwable) {
            Log.w(TAG, "native_print_dispatch_error bind_failed=${t.message ?: "unknown"}")
            return null
        } finally {
            // Keep process-level binding lifecycle simple in scaffold phase.
            // Dedicated service lifecycle manager will own bind/unbind policy in next step.
        }
    }

    companion object {
        private const val TAG = "NativePrinterWorker"
        private const val BIND_TIMEOUT_MS = 1500L
    }
}
