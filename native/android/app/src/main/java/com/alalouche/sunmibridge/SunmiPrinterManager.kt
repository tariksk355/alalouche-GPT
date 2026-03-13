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
import woyou.aidlservice.jiuiv5.ICallback
import woyou.aidlservice.jiuiv5.IWoyouService
import java.text.Normalizer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

class SunmiPrinterManager(private val context: Context) {

    private var printerService: IWoyouService? = null
    private val isBinding = AtomicBoolean(false)

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            printerService = IWoyouService.Stub.asInterface(service)
            isBinding.set(false)
            val descriptor = runCatching { service?.interfaceDescriptor }.getOrNull()
            Log.i(TAG, "Sunmi printer service connected: $name descriptor=${descriptor ?: "unknown"}")
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
        val displayModel = printJob.optJSONObject("displayModel")

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
        val itemsSource = firstNonBlank(printJob.optString("itemsSource"), "unknown")
        val customerName = firstNonBlank(printJob.optString("customerName"), printJob.optString("customer_name"))
        val createdAt = firstNonBlank(printJob.optString("createdAtIso"), printJob.optString("created_at_iso"), printJob.optString("createdAt"))
        val customerPhone = firstNonBlank(printJob.optString("customerPhone"), printJob.optString("customer_phone"))
        val customerAddress = firstNonBlank(printJob.optString("customerAddress"), printJob.optString("customer_address"))
        val customerTotalOrderCount = when {
            printJob.has("customerTotalOrderCount") -> printJob.optInt("customerTotalOrderCount", 0)
            printJob.has("customer_total_order_count") -> printJob.optInt("customer_total_order_count", 0)
            printJob.has("customerOrderCount") -> printJob.optInt("customerOrderCount", 0) + 1
            printJob.has("customer_order_count") -> printJob.optInt("customer_order_count", 0) + 1
            else -> 0
        }
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
            val renderedLines = mutableListOf<String>()
            val callbackErrors = mutableListOf<String>()
            Log.i(TAG, "runtime_path ui_click->printAcceptedOrder->toPrintJob->printerAdapter->SunmiBridge->SunmiPrinterManager.printReceipt")

            fun callbackFor(op: String): ICallback {
                return object : ICallback.Stub() {
                    override fun onRunResult(isSuccess: Boolean) {
                        Log.i(TAG, "low_level_callback op=$op onRunResult success=$isSuccess")
                    }

                    override fun onReturnString(result: String?) {
                        Log.i(TAG, "low_level_callback op=$op onReturnString result=${result ?: ""}")
                    }

                    override fun onRaiseException(code: Int, msg: String?) {
                        val err = "op=$op code=$code msg=${msg ?: ""}"
                        callbackErrors += err
                        Log.e(TAG, "low_level_callback onRaiseException $err")
                    }
                }
            }

            fun pushRenderedLine(line: String) {
                renderedLines += line
            }

            val displayModelReceiptLines = displayModel?.optJSONArray("receiptLines")
            val useDisplayModel = displayModelReceiptLines != null && displayModelReceiptLines.length() > 0
            Log.i(TAG, "display_model_usage printed_from_display_model=${printJob.optBoolean("printed_from_display_model", false)} useDisplayModel=$useDisplayModel")

            // IMPORTANT: no printerInit() and no buffer enter/exit in live receipt flow.
            // Some Sunmi V2s firmware/service paths are unstable with enterPrinterBuffer(...)
            // and can fail before any printText reaches paper.
            Log.i(
                TAG,
                "receipt_path mode=no_buffer_live_text printerInit=false bufferApi=false fontSizeStyling=skipped_v2s_compat sequence=setAlignment/printTextSingleBlock",
            )

