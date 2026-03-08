# Android WebView + Sunmi bridge PoC (sideload testing)

This is a **minimum native wrapper PoC** for fast on-device validation (not Play Store release work).

## Folder structure

- `native/android/app/src/main/java/com/alalouche/sunmibridge/MainActivity.kt`
  - WebView host activity
- `native/android/app/src/main/java/com/alalouche/sunmibridge/SunmiJsBridge.kt`
  - `JavascriptInterface` bridge exposed as `window.SunmiBridge`
- `native/android/app/src/main/java/com/alalouche/sunmibridge/SunmiPrinterManager.kt`
  - printer operation handler with explicit structured responses
- `native/android/app/src/main/AndroidManifest.xml`
  - internet + cleartext dev config
- `native/android/app/build.gradle.kts`
  - debug-friendly build config

## What is implemented in this PoC

- Native Android app with WebView wrapper.
- Loads configurable web app URL (default from `BuildConfig.DEFAULT_WEB_APP_URL`).
- JS bridge methods exposed:
  - `isAvailable(requestJson)`
  - `getPrinterInfo(requestJson)`
  - `printReceipt(printJobJson)`
  - `openCashDrawer(requestJson)`
- Structured JSON responses from all bridge methods.
- Explicit error and not-implemented responses (no fake print success).

## What is NOT fully implemented yet

- Actual Sunmi SDK binder/service print execution path.
- Cash drawer real control.
- Production hardening/signing/release pipeline.

`printReceipt(...)` currently confirms bridge path and print job payload arrival, then returns:
- `ok: false`
- `code: SUNMI_PRINT_NOT_IMPLEMENTED`

This is intentional and honest until Sunmi SDK binding is wired.

## Build APK (debug)

From `native/android/`:

```bash
# one-time if wrapper scripts are missing on your machine
# gradle wrapper

./gradlew assembleDebug
```

If `gradlew` is not present, install local Gradle and run `gradle wrapper` once in `native/android/`.

APK output:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Install directly on Sunmi device (ADB)

```bash
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Then launch the app from the device.

## Web app URL configuration

Current default debug URL is set in `app/build.gradle.kts`:
- `BuildConfig.DEFAULT_WEB_APP_URL = "http://10.0.2.2:4174/"`

For real Sunmi device testing, update this to a reachable LAN/staging URL (for example your dev machine IP).

You can also start activity with URL override extra:

```bash
adb shell am start -n com.alalouche.sunmibridge/.MainActivity --es WEB_APP_URL "http://<LAN_IP>:4174/"
```

## Debugging / logs

Use logcat filters:

```bash
adb logcat | grep -E "SunmiBridgePoC|SunmiJsBridge|SunmiPrinterManager"
```

## Integration with `sunmi/` web app

The web shell detects `window.SunmiBridge` and calls native bridge methods through the printer adapter contract.
If bridge is absent, it cleanly falls back to pure-web unavailable mode.
