package com.alalouche.sunmibridge.printservice

enum class PrintJobState {
    QUEUED,
    PRINTING,
    PRINTED,
    RETRY_SCHEDULED,
    NEEDS_ATTENTION;

    fun canTransitionTo(next: PrintJobState): Boolean {
        if (this == next) return true
        return when (this) {
            QUEUED -> next == PRINTING || next == NEEDS_ATTENTION
            PRINTING -> next == PRINTED || next == RETRY_SCHEDULED || next == NEEDS_ATTENTION
            RETRY_SCHEDULED -> next == PRINTING || next == NEEDS_ATTENTION
            PRINTED -> false
            NEEDS_ATTENTION -> next == QUEUED || next == PRINTING
        }
    }
}