            Log.i(TAG, "low_level_call setAlignment alignment=1")
            service.setAlignment(1, callbackFor("setAlignment"))
            Log.i(TAG, "receipt_style fontSize skipped reason=v2s_illegal_parameter")
            if (useDisplayModel) {
                for (i in 0 until displayModelReceiptLines!!.length()) {
                    val line = displayModelReceiptLines.optString(i)
                    if (line.isNotBlank()) pushRenderedLine(line)
                }
            } else {
                val restaurantName = firstNonBlank(restaurant.optString("name"), printJob.optString("restaurantName"))
                if (restaurantName.isNotBlank()) {
                    pushRenderedLine(restaurantName)
                }
                Log.i(TAG, "low_level_call setAlignment alignment=0")
                service.setAlignment(0, callbackFor("setAlignment"))
                pushRenderedLine("Order: $orderNumber")
                if (orderType.isNotBlank()) {
                    pushRenderedLine("Type: $orderType")
                }
                if (paymentMethod.isNotBlank()) {
                    pushRenderedLine("Paiement: $paymentMethod")
                }
                if (customerName.isNotBlank()) {
                    pushRenderedLine("Client: $customerName")
                }
                if (finalPhone.isNotBlank()) {
                    pushRenderedLine("Tel: $finalPhone")
                }
                if (finalAddress.isNotBlank()) {
                    pushRenderedLine("Adresse: $finalAddress")
                }
                val formattedCreatedAt = formatTicketDateTime(createdAt)
                if (formattedCreatedAt.isNotBlank()) {
                    pushRenderedLine("Date/Heure: $formattedCreatedAt")
                }
                if (customerTotalOrderCount > 0) {
                    pushRenderedLine("Historique client: $customerTotalOrderCount commande(s)")
                }
                pushRenderedLine("------------------------------")

                for (i in 0 until lines.length()) {
                    val item = lines.optJSONObject(i) ?: continue
                    val quantity = item.optInt("quantity", 1)
                    val name = firstNonBlank(item.optString("name"), item.optString("title"), "Article")
                    val totalPrice = when {
                        item.has("totalPrice") -> item.optDouble("totalPrice", 0.0)
                        item.has("total_price") -> item.optDouble("total_price", 0.0)
                        item.has("lineTotal") -> item.optDouble("lineTotal", 0.0)
                        item.has("line_total") -> item.optDouble("line_total", 0.0)
                        item.has("price") -> item.optDouble("price", 0.0) * quantity
                        item.has("unitPrice") -> item.optDouble("unitPrice", 0.0) * quantity
                        item.has("unit_price") -> item.optDouble("unit_price", 0.0) * quantity
                        else -> Double.NaN
                    }

                    val lineText = if (!totalPrice.isNaN()) {
                        "$quantity x $name  ${"%.2f".format(totalPrice)}"
                    } else {
                        "$quantity x $name"
                    }
                    pushRenderedLine(lineText)

                    val modifiers = item.optJSONArray("modifiers")
                    if (modifiers != null && modifiers.length() > 0) {
                        for (j in 0 until modifiers.length()) {
                            val modifier = modifiers.optString(j)
                            if (modifier.isNotBlank()) {
                                pushRenderedLine("  + $modifier")
                            }
                        }
                    }

                    val itemNote = firstNonBlank(item.optString("note"), item.optString("notes"))
                    if (itemNote.isNotBlank()) {
                        pushRenderedLine("  note: $itemNote")
                    }
                }

                pushRenderedLine("------------------------------")
                val hasTotalsObject = totals != null && totals.has("total")
                val total = when {
                    hasTotalsObject -> totals!!.optDouble("total", 0.0)
                    !totalAmountFallback.isNaN() -> totalAmountFallback
                    else -> Double.NaN
                }
                if (!total.isNaN()) {
                    val currency = if (hasTotalsObject) totals!!.optString("currency", "CHF") else "CHF"
                    Log.i(TAG, "low_level_call setAlignment alignment=2")
                    service.setAlignment(2, callbackFor("setAlignment"))
                    pushRenderedLine("TOTAL: ${"%.2f".format(total)} $currency")
                    Log.i(TAG, "low_level_call setAlignment alignment=0")
                    service.setAlignment(0, callbackFor("setAlignment"))
                }

                if (parsedNotes.extraNote.isNotBlank()) {
                    pushRenderedLine("Notes: ${parsedNotes.extraNote}")
                }
            }

            val renderedReceiptText = renderedLines.joinToString("\n")
            Log.i(TAG, "rendered_receipt_text_start\n$renderedReceiptText\nrendered_receipt_text_end")
            val itemsWithName = (0 until lines.length()).count { idx ->
                val item = lines.optJSONObject(idx)
                item != null && firstNonBlank(item.optString("name"), item.optString("title")).isNotBlank()
            }
            val itemsWithPrice = (0 until lines.length()).count { idx ->
                val item = lines.optJSONObject(idx)
                item != null && (
                    item.has("totalPrice") || item.has("total_price") || item.has("lineTotal") || item.has("line_total") ||
                        item.has("price") || item.has("unitPrice") || item.has("unit_price")
                    )
            }
            Log.i(
                TAG,
                "receipt_payload_integrity itemsCount=${lines.length()} itemsWithName=$itemsWithName itemsWithPrice=$itemsWithPrice itemsSource=$itemsSource derivedFromUiOrderData=true",
            )

            val asciiReceiptText = toAsciiSafeReceiptText(renderedReceiptText)
            val asciiNormalized = asciiReceiptText != renderedReceiptText
            val topMarginLines = 2
            val bottomMarginLines = 8
            val finalReceiptBlock = "\n".repeat(topMarginLines) + asciiReceiptText.trimEnd('\r', '\n') + "\n".repeat(bottomMarginLines)
            Log.i(
                TAG,
                "receipt_path single_block_plain_text enabled=true asciiNormalized=$asciiNormalized topMarginLines=$topMarginLines bottomMarginLines=$bottomMarginLines blockLength=${finalReceiptBlock.length}",
            )
            val blockPreview = finalReceiptBlock
                .replace("\r", "\\r")
                .replace("\n", "\\n")
                .take(220)
            fun runAndAwait(op: String, timeoutMs: Long = 3000, action: (ICallback) -> Unit) {
                val lock = Object()
                var done = false
                val cb = object : ICallback.Stub() {
                    override fun onRunResult(isSuccess: Boolean) {
                        Log.i(TAG, "low_level_callback op=$op onRunResult success=$isSuccess")
                        synchronized(lock) {
                            done = true
                            lock.notifyAll()
                        }
                    }

                    override fun onReturnString(result: String?) {
                        Log.i(TAG, "low_level_callback op=$op onReturnString result=${result ?: ""}")
                    }

                    override fun onRaiseException(code: Int, msg: String?) {
                        val err = "op=$op code=$code msg=${msg ?: ""}"
                        callbackErrors += err
                        Log.e(TAG, "low_level_callback onRaiseException $err")
                        synchronized(lock) {
                            done = true
                            lock.notifyAll()
                        }
                    }
                }

                action(cb)

                val deadline = System.currentTimeMillis() + timeoutMs
                synchronized(lock) {
                    while (!done && System.currentTimeMillis() < deadline) {
                        lock.wait(150)
                    }
                }
                Log.i(TAG, "low_level_callback op=$op completion_wait_done=$done timeoutMs=$timeoutMs")
            }

