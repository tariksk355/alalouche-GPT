package com.alalouche.sunmibridge

import android.content.Context
import android.os.Build
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONObject

class SunmiJsBridge(context: Context) {
    private val printerManager = SunmiPrinterManager(context)

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
        return safeResponse("printReceipt") {
            printerManager.printReceipt(printJobJson)
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
