package com.alalouche.sunmibridge

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.IBinder
import android.os.RemoteException
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import woyou.aidlservice.jiuiv5.IWoyouService
import java.util.concurrent.atomic.AtomicBoolean

class SunmiPrinterManager(private val context: Context) {

    private var printerService: IWoyouService? = null
    private val isBinding = AtomicBoolean(false)

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            printerService = IWoyouService.Stub.asInterface(service)
            isBinding.set(false)
            Log.i(TAG, "Sunmi printer service connected: $name")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            printerService = null
            isBinding.set(false)
            Log.w(TAG, "Sunmi printer service disconnected: $name")
        }

        override fun onNullBinding(name: ComponentName?) {
            printerService = null
            isBinding.set(false)
            Log.e(TAG, "Sunmi printer service null binding: $name")
        }
    }

    init {
        bindPrinterServiceAsync()
    }

    fun release() {
        runCatching {
            context.unbindService(serviceConnection)
            Log.i(TAG, "Sunmi printer service unbound")
        }
        printerService = null
        isBinding.set(false)
    }

    fun getPrinterInfo(): JSONObject {
        val sdkClassDetected = isClassPresent("woyou.aidlservice.jiuiv5.IWoyouService")
        val serviceBound = ensureServiceBound(1200)
        val service = printerService

        val info = JSONObject().apply {
            put("ok", true)
            put("mode", "native_bridge")
            put("manufacturer", Build.MANUFACTURER ?: "unknown")
            put("model", Build.MODEL ?: "unknown")
            put("sdkClassDetected", sdkClassDetected)
            put("serviceBound", serviceBound && service != null)
            put("available", serviceBound && service != null)
        }

        if (service != null) {
            runCatching { service.getServiceVersion() }.onSuccess { serviceVersion: String? -> info.put("serviceVersion", serviceVersion ?: "") }
            runCatching { service.getPrinterSerialNo() }.onSuccess { serialNo: String? -> info.put("printerSerialNo", serialNo ?: "") }
            runCatching { service.getPrinterVersion() }.onSuccess { printerVersion: String? -> info.put("printerVersion", printerVersion ?: "") }
            runCatching { service.updatePrinterState() }.onSuccess { stateCode: Int -> info.put("printerStateCode", stateCode) }
        } else {
            info.put("message", "Sunmi printer service is not bound.")
        }

        Log.i(TAG, "getPrinterInfo: $info")
        return info
    }

    fun printReceipt(printJobJson: String?): JSONObject {
        if (printJobJson.isNullOrBlank()) {
            return fail("INVALID_PRINT_JOB", "printJob JSON is required.")
        }

        Log.i(TAG, "native printReceipt entry payloadLength=${printJobJson.length}")

        val printJobRoot = try {
            JSONObject(printJobJson)
        } catch (t: Throwable) {
            return fail("INVALID_PRINT_JOB_JSON", "printJob JSON is malformed.", t.message)
        }

        val printJob = printJobRoot.optJSONObject("printJob") ?: printJobRoot

        val serviceBound = ensureServiceBound(2000)
        val service = printerService
        if (!serviceBound || service == null) {
            Log.e(TAG, "printReceipt: printer service not bound")
            return fail("SUNMI_SERVICE_UNAVAILABLE", "Sunmi printer service is unavailable or not bound.")
        }

        val orderNumber = firstNonBlank(
            printJob.optString("orderNumber"),
            printJob.optString("order_number"),
            printJob.optString("orderId"),
            printJob.optString("order_id"),
        )

        val restaurant = printJob.optJSONObject("restaurant") ?: JSONObject()
        val lines = when {
            printJob.has("lines") -> printJob.optJSONArray("lines") ?: JSONArray()
            printJob.has("items") -> printJob.optJSONArray("items") ?: JSONArray()
            else -> JSONArray()
        }
        val totals = printJob.optJSONObject("totals")
        val notes = printJob.optString("notes")
        val customerName = firstNonBlank(printJob.optString("customerName"), printJob.optString("customer_name"))
        val createdAt = firstNonBlank(printJob.optString("createdAtIso"), printJob.optString("created_at_iso"), printJob.optString("createdAt"))
        val customerPhone = firstNonBlank(printJob.optString("customerPhone"), printJob.optString("customer_phone"))
        val customerAddress = firstNonBlank(printJob.optString("customerAddress"), printJob.optString("customer_address"))
        val orderTypeRaw = firstNonBlank(printJob.optString("orderType"), printJob.optString("order_type"))
        val paymentMethodRaw = firstNonBlank(printJob.optString("paymentMethod"), printJob.optString("payment_method"))
        val totalAmountFallback = when {
            printJob.has("total_amount") -> printJob.optDouble("total_amount", Double.NaN)
            printJob.has("totalAmount") -> printJob.optDouble("totalAmount", Double.NaN)
            else -> Double.NaN
        }

        val parsedNotes = parseStructuredNotes(notes)
        val orderType = formatOrderType(firstNonBlank(orderTypeRaw, parsedNotes.type))
        val paymentMethod = formatPaymentMethod(firstNonBlank(paymentMethodRaw, parsedNotes.paymentMethod))
        val finalPhone = firstNonBlank(customerPhone, parsedNotes.phone)
        val finalAddress = firstNonBlank(customerAddress, parsedNotes.address)

        if (orderNumber.isBlank() || lines.length() == 0) {
            Log.e(TAG, "native printReceipt invalid payload orderNumber='$orderNumber' lines=${lines.length()}")
            return fail("INVALID_PRINT_JOB_CONTENT", "printJob must include order number and at least one line item.")
        }

        return try {
            Log.i(TAG, "printReceipt attempt order=$orderNumber lines=${lines.length()}")

            service.enterPrinterBuffer(true)
            service.printerInit(null)
            service.setAlignment(1, null)
            service.setFontSize(30f, null)
            val restaurantName = firstNonBlank(restaurant.optString("name"), printJob.optString("restaurantName"))
            if (restaurantName.isNotBlank()) {
                service.printText("${restaurantName}\n", null)
            }
            service.setFontSize(22f, null)
            service.setAlignment(0, null)
            service.printText("Order: $orderNumber\n", null)
            if (orderType.isNotBlank()) {
                service.printText("Type: $orderType\n", null)
            }
            if (paymentMethod.isNotBlank()) {
                service.printText("Paiement: $paymentMethod\n", null)
            }
            if (customerName.isNotBlank()) {
                service.printText("Client: $customerName\n", null)
            }
            if (finalPhone.isNotBlank()) {
                service.printText("Tel: $finalPhone\n", null)
            }
            if (finalAddress.isNotBlank()) {
                service.printText("Adresse: $finalAddress\n", null)
            }
            if (createdAt.isNotBlank()) {
                service.printText("Date: $createdAt\n", null)
            }
            service.printText("------------------------------\n", null)

            for (i in 0 until lines.length()) {
                val item = lines.optJSONObject(i) ?: continue
                val quantity = item.optInt("quantity", 1)
                val name = firstNonBlank(item.optString("name"), item.optString("title"), "Article")
                val totalPrice = when {
                    item.has("totalPrice") -> item.optDouble("totalPrice", 0.0)
                    item.has("total_price") -> item.optDouble("total_price", 0.0)
                    item.has("price") -> item.optDouble("price", 0.0) * quantity
                    else -> Double.NaN
                }

                val lineText = if (!totalPrice.isNaN()) {
                    "$quantity x $name  ${"%.2f".format(totalPrice)}\n"
                } else {
                    "$quantity x $name\n"
                }
                service.printText(lineText, null)

                val modifiers = item.optJSONArray("modifiers")
                if (modifiers != null && modifiers.length() > 0) {
                    for (j in 0 until modifiers.length()) {
                        val modifier = modifiers.optString(j)
                        if (modifier.isNotBlank()) {
                            service.printText("  + $modifier\n", null)
                        }
                    }
                }

                val itemNote = firstNonBlank(item.optString("note"), item.optString("notes"))
                if (itemNote.isNotBlank()) {
                    service.printText("  note: $itemNote\n", null)
                }
            }

            service.printText("------------------------------\n", null)
            val hasTotalsObject = totals != null && totals.has("total")
            val total = when {
                hasTotalsObject -> totals!!.optDouble("total", 0.0)
                !totalAmountFallback.isNaN() -> totalAmountFallback
                else -> Double.NaN
            }
            if (!total.isNaN()) {
                val currency = if (hasTotalsObject) totals!!.optString("currency", "CHF") else "CHF"
                service.setAlignment(2, null)
                service.printText("TOTAL: ${"%.2f".format(total)} $currency\n", null)
                service.setAlignment(0, null)
            }

            if (parsedNotes.extraNote.isNotBlank()) {
                service.printText("Notes: ${parsedNotes.extraNote}\n", null)
            }

            service.lineWrap(3, null)
            service.exitPrinterBuffer(true)

            Log.i(TAG, "printReceipt success order=$orderNumber")
            JSONObject().apply {
                put("ok", true)
                put("code", "PRINT_SENT")
                put("message", "Print commands sent to Sunmi service.")
                put("orderNumber", orderNumber)
                put("lineCount", lines.length())
            }
        } catch (e: RemoteException) {
            Log.e(TAG, "printReceipt remote error", e)
            fail("SUNMI_PRINT_REMOTE_ERROR", "Remote printer service error.", e.message)
        } catch (t: Throwable) {
            Log.e(TAG, "printReceipt failed", t)
            fail("SUNMI_PRINT_FAILED", "Print attempt failed.", t.message)
        }
    }

    fun openCashDrawer(): JSONObject {
        val serviceBound = ensureServiceBound(1200)
        val service = printerService

        if (!serviceBound || service == null) {
            return fail("SUNMI_SERVICE_UNAVAILABLE", "Sunmi printer service is unavailable or not bound.")
        }

        return try {
            // Not all Sunmi models support drawer kick; attempt and return real result.
            service.openDrawer(null)
            JSONObject().apply {
                put("ok", true)
                put("code", "CASH_DRAWER_COMMAND_SENT")
                put("message", "Cash drawer command sent to Sunmi service.")
            }
        } catch (e: RemoteException) {
            fail("CASH_DRAWER_REMOTE_ERROR", "Cash drawer command failed in remote service.", e.message)
        } catch (t: Throwable) {
            fail("CASH_DRAWER_UNSUPPORTED", "Cash drawer operation unsupported or failed.", t.message)
        }
    }

    private fun bindPrinterServiceAsync() {
        if (printerService != null || isBinding.get()) return

        isBinding.set(true)

        val explicitIntent = Intent().apply {
            setPackage("woyou.aidlservice.jiuiv5")
            action = "woyou.aidlservice.jiuiv5.IWoyouService"
        }

        val implicitIntent = Intent("woyou.aidlservice.jiuiv5.IWoyouService")

        val bound = runCatching {
            context.bindService(explicitIntent, serviceConnection, Context.BIND_AUTO_CREATE)
        }.getOrDefault(false)

        val finalBound = if (!bound) {
            runCatching {
                context.bindService(implicitIntent, serviceConnection, Context.BIND_AUTO_CREATE)
            }.getOrDefault(false)
        } else true

        if (!finalBound) {
            isBinding.set(false)
            Log.e(TAG, "Unable to bind Sunmi printer service")
        } else {
            Log.i(TAG, "Binding Sunmi printer service requested")
        }
    }

    private fun ensureServiceBound(timeoutMs: Long): Boolean {
        if (printerService != null) return true

        bindPrinterServiceAsync()
        if (printerService != null) return true

        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (printerService != null) return true
            try {
                Thread.sleep(100)
            } catch (_: InterruptedException) {
                break
            }
        }

        return printerService != null
    }

    private fun fail(code: String, message: String, details: String? = null): JSONObject {
        return JSONObject().apply {
            put("ok", false)
            put("code", code)
            put("message", message)
            if (!details.isNullOrBlank()) put("details", details)
        }
    }

    private fun firstNonBlank(vararg values: String?): String {
        for (value in values) {
            if (!value.isNullOrBlank()) return value
        }
        return ""
    }

    private fun isClassPresent(className: String): Boolean {
        return try {
            Class.forName(className)
            true
        } catch (_: Throwable) {
            false
        }
    }

    private data class ParsedStructuredNotes(
        val type: String,
        val phone: String,
        val address: String,
        val paymentMethod: String,
        val extraNote: String,
    )

    private fun parseStructuredNotes(raw: String?): ParsedStructuredNotes {
        if (raw.isNullOrBlank()) {
            return ParsedStructuredNotes("", "", "", "", "")
        }

        var type = ""
        var phone = ""
        var address = ""
        var paymentMethod = ""
        val extras = mutableListOf<String>()

        raw.split("|")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .forEach { token ->
                when {
                    token.startsWith("Type:", ignoreCase = true) -> type = token.substringAfter(':').trim()
                    token.startsWith("Tel:", ignoreCase = true) -> phone = token.substringAfter(':').trim()
                    token.startsWith("Adresse:", ignoreCase = true) -> address = token.substringAfter(':').trim()
                    token.startsWith("Paiement:", ignoreCase = true) -> paymentMethod = token.substringAfter(':').trim()
                    else -> extras += token
                }
            }

        return ParsedStructuredNotes(type, phone, address, paymentMethod, extras.joinToString(" | "))
    }

    private fun formatOrderType(raw: String): String {
        return when (raw.trim().lowercase()) {
            "delivery", "livraison" -> "Livraison"
            "takeaway", "à emporter", "a emporter" -> "À emporter"
            else -> raw.trim()
        }
    }

    private fun formatPaymentMethod(raw: String): String {
        return when (raw.trim().lowercase()) {
            "cash", "especes", "espèces" -> "Espèces"
            "card", "carte" -> "Carte"
            else -> raw.trim()
        }
    }

    companion object {
        private const val TAG = "SunmiPrinterManager"
    }
}
