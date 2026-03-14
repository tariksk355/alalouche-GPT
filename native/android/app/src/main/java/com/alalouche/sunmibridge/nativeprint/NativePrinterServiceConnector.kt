package com.alalouche.sunmibridge.nativeprint

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.IBinder
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import woyou.aidlservice.jiuiv5.IWoyouService

data class NativeServiceFamilyCandidate(
    val familyName: String,
    val packageName: String?,
    val action: String,
)

class NativeServiceConnectionResult(
    val service: IWoyouService?,
    val selectedFamily: NativeServiceFamilyCandidate?,
    val failureCode: String?,
    val failureReason: String?,
    private val closeAction: (() -> Unit)? = null,
) {
    fun close() {
        closeAction?.invoke()
    }
}

class NativePrinterServiceConnector(
    private val context: Context,
) {

    fun connect(commandId: String, orderId: String?, sourceJobId: String?): NativeServiceConnectionResult {
        val candidates = serviceCandidates()
        val pm = context.packageManager
        Log.i(TAG, "native_print_service_probe_start commandId=$commandId orderId=${orderId ?: ""} sourceJobId=${sourceJobId ?: ""} candidateCount=${candidates.size}")

        var resolvedAny = false
        var bindAttemptedAny = false
        var bindSucceededAny = false
        var binderNullAny = false
        var interfaceReadyAny = false
        var lastFailureReason: String? = null

        for (candidate in candidates) {
            val packageInstalled = isPackageInstalled(pm, candidate.packageName)
            val intent = Intent(candidate.action).apply {
                if (!candidate.packageName.isNullOrBlank()) setPackage(candidate.packageName)
            }
            val resolved = resolveService(pm, intent)
            Log.i(
                TAG,
                "native_print_service_probe_result commandId=$commandId orderId=${orderId ?: ""} sourceJobId=${sourceJobId ?: ""} family=${candidate.familyName} packageName=${candidate.packageName ?: ""} action=${candidate.action} packageInstalled=$packageInstalled resolved=$resolved bindAttempted=false bindSucceeded=false binderNull=false interfaceReady=false failureReason=",
            )

            if (!resolved) continue
            resolvedAny = true

            val attempt = bindAndAdapt(intent, candidate)
            bindAttemptedAny = true
            bindSucceededAny = bindSucceededAny || attempt.bindSucceeded
            binderNullAny = binderNullAny || attempt.binderNull
            interfaceReadyAny = interfaceReadyAny || attempt.interfaceReady
            if (!attempt.interfaceReady && !attempt.failureReason.isNullOrBlank()) {
                lastFailureReason = attempt.failureReason
            }
            Log.i(
                TAG,
                "native_print_service_bind_result commandId=$commandId orderId=${orderId ?: ""} sourceJobId=${sourceJobId ?: ""} family=${candidate.familyName} packageName=${candidate.packageName ?: ""} action=${candidate.action} resolved=true bindAttempted=true bindSucceeded=${attempt.bindSucceeded} binderNull=${attempt.binderNull} interfaceReady=${attempt.interfaceReady} failureReason=${attempt.failureReason ?: ""}",
            )
            Log.i(
                TAG,
                "native_print_service_interface_result commandId=$commandId orderId=${orderId ?: ""} sourceJobId=${sourceJobId ?: ""} family=${candidate.familyName} packageName=${candidate.packageName ?: ""} action=${candidate.action} interfaceReady=${attempt.interfaceReady} failureReason=${attempt.failureReason ?: ""}",
            )

            if (attempt.interfaceReady && attempt.service != null) {
                Log.i(
                    TAG,
                    "native_print_service_selected_family commandId=$commandId orderId=${orderId ?: ""} sourceJobId=${sourceJobId ?: ""} family=${candidate.familyName} packageName=${candidate.packageName ?: ""} action=${candidate.action} resolved=true bindAttempted=true bindSucceeded=true binderNull=false interfaceReady=true",
                )
                return NativeServiceConnectionResult(
                    service = attempt.service,
                    selectedFamily = candidate,
                    failureCode = null,
                    failureReason = null,
                    closeAction = attempt.closeAction,
                )
            }
            attempt.closeAction?.invoke()
        }

        val failureCode = when {
            !resolvedAny -> "NATIVE_PRINT_SERVICE_FAMILY_NOT_FOUND"
            binderNullAny -> "NATIVE_PRINT_SERVICE_BINDER_NULL"
            bindAttemptedAny && !bindSucceededAny -> "NATIVE_PRINT_SERVICE_BIND_FAILED"
            !interfaceReadyAny -> "NATIVE_PRINT_SERVICE_INTERFACE_UNAVAILABLE"
            else -> "NATIVE_PRINT_SERVICE_DISPATCH_NOT_ATTEMPTED"
        }
        val reason = when (failureCode) {
            "NATIVE_PRINT_SERVICE_FAMILY_NOT_FOUND" -> "No supported Sunmi printer service family was discovered."
            "NATIVE_PRINT_SERVICE_BINDER_NULL" -> "Binder connection returned null for discovered family."
            "NATIVE_PRINT_SERVICE_BIND_FAILED" -> "All discovered families failed bindService."
            "NATIVE_PRINT_SERVICE_INTERFACE_UNAVAILABLE" -> "AIDL interface adaptation failed for discovered families."
            else -> (lastFailureReason ?: "dispatch_not_attempted")
        }
        Log.e(TAG, "native_print_service_no_supported_family commandId=$commandId orderId=${orderId ?: ""} sourceJobId=${sourceJobId ?: ""} resolvedAny=$resolvedAny bindAttemptedAny=$bindAttemptedAny bindSucceededAny=$bindSucceededAny binderNullAny=$binderNullAny interfaceReadyAny=$interfaceReadyAny failureCode=$failureCode failureReason=$reason")
        return NativeServiceConnectionResult(
            service = null,
            selectedFamily = null,
            failureCode = failureCode,
            failureReason = reason,
        )
    }

    private data class BindAttemptResult(
        val service: IWoyouService?,
        val bindSucceeded: Boolean,
        val binderNull: Boolean,
        val interfaceReady: Boolean,
        val failureReason: String?,
        val closeAction: (() -> Unit)?,
    )

    private fun bindAndAdapt(intent: Intent, candidate: NativeServiceFamilyCandidate): BindAttemptResult {
        val latch = CountDownLatch(1)
        var bindSucceeded = false
        var binderNull = false
        var serviceRef: IWoyouService? = null
        var failureReason: String? = null

        val conn = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                binderNull = service == null
                serviceRef = if (service == null) null else IWoyouService.Stub.asInterface(service)
                if (serviceRef == null && !binderNull) {
                    failureReason = "interface_adaptation_failed"
                }
                latch.countDown()
            }

            override fun onServiceDisconnected(name: ComponentName?) {
                serviceRef = null
            }

            override fun onNullBinding(name: ComponentName?) {
                binderNull = true
                failureReason = "onNullBinding"
                latch.countDown()
            }
        }

        return try {
            Log.i(TAG, "native_print_service_bind_attempt family=${candidate.familyName} packageName=${candidate.packageName ?: ""} action=${candidate.action} bindAttempted=true")
            bindSucceeded = context.bindService(intent, conn, Context.BIND_AUTO_CREATE)
            if (!bindSucceeded) {
                failureReason = "bindService_returned_false"
                return BindAttemptResult(
                    service = null,
                    bindSucceeded = false,
                    binderNull = false,
                    interfaceReady = false,
                    failureReason = failureReason,
                    closeAction = null,
                )
            }
            latch.await(BIND_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            val interfaceReady = serviceRef != null
            if (!interfaceReady && failureReason.isNullOrBlank()) {
                failureReason = if (binderNull) "binder_null" else "interface_unavailable_or_timeout"
            }
            BindAttemptResult(
                service = serviceRef,
                bindSucceeded = true,
                binderNull = binderNull,
                interfaceReady = interfaceReady,
                failureReason = failureReason,
                closeAction = {
                    runCatching { context.unbindService(conn) }
                },
            )
        } catch (t: Throwable) {
            BindAttemptResult(
                service = null,
                bindSucceeded = false,
                binderNull = false,
                interfaceReady = false,
                failureReason = t.message ?: "bind_exception",
                closeAction = if (bindSucceeded) {
                    { runCatching { context.unbindService(conn) } }
                } else {
                    null
                },
            )
        }
    }

    private fun resolveService(pm: PackageManager, intent: Intent): Boolean {
        return runCatching { pm.resolveService(intent, 0) != null }.getOrDefault(false)
    }

    private fun isPackageInstalled(pm: PackageManager, packageName: String?): Boolean {
        if (packageName.isNullOrBlank()) return true
        return runCatching {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(packageName, 0)
            true
        }.getOrDefault(false)
    }

    private fun serviceCandidates(): List<NativeServiceFamilyCandidate> {
        return listOf(
            NativeServiceFamilyCandidate(
                familyName = "sunmi_peripheral_packaged",
                packageName = "com.sunmi.peripheral.printer",
                action = "com.sunmi.peripheral.printer.InnerPrinterService",
            ),
            NativeServiceFamilyCandidate(
                familyName = "sunmi_peripheral_unscoped",
                packageName = null,
                action = "com.sunmi.peripheral.printer.InnerPrinterService",
            ),
            NativeServiceFamilyCandidate(
                familyName = "woyou_legacy_packaged",
                packageName = "woyou.aidlservice.jiuiv5",
                action = "woyou.aidlservice.jiuiv5.IWoyouService",
            ),
            NativeServiceFamilyCandidate(
                familyName = "woyou_legacy_unscoped",
                packageName = null,
                action = "woyou.aidlservice.jiuiv5.IWoyouService",
            ),
        )
    }

    companion object {
        private const val TAG = "NativePrintSvcProbe"
        private const val BIND_TIMEOUT_MS = 1500L
    }
}
