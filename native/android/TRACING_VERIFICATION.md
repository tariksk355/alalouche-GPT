# Native print tracing verification (device-side)

## Verify installed APK

Use these commands in order to prove whether the app running on device contains the tracing patch:

```bash
# 1) Identify the APK path for the installed package
adb shell pm path com.alalouche.sunmibridge

# 2) Pull the exact APK currently installed on the device
adb pull "$(adb shell pm path com.alalouche.sunmibridge | sed 's/package://g' | tr -d '\r')" ./installed-base.apk

# 3) Confirm the tracing tag literals exist inside classes.dex
#    (string constants are sufficient proof that this build contains the trace instrumentation)
unzip -p ./installed-base.apk classes.dex | strings | rg 'native_print_bridge_payload_trace|native_print_service_payload_raw|native_print_service_payload_normalized|native_print_queue_dispatch_payload_trace|native_print_strategy_parse|native_print_strategy_selected'
```

Optional (if multiple splits are installed):

```bash
# List split APK files
adb shell pm path com.alalouche.sunmibridge

# Pull all split APKs and scan each for trace tags
for p in $(adb shell pm path com.alalouche.sunmibridge | sed 's/package://g' | tr -d '\r'); do
  base=$(basename "$p")
  adb pull "$p" "./$base"
  unzip -p "./$base" classes.dex 2>/dev/null | strings | rg 'native_print_bridge_payload_trace|native_print_service_payload_raw|native_print_service_payload_normalized|native_print_queue_dispatch_payload_trace|native_print_strategy_parse|native_print_strategy_selected' && echo "FOUND in $base"
done
```

## Capture logs

```bash
adb logcat -v threadtime | rg --line-buffered 'native_print_bridge_payload_trace|native_print_service_payload_raw|native_print_service_payload_normalized|native_print_queue_dispatch_payload_trace|native_print_strategy_parse|native_print_strategy_selected'
```

(If you want a clean capture window first: `adb logcat -c`.)

## Trigger payload

Use this minimal JS trigger (from WebView console or bridge test harness):

```js
window.SunmiBridge.submitPrintCommand(JSON.stringify({
  orderId: `trace-${Date.now()}`,
  printerType: "RECEIVER",
  forceOutputStrategy: "direct_self_check_then_minimal_text",
  lines: ["trace check"]
}))
```

## Interpretation

### Case A: tracing patch is **not** present in installed APK

You can conclude this when **both** are true:

1. APK string scan returns no matches for the six trace tags.
2. Runtime filtered logcat shows none of those tags while a print command is actively triggered.

Meaning: the running build likely predates the trace patch (or wrong app/package/build variant is installed).

### Case B: tracing patch is present, but strategy is lost in handoff

You can conclude this when:

1. APK scan finds trace-tag literals (patch present).
2. `native_print_bridge_payload_trace` log includes `forceOutputStrategy=direct_self_check_then_minimal_text`.
3. Downstream logs (`native_print_service_payload_raw` / `native_print_service_payload_normalized` / `native_print_queue_dispatch_payload_trace` / `native_print_strategy_parse` / `native_print_strategy_selected`) show the strategy missing, null, or replaced.

Meaning: patch exists, but strategy is dropped/overwritten between bridge ingestion and queue/service/worker parsing.
