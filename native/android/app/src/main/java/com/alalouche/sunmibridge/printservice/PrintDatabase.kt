package com.alalouche.sunmibridge.printservice

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class PrintDatabase(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE $TABLE_PRINT_JOBS (
                job_id TEXT PRIMARY KEY NOT NULL,
                order_id TEXT,
                payload_json TEXT NOT NULL,
                state TEXT NOT NULL,
                attempt_count INTEGER NOT NULL,
                max_attempts INTEGER NOT NULL,
                error_code TEXT,
                error_message TEXT,
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                next_attempt_at_ms INTEGER
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX idx_print_jobs_state_next_attempt ON $TABLE_PRINT_JOBS(state, next_attempt_at_ms)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // MVP skeleton: destructive migration is acceptable during early development.
        db.execSQL("DROP TABLE IF EXISTS $TABLE_PRINT_JOBS")
        onCreate(db)
    }

    fun printJobDao(): PrintJobDao = SqlitePrintJobDao(this)

    private class SqlitePrintJobDao(private val helper: PrintDatabase) : PrintJobDao {
        override fun insert(job: PrintJobEntity) {
            helper.writableDatabase.insertWithOnConflict(
                TABLE_PRINT_JOBS,
                null,
                job.toContentValues(),
                SQLiteDatabase.CONFLICT_REPLACE,
            )
        }

        override fun getById(jobId: String): PrintJobEntity? {
            helper.readableDatabase.query(
                TABLE_PRINT_JOBS,
                null,
                "job_id = ?",
                arrayOf(jobId),
                null,
                null,
                null,
                "1",
            ).use { cursor ->
                if (!cursor.moveToFirst()) return null
                return cursor.toEntity()
            }
        }

        override fun getNextRunnableJob(nowEpochMs: Long): PrintJobEntity? {
            val sql = """
                SELECT * FROM $TABLE_PRINT_JOBS
                WHERE (state = ? OR state = ?)
                  AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)
                ORDER BY created_at_ms ASC
                LIMIT 1
            """.trimIndent()
            helper.readableDatabase.rawQuery(
                sql,
                arrayOf(PrintJobState.QUEUED.name, PrintJobState.RETRY_SCHEDULED.name, nowEpochMs.toString()),
            ).use { cursor ->
                if (!cursor.moveToFirst()) return null
                return cursor.toEntity()
            }
        }

        override fun updateState(
            jobId: String,
            expectedCurrent: PrintJobState?,
            newState: PrintJobState,
            attemptCount: Int?,
            errorCode: String?,
            errorMessage: String?,
            nextAttemptAtEpochMs: Long?,
        ): Boolean {
            val current = getById(jobId) ?: return false
            if (expectedCurrent != null && current.state != expectedCurrent) return false
            if (!current.state.canTransitionTo(newState)) return false

            val values = ContentValues().apply {
                put("state", newState.name)
                put("updated_at_ms", System.currentTimeMillis())
                if (attemptCount != null) put("attempt_count", attemptCount)
                put("error_code", errorCode)
                put("error_message", errorMessage)
                if (nextAttemptAtEpochMs == null) {
                    putNull("next_attempt_at_ms")
                } else {
                    put("next_attempt_at_ms", nextAttemptAtEpochMs)
                }
            }

            val where = if (expectedCurrent == null) {
                "job_id = ?"
            } else {
                "job_id = ? AND state = ?"
            }
            val args = if (expectedCurrent == null) {
                arrayOf(jobId)
            } else {
                arrayOf(jobId, expectedCurrent.name)
            }
            return helper.writableDatabase.update(TABLE_PRINT_JOBS, values, where, args) > 0
        }

        private fun PrintJobEntity.toContentValues(): ContentValues {
            return ContentValues().apply {
                put("job_id", jobId)
                put("order_id", orderId)
                put("payload_json", payloadJson)
                put("state", state.name)
                put("attempt_count", attemptCount)
                put("max_attempts", maxAttempts)
                put("error_code", errorCode)
                put("error_message", errorMessage)
                put("created_at_ms", createdAtEpochMs)
                put("updated_at_ms", updatedAtEpochMs)
                if (nextAttemptAtEpochMs == null) putNull("next_attempt_at_ms") else put("next_attempt_at_ms", nextAttemptAtEpochMs)
            }
        }

        private fun android.database.Cursor.toEntity(): PrintJobEntity {
            return PrintJobEntity(
                jobId = getString(getColumnIndexOrThrow("job_id")),
                orderId = getString(getColumnIndexOrThrow("order_id")),
                payloadJson = getString(getColumnIndexOrThrow("payload_json")),
                state = PrintJobState.valueOf(getString(getColumnIndexOrThrow("state"))),
                attemptCount = getInt(getColumnIndexOrThrow("attempt_count")),
                maxAttempts = getInt(getColumnIndexOrThrow("max_attempts")),
                errorCode = getString(getColumnIndexOrThrow("error_code")),
                errorMessage = getString(getColumnIndexOrThrow("error_message")),
                createdAtEpochMs = getLong(getColumnIndexOrThrow("created_at_ms")),
                updatedAtEpochMs = getLong(getColumnIndexOrThrow("updated_at_ms")),
                nextAttemptAtEpochMs = if (isNull(getColumnIndexOrThrow("next_attempt_at_ms"))) null else getLong(getColumnIndexOrThrow("next_attempt_at_ms")),
            )
        }
    }

    companion object {
        private const val DB_NAME = "sunmi_print_jobs.db"
        private const val DB_VERSION = 1
        private const val TABLE_PRINT_JOBS = "print_jobs"
    }
}
