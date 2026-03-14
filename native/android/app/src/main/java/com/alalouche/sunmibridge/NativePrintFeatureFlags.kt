package com.alalouche.sunmibridge

object NativePrintFeatureFlags {
    // Replacement architecture scaffold flag.
    // Keep false until native print worker implementation is validated on hardware.
    const val USE_NATIVE_PRINT_SERVICE = false

    // Legacy bridge path remains temporarily available for compatibility only.
    const val LEGACY_BRIDGE_FALLBACK_ONLY = true
}
