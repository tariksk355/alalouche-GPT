package com.alalouche.sunmibridge.nativeprint

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

interface NativePrintJobDao {
    fun insert(job: NativePrintJobEntity)
    fun getById(commandId: String): NativePrintJobEntity?
    fun getNextRunnableJob(nowEpochMs: Long): NativePrintJobEntity?
    fun getByStates(states: Set<NativePrintJobState>): List<NativePrintJobEntity>
    fun update(job: NativePrintJobEntity)
}

class NativePrintDatabase(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE $TABLE_NATIVE_PRINT_JOBS (
                command_id TEXT PRIMARY KEY NOT NULL,
                order_id TEXT,
                source_job_id TEXT,
                payload_json TEXT NOT NULL,
                state TEXT NOT NULL,
                attempt_count INTEGER NOT NULL,
                max_attempts INTEGER NOT NULL,
                retryable INTEGER NOT NULL,
                error_code TEXT,
                error_message TEXT,
                physical_outcome TEXT NOT NULL,
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                next_attempt_at_ms INTEGER
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX idx_native_print_jobs_state_next_attempt ON $TABLE_NATIVE_PRINT_JOBS(state, next_attempt_at_ms)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_NATIVE_PRINT_JOBS")
        onCreate(db)
    }

    fun nativePrintJobDao(): NativePrintJobDao = SqliteNativePrintJobDao(this)

    private class SqliteNativePrintJobDao(private val helper: NativePrintDatabase) : NativePrintJobDao {
        override fun insert(job: NativePrintJobEntity) {
            helper.writableDatabase.insertWithOnConflict(
                TABLE_NATIVE_PRINT_JOBS,
                null,
                job.toContentValues(),
                SQLiteDatabase.CONFLICT_REPLACE,
            )
        }

        override fun getById(commandId: String): NativePrintJobEntity? {
            helper.readableDatabase.query(
                TABLE_NATIVE_PRINT_JOBS,
                null,
                "command_id = ?",
                arrayOf(commandId),
                null,
                null,
                null,
                "1",
            ).use { cursor ->
                if (!cursor.moveToFirst()) return null
                return cursor.toEntity()
            }
        }

        override fun getNextRunnableJob(nowEpochMs: Long): NativePrintJobEntity? {
            val sql = """
                SELECT * FROM $TABLE_NATIVE_PRINT_JOBS
                WHERE state = ?
                  AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)
                ORDER BY created_at_ms ASC
                LIMIT 1
            """.trimIndent()
            helper.readableDatabase.rawQuery(
                sql,
                arrayOf(NativePrintJobState.QUEUED.name, nowEpochMs.toString()),
            ).use { cursor ->
                if (!cursor.moveToFirst()) return null
                return cursor.toEntity()
            }
        }

        override fun getByStates(states: Set<NativePrintJobState>): List<NativePrintJobEntity> {
            if (states.isEmpty()) return emptyList()
            val placeholders = states.joinToString(",") { "?" }
            val sql = "SELECT * FROM $TABLE_NATIVE_PRINT_JOBS WHERE state IN ($placeholders) ORDER BY created_at_ms ASC"
            val args = states.map { it.name }.toTypedArray()
            val out = mutableListOf<NativePrintJobEntity>()
            helper.readableDatabase.rawQuery(sql, args).use { cursor ->
                while (cursor.moveToNext()) {
                    out += cursor.toEntity()
                }
            }
            return out
        }

        override fun update(job: NativePrintJobEntity) {
            helper.writableDatabase.update(
                TABLE_NATIVE_PRINT_JOBS,
                job.toContentValues(),
                "command_id = ?",
                arrayOf(job.commandId),
            )
        }

        private fun NativePrintJobEntity.toContentValues(): ContentValues {
            return ContentValues().apply {
                put("command_id", commandId)
                put("order_id", orderId)
                put("source_job_id", sourceJobId)
                put("payload_json", payloadJson)
                put("state", state.name)
                put("attempt_count", attemptCount)
                put("max_attempts", maxAttempts)
                put("retryable", if (retryable) 1 else 0)
                put("error_code", errorCode)
                put("error_message", errorMessage)
                put("physical_outcome", physicalOutcome.name)
                put("created_at_ms", createdAtEpochMs)
                put("updated_at_ms", updatedAtEpochMs)
                if (nextAttemptAtEpochMs == null) putNull("next_attempt_at_ms") else put("next_attempt_at_ms", nextAttemptAtEpochMs)
            }
        }

        private fun android.database.Cursor.toEntity(): NativePrintJobEntity {
            return NativePrintJobEntity(
                commandId = getString(getColumnIndexOrThrow("command_id")),
                orderId = getString(getColumnIndexOrThrow("order_id")),
                sourceJobId = getString(getColumnIndexOrThrow("source_job_id")),
                payloadJson = getString(getColumnIndexOrThrow("payload_json")),
                state = NativePrintJobState.valueOf(getString(getColumnIndexOrThrow("state"))),
                attemptCount = getInt(getColumnIndexOrThrow("attempt_count")),
                maxAttempts = getInt(getColumnIndexOrThrow("max_attempts")),
                retryable = getInt(getColumnIndexOrThrow("retryable")) == 1,
                errorCode = getString(getColumnIndexOrThrow("error_code")),
                errorMessage = getString(getColumnIndexOrThrow("error_message")),
                physicalOutcome = PhysicalPrintOutcome.valueOf(getString(getColumnIndexOrThrow("physical_outcome"))),
                createdAtEpochMs = getLong(getColumnIndexOrThrow("created_at_ms")),
                updatedAtEpochMs = getLong(getColumnIndexOrThrow("updated_at_ms")),
                nextAttemptAtEpochMs = if (isNull(getColumnIndexOrThrow("next_attempt_at_ms"))) null else getLong(getColumnIndexOrThrow("next_attempt_at_ms")),
            )
        }
    }

    companion object {
        private const val DB_NAME = "native_print_jobs.db"
        private const val DB_VERSION = 2
        private const val TABLE_NATIVE_PRINT_JOBS = "native_print_jobs"
    }
}
