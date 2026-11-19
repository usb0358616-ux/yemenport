package ye.gov.moi.borders.sync

import android.content.Context
import androidx.work.*
import ye.gov.moi.borders.data.BorderDatabase
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit

data class PassportVerificationResult(
    val isAllowed: Boolean,
    val isExpired: Boolean,
    val isExpiringSoon: Boolean, // < 6 months (180 days)
    val matchedReportTitle: String?,
    val statusMessage: String
)

object PassportSecurityEngine {
    fun evaluateValidity(expiryDateStr: String, matchedReportTitle: String?): PassportVerificationResult {
        var expired = false
        var expiringSoon = false

        if (expiryDateStr.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) {
            runCatching {
                val expiry = LocalDate.parse(expiryDateStr)
                val today = LocalDate.now()
                val daysLeft = ChronoUnit.DAYS.between(today, expiry)
                expired = daysLeft < 0
                expiringSoon = !expired && daysLeft <= 180
            }
        }

        val allowed = matchedReportTitle == null && !expired
        val msg = when {
            matchedReportTitle != null -> "🚨 تطابق أمني مع بلاغ ضبط: $matchedReportTitle"
            expired -> "✕ وثيقة منتهية الصلاحية — يُمنع العبور"
            expiringSoon -> "⚠️ تنبيه مبكر: الجواز سينتهي خلال أقل من 6 أشهر"
            else -> "✓ الوثيقة سليمة ومطابقة وخالية من القيود"
        }

        return PassportVerificationResult(
            isAllowed = allowed,
            isExpired = expired,
            isExpiringSoon = expiringSoon,
            matchedReportTitle = matchedReportTitle,
            statusMessage = msg
        )
    }

    /**
     * استخراج رقم الجواز والاسم والانتهاء من السطر المقروء آلياً (MRZ) عبر ML Kit OCR
     */
    fun parseMrzLines(rawText: String): Triple<String, String, String> {
        val lines = rawText.lines().map { it.trim().replace(" ", "") }.filter { it.length >= 30 }
        if (lines.size >= 2) {
            val line1 = lines[lines.size - 2]
            val line2 = lines[lines.size - 1]
            val fullName = line1.drop(5).replace("<<", " ").replace("<", " ").trim()
            val passportNo = line2.take(9).replace("<", "").trim()
            val yy = line2.drop(21).take(2)
            val mm = line2.drop(23).take(2)
            val dd = line2.drop(25).take(2)
            val expiry = if (yy.all { it.isDigit() }) "20$yy-$mm-$dd" else ""
            return Triple(passportNo, fullName, expiry)
        }
        return Triple("", "", "")
    }
}

class BorderSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val dao = BorderDatabase.getInstance(applicationContext).borderDao()
        val pending = dao.getPendingSyncTravelers()
        if (pending.isEmpty()) return Result.success()

        val serverBaseUrl = inputData.getString("SERVER_URL") ?: return Result.success()

        return try {
            val url = URL("$serverBaseUrl/api/sync/travelers")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 8000
                readTimeout = 8000
                doOutput = true
            }
            val payload = pending.joinToString(",", "[", "]") {
                """{"id":"${it.id}","fullName":"${it.fullName}","passportNumber":"${it.passportNumber}","portName":"${it.portName}"}"""
            }
            conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }

            if (conn.responseCode in 200..299) {
                dao.markTravelersSynced(pending.map { it.id })
                Result.success()
            } else {
                Result.retry()
            }
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        fun schedulePeriodicSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<BorderSyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "YemenBordersSync",
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}
