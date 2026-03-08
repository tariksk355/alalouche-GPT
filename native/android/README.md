# Android WebView + Sunmi bridge PoC (buildable project foundation)

This directory is now a **standalone Android Studio / Gradle project** for the Sunmi WebView bridge proof-of-concept.

> Scope of this step: make `native/android/` buildable and ready for iterative native work.
> Real/production Sunmi printing is **not finished** yet.

## What this Android project contains

- `app/src/main/java/com/alalouche/sunmibridge/MainActivity.kt`
  - WebView host activity.
- `app/src/main/java/com/alalouche/sunmibridge/SunmiJsBridge.kt`
  - JS bridge exposed as `window.SunmiBridge` with structured JSON responses.
- `app/src/main/java/com/alalouche/sunmibridge/SunmiPrinterManager.kt`
  - Native printer manager placeholder + first-pass service binding attempt path.
- `app/src/main/aidl/woyou/aidlservice/jiuiv5/*`
  - Sunmi AIDL contracts used by the native bridge.

## Project foundation files (required by Android Studio/Gradle)

These files are present so `native/android/` opens directly as a Gradle Android project:

- `settings.gradle.kts`
- `build.gradle.kts` (root)
- `gradle.properties`
- `gradlew`
- `gradlew.bat`
- `gradle/wrapper/gradle-wrapper.jar` *(binary; may need to be generated/committed locally)*
- `gradle/wrapper/gradle-wrapper.properties`
- `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- app resources (`res/layout`, `res/values`, `res/xml`)


## Binary wrapper artifact handling (important for Codex flow)

Codex changes in this repo are restricted to text files.
The Gradle wrapper JAR is a binary file and may need to be handled locally:

- binary file: `gradle/wrapper/gradle-wrapper.jar`
- text wrapper files (`gradlew`, `gradlew.bat`, `gradle-wrapper.properties`) can be committed by Codex

If the JAR is missing in your branch, generate it locally from `native/android/`:

```bash
gradle wrapper --gradle-version 8.7 --no-validate-url