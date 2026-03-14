package com.alalouche.sunmibridge

import android.content.Context
import android.os.Build
import android.util.Log
import android.webkit.JavascriptInterface
import com.alalouche.sunmibridge.nativeprint.NativePrintServiceManager
import org.json.JSONObject

class SunmiJsBridge(context: Context) {
    private val printerManager = SunmiPrinterManager(context)
    private val nativePrintServiceManager = NativePrintServiceManager(context)

    @JavascriptInterface
    fun isAvailable(requestJson: String?): String {
        return safeResponse("isAvailable") {
            JSONObject().apply {
                put("ok", true)
                put("available", true) // bridge itself is available
                put("mode", "native_bridge")
                put("androidVersion", Build.VERSION.RELEASE ?: "unknown")
            }
        }
    }

    @JavascriptInterface
    fun getPrinterInfo(requestJson: String?): String {
        return safeResponse("getPrinterInfo") {
            printerManager.getPrinterInfo()
        }
    }

    @JavascriptInterface
    fun printReceipt(printJobJson: String?): String {
        Log.i(TAG, "JS bridge printReceipt invoked payloadLength=${printJobJson?.length ?: 0}")
        return safeResponse("printReceipt") {
            if (NativePrintFeatureFlags.USE_NATIVE_PRINT_SERVICE) {
                nativePrintServiceManager.submitPrintCommand(printJobJson)
            } else {
                printerManager.printReceipt(printJobJson)
            }
        }
    }

    // Compatibility aliases for older/variant web clients that may call
    // printOrder(...) or print(...). Route all production print calls through
    // the same printReceipt pipeline to avoid default/demo native print paths.
    @JavascriptInterface
    fun printOrder(printJobJson: String?): String {
        Log.i(TAG, "JS bridge printOrder alias invoked payloadLength=${printJobJson?.length ?: 0}")
        return printReceipt(printJobJson)
    }

    @JavascriptInterface
    fun print(printJobJson: String?): String {
        Log.i(TAG, "JS bridge print alias invoked payloadLength=${printJobJson?.length ?: 0}")
        return printReceipt(printJobJson)
    }


    @JavascriptInterface
    fun getPrintStatus(requestJson: String?): String {
        return safeResponse("getPrintStatus") {
            val parsed = runCatching { JSONObject(requestJson ?: "") }.getOrNull()
            val jobId = when {
                !parsed?.optString("jobId").isNullOrBlank() -> parsed?.optString("jobId") ?: ""
                !requestJson.isNullOrBlank() && requestJson.trim().startsWith("{") -> ""
                else -> requestJson?.trim() ?: ""
            }
            if (NativePrintFeatureFlags.USE_NATIVE_PRINT_SERVICE) {
                nativePrintServiceManager.getPrintCommandStatus(jobId)
            } else {
                printerManager.getPrintStatus(jobId)
            }
        }
    }


    @JavascriptInterface
    fun retryPrint(requestJson: String?): String {
        return safeResponse("retryPrint") {
            val parsed = runCatching { JSONObject(requestJson ?: "") }.getOrNull()
            val jobId = when {
                !parsed?.optString("jobId").isNullOrBlank() -> parsed?.optString("jobId") ?: ""
                !requestJson.isNullOrBlank() && requestJson.trim().startsWith("{") -> ""
                else -> requestJson?.trim() ?: ""
            }
            if (NativePrintFeatureFlags.USE_NATIVE_PRINT_SERVICE) {
                nativePrintServiceManager.retryPrintCommand(jobId)
            } else {
                printerManager.retryPrint(jobId)
            }
        }
    }


    @JavascriptInterface
    fun submitPrintCommand(printJobJson: String?): String {
        Log.i(TAG, "JS bridge submitPrintCommand invoked payloadLength=${printJobJson?.length ?: 0}")
        return safeResponse("submitPrintCommand") {
            nativePrintServiceManager.submitPrintCommand(printJobJson)
        }
    }

    @JavascriptInterface
    fun getPrintCommandStatus(requestJson: String?): String {
        return safeResponse("getPrintCommandStatus") {
            val parsed = runCatching { JSONObject(requestJson ?: "") }.getOrNull()
            val commandId = when {
                !parsed?.optString("commandId").isNullOrBlank() -> parsed?.optString("commandId") ?: ""
                !requestJson.isNullOrBlank() && requestJson.trim().startsWith("{") -> ""
                else -> requestJson?.trim() ?: ""
            }
            nativePrintServiceManager.getPrintCommandStatus(commandId)
        }
    }

    @JavascriptInterface
    fun retryPrintCommand(requestJson: String?): String {
        return safeResponse("retryPrintCommand") {
            val parsed = runCatching { JSONObject(requestJson ?: "") }.getOrNull()
            val commandId = when {
                !parsed?.optString("commandId").isNullOrBlank() -> parsed?.optString("commandId") ?: ""
                !requestJson.isNullOrBlank() && requestJson.trim().startsWith("{") -> ""
                else -> requestJson?.trim() ?: ""
            }
            nativePrintServiceManager.retryPrintCommand(commandId)
        }
    }

    @JavascriptInterface
    fun openCashDrawer(requestJson: String?): String {
        return safeResponse("openCashDrawer") {
            printerManager.openCashDrawer()
        }
    }

    fun release() {
        printerManager.release()
        nativePrintServiceManager.release()
    }

    private fun safeResponse(operation: String, block: () -> JSONObject): String {
        return try {
            block().toString()
        } catch (t: Throwable) {
            Log.e(TAG, "Bridge operation failed: $operation", t)
            JSONObject().apply {
                put("ok", false)
                put("code", "BRIDGE_EXCEPTION")
                put("message", "Bridge operation failed: $operation")
                put("details", t.message ?: "unknown")
            }.toString()
        }
    }

    companion object {
        private const val TAG = "SunmiJsBridge"
    }
}
