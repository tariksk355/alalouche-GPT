package com.alalouche.sunmibridge

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

class SunmiPrinterManager(private val context: Context) {

    /**
     * Realistic PoC limitation:
     * - We detect whether known Sunmi printer SDK classes appear on the device classpath.
     * - We do NOT fake print success.
     * - Receipt printing method returns explicit NOT_IMPLEMENTED until SDK binding is wired.
     */

    fun getPrinterInfo(): JSONObject {
        val sdkDetected = isClassPresent("com.sunmi.peripheral.printer.InnerPrinterManager") ||
            isClassPresent("woyou.aidlservice.jiuiv5.IWoyouService")

        return JSONObject().apply {
            put("ok", true)
            put("mode", "native_bridge")
            put("available", sdkDetected)
            put("sdkDetected", sdkDetected)
            put("message", if (sdkDetected) {
                "Sunmi printer SDK class detected. Binder integration is pending in this PoC."
            } else {
                "Sunmi printer SDK class not detected in wrapper classpath."
            })
        }
    }

    fun printReceipt(printJobJson: String?): JSONObject {
        if (printJobJson.isNullOrBlank()) {
            return JSONObject().apply {
                put("ok", false)
                put("code", "INVALID_PRINT_JOB")
                put("message", "printJob JSON is required.")
            }
        }

        val printJob = try {
            JSONObject(printJobJson)
        } catch (t: Throwable) {
            return JSONObject().apply {
                put("ok", false)
                put("code", "INVALID_PRINT_JOB_JSON")
                put("message", "printJob JSON is malformed.")
                put("details", t.message ?: "unknown")
            }
        }

        val lines = printJob.optJSONArray("lines") ?: JSONArray()
        val orderNumber = printJob.optString("orderNumber", printJob.optString("orderId", "-"))

        Log.i(TAG, "PoC printReceipt called for order=$orderNumber lines=${lines.length()}")

        // TODO(native): bind Sunmi printer service and map PrintJob -> Sunmi SDK calls.
        // For now, return explicit not-implemented result (never fake success).
        return JSONObject().apply {
            put("ok", false)
            put("code", "SUNMI_PRINT_NOT_IMPLEMENTED")
            put("message", "Native bridge reached, but Sunmi SDK print binding is not yet implemented in this PoC.")
            put("orderNumber", orderNumber)
            put("lineCount", lines.length())
        }
    }

    fun openCashDrawer(): JSONObject {
        // TODO(native): implement only if target Sunmi model + SDK capability confirms support.
        return JSONObject().apply {
            put("ok", false)
            put("code", "CASH_DRAWER_NOT_IMPLEMENTED")
            put("message", "Cash drawer operation is not implemented in this PoC.")
        }
    }

    private fun isClassPresent(className: String): Boolean {
        return try {
            Class.forName(className)
            true
        } catch (_: Throwable) {
            false
        }
    }

    companion object {
        private const val TAG = "SunmiPrinterManager"
    }
}
