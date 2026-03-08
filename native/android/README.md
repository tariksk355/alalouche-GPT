# Android WebView + Sunmi bridge PoC (sideload testing)

This is a **minimum native wrapper PoC** for fast on-device validation (not Play Store release work).

## Folder structure

- `native/android/app/src/main/java/com/alalouche/sunmibridge/MainActivity.kt`
  - WebView host activity
- `native/android/app/src/main/java/com/alalouche/sunmibridge/SunmiJsBridge.kt`
  - `JavascriptInterface` bridge exposed as `window.SunmiBridge`
- `native/android/app/src/main/java/com/alalouche/sunmibridge/SunmiPrinterManager.kt`
  - printer service bind + print attempt path + structured JSON responses
- `native/android/app/src/main/aidl/woyou/aidlservice/jiuiv5/*`
  - AIDL contracts for Sunmi printer service calls

## What is implemented in this PoC

- Native Android app with WebView wrapper.
- Loads configurable web app URL (default from `BuildConfig.DEFAULT_WEB_APP_URL`).
- JS bridge methods exposed:
  - `isAvailable(requestJson)`
  - `getPrinterInfo(requestJson)`
  - `printReceipt(printJobJson)`
  - `openCashDrawer(requestJson)`
- Real first-pass printer path:
  - attempts binding to Sunmi printer service (`woyou.aidlservice.jiuiv5.IWoyouService`)
  - maps structured print job to basic text receipt commands
  - sends print commands via AIDL service when bound
- Structured JSON responses from all bridge methods.
- Explicit failure responses when binding or print execution cannot proceed.

## What is still pending / not production-ready

- Full Sunmi model compatibility hardening.
- Callback/result synchronization for guaranteed print completion.
- Advanced receipt layout, bitmap/logo support, retries.
- Release signing/distribution hardening.

## Build APK (debug)

From `native/android/`:

```bash
# if gradle wrapper scripts are missing, run once:
# gradle wrapper

./gradlew assembleDebug
```

APK output:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Install directly on Sunmi device (ADB)

```bash
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Then launch the app on device.

## Web app URL configuration

Default debug URL in `app/build.gradle.kts`:
- `BuildConfig.DEFAULT_WEB_APP_URL = "http://10.0.2.2:4174/"`

For real Sunmi handheld testing, use a reachable LAN/staging URL (your host IP).

URL override at launch:

```bash
adb shell am start -n com.alalouche.sunmibridge/.MainActivity --es WEB_APP_URL "http://<LAN_IP>:4174/"
```

## How to test printer path on real Sunmi

1. Start backend + `sunmi/` web app.
2. Install and open Android wrapper.
3. Pair device in app shell if needed.
4. Tap **Info imprimante** and confirm diagnostics include:
   - `mode: native_bridge`
   - `serviceBound: true` (expected when service is available)
5. Tap **Test impression** or per-order **Test print**.

## What counts as success in this PoC

- Bridge call reaches native side.
- Native side attempts service bind and print command execution.
- Result returns either:
  - `ok: true` + `PRINT_SENT` (print commands sent), or
  - explicit failure (e.g. `SUNMI_SERVICE_UNAVAILABLE`, `SUNMI_PRINT_REMOTE_ERROR`, etc.) with message.

No fake success is returned.

## Debugging / logs

```bash
adb logcat | grep -E "SunmiBridgePoC|SunmiJsBridge|SunmiPrinterManager"
```

Useful log events:
- bridge method called
- service bind success/failure
- print attempt started
- print success/failure
- printer info queried