            Log.i(TAG, "low_level_call printText single_block_preview='${blockPreview}'")
            runAndAwait("printTextSingleBlock") { callback ->
                service.printText(finalReceiptBlock, callback)
            }

            val explicitPostFeedTextLines = 20
            val postFeedText = "\n".repeat(explicitPostFeedTextLines)
            Log.i(TAG, "low_level_call printText post_feed_primitive=printText newline_count=$explicitPostFeedTextLines")
            runAndAwait("printTextPostFeed") { callback ->
                service.printText(postFeedText, callback)
            }

            val lineWrapPostFeedLines = 6
            Log.i(TAG, "low_level_call lineWrap post_feed_primitive=lineWrap line_count=$lineWrapPostFeedLines")
            runAndAwait("lineWrapPostPrint") { callback ->
                service.lineWrap(lineWrapPostFeedLines, callback)
            }
            Log.i(
                TAG,
                "receipt_path mode=no_buffer_live_text completed_calls=setAlignment,printTextSingleBlock,printTextPostFeed,lineWrapPostPrint fontSizeStyling=skipped_v2s_compat",
            )

            if (callbackErrors.isNotEmpty()) {
                return fail(
                    "SUNMI_PRINT_CALLBACK_ERROR",
                    "Printer service returned callback errors.",
                    callbackErrors.joinToString(" | "),
                )
            }

            Log.i(TAG, "printReceipt success order=$orderNumber")
            JSONObject().apply {
                put("ok", true)
                put("code", "PRINT_SENT")
                put("message", "Print commands sent to Sunmi service.")
                put("orderNumber", orderNumber)
                put("lineCount", lines.length())
                put("renderedLineCount", renderedLines.size)
                put("renderedReceiptText", renderedReceiptText)
                put("callbackErrors", JSONArray(callbackErrors))
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

        val candidates = listOf(
            // Sunmi V2s / newer integrations often expose InnerPrinterService via this package/action.
            Intent().apply {
                setPackage("com.sunmi.peripheral.printer")
                action = "com.sunmi.peripheral.printer.InnerPrinterService"
            },
            Intent("com.sunmi.peripheral.printer.InnerPrinterService"),
            // Legacy woyou service fallback.
            Intent().apply {
                setPackage("woyou.aidlservice.jiuiv5")
                action = "woyou.aidlservice.jiuiv5.IWoyouService"
            },
            Intent("woyou.aidlservice.jiuiv5.IWoyouService"),
        )

        var finalBound = false
        for (intent in candidates) {
            val ok = runCatching {
                context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            }.getOrDefault(false)

            Log.i(TAG, "printer_bind_attempt action=${intent.action ?: ""} package=${intent.`package` ?: ""} bound=$ok")
            if (ok) {
                finalBound = true
                break
            }
        }

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

    private fun toAsciiSafeReceiptText(input: String): String {
        val normalized = Normalizer.normalize(input, Normalizer.Form.NFD)
        val withoutDiacritics = normalized.replace("\\p{M}+".toRegex(), "")
        return withoutDiacritics
            .replace('’', '\'')
            .replace('–', '-')
            .replace('—', '-')
            .replace('…', '.')
            .map { ch -> if (ch.code in 32..126 || ch == '\n' || ch == '\r' || ch == '\t') ch else '?' }
            .joinToString("")
    }

    private fun formatTicketDateTime(raw: String): String {
        if (raw.isBlank()) return ""

        runCatching {
            val parsed = java.time.Instant.parse(raw)
            val zoned = java.time.ZonedDateTime.ofInstant(parsed, java.time.ZoneId.systemDefault())
            return zoned.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
        }

        runCatching {
            val isoLike = raw.replace(' ', 'T')
            val parsed = java.time.LocalDateTime.parse(isoLike.take(19))
            return parsed.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
        }

        runCatching {
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            val parsed = parser.parse(raw)
            if (parsed is Date) {
                val fmt = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
                return fmt.format(parsed)
            }
        }

        return raw
    }

    companion object {
        private const val TAG = "SunmiPrinterManager"
    }
}
