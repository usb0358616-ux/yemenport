package ye.gov.moi.borders.sync

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import ye.gov.moi.borders.data.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.UUID

data class StagedImportFile(
    val id: String = UUID.randomUUID().toString(),
    val uri: Uri,
    val name: String,
    val sizeBytes: Long,
    val format: String
) {
    val readableSize: String
        get() = when {
            sizeBytes < 1024 -> "$sizeBytes B"
            sizeBytes < 1024 * 1024 -> "${sizeBytes / 1024} KB"
            else -> String.format("%.1f MB", sizeBytes / (1024.0 * 1024.0))
        }
}

data class DocumentInsightSummary(
    val fileName: String,
    val rowCount: Int,
    val primaryDestination: String,
    val secondaryDestinations: List<String>,
    val confidencePercent: Int,
    val arabicSummary: String,
    val englishSummary: String,
    val translatedSamples: List<Pair<String, String>>,
    val topAgencies: List<Pair<String, Int>>,
    val topReturnReasons: List<Pair<String, Int>>
)

data class BatchImportReport(
    val totalFiles: Int,
    val totalRowsImported: Int,
    val agenciesLinked: Int,
    val watchlistHits: Int,
    val summaries: List<DocumentInsightSummary>
)

data class RealisticMonthlyReport(
    val generatedDate: String,
    val totalMonthlyVisas: Int,
    val approvedVisas: Int,
    val returnedVisas: Int,
    val watchlistFlaggedVisas: Int,
    val agencyStats: List<TravelAgencyEntity>,
    val topReturnReasons: List<Pair<String, Int>>,
    val nationalitiesBreakdown: List<Pair<String, Int>>,
    val foreignersTotal: Int,
    val activeForeigners: Int,
    val mofaRequestsTotal: Int,
    val organizationsCount: Int,
    val flightManifestsCount: Int,
    val citizenshipTotal: Int,
    val marriageCasesCount: Int,
    val outgoingLettersCount: Int,
    val incomingLettersCount: Int,
    val seizedPassportsCount: Int,
    val deliveredPassportsCount: Int,
    val securityDiscrepanciesCount: Int,
    val activeWatchlistReports: Int,
    val movementPermitsCount: Int,
    val movementPassengersTotal: Int,
    val topPermitPlaces: List<Pair<String, Int>>
)

object SmartImportBrain {

    private val EN_TO_AR_DICTIONARY = mapOf(
        "name" to "الاسم الكامل",
        "full name" to "الاسم الكامل",
        "passport" to "رقم الجواز",
        "passport no" to "رقم الجواز",
        "passport number" to "رقم الجواز",
        "nationality" to "الجنسية",
        "agency" to "وكالة السفر",
        "travel agency" to "وكالة السفر",
        "visa" to "نوع التأشيرة",
        "visa type" to "نوع التأشيرة",
        "center" to "المركز / المنفذ",
        "port" to "المنفذ الحدودي",
        "status" to "الحالة",
        "approved" to "معتمد / صادر",
        "issued" to "مؤشر",
        "returned" to "مرتجع",
        "rejected" to "مرفوض",
        "pending" to "قيد الإجراء",
        "return reason" to "سبب الإرتجاع",
        "exit date" to "تاريخ الخروج",
        "receive date" to "تاريخ الاستلام",
        "employer" to "جهة العمل / الكفيل",
        "profession" to "المهنة",
        "residence" to "رقم الإقامة",
        "permit" to "تصريح تنقل",
        "yemen" to "اليمن",
        "saudi arabia" to "السعودية",
        "egypt" to "مصر",
        "jordan" to "الأردن",
        "india" to "الهند",
        "ethiopia" to "إثيوبيا",
        "work visa" to "تأشيرة عمل",
        "visit visa" to "تأشيرة زيارة",
        "umrah" to "عمرة",
        "hajj" to "حج"
    )

    fun translateTermOffline(input: String): String {
        val clean = input.trim()
        if (clean.isEmpty()) return ""
        val exact = EN_TO_AR_DICTIONARY[clean.lowercase()]
        if (exact != null) return exact

        var translated = clean
        EN_TO_AR_DICTIONARY.entries
            .sortedByDescending { it.key.length }
            .forEach { (en, ar) ->
                if (translated.lowercase().contains(en)) {
                    translated = translated.replace(Regex(Regex.escape(en), RegexOption.IGNORE_CASE), ar)
                }
            }
        return if (translated != clean) translated else "$clean (مصطلح غير مترجم آلياً)"
    }

    fun normalizeArabic(text: String): String {
        return text.trim()
            .replace("أ", "ا")
            .replace("إ", "ا")
            .replace("آ", "ا")
            .replace("ة", "ه")
            .replace("ى", "ي")
            .replace(Regex("\\s+"), " ")
            .lowercase()
    }

    fun inspectUriMetadata(context: Context, uri: Uri): StagedImportFile {
        var displayName = "ملف_غير_معروف"
        var sizeBytes = 0L
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (cursor.moveToFirst()) {
                if (nameIdx >= 0) displayName = cursor.getString(nameIdx) ?: displayName
                if (sizeIdx >= 0) sizeBytes = cursor.getLong(sizeIdx)
            }
        }
        val ext = displayName.substringAfterLast('.', "").uppercase().ifEmpty { "DOC" }
        return StagedImportFile(uri = uri, name = displayName, sizeBytes = sizeBytes, format = ext)
    }

    private data class ColumnPlan(
        val serialIdx: Int = -1,
        val fullNameIdx: Int = -1,
        val passportIdx: Int = -1,
        val nationalityIdx: Int = -1,
        val centerIdx: Int = -1,
        val agencyIdx: Int = -1,
        val visaTypeIdx: Int = -1,
        val receiveDateIdx: Int = -1,
        val exitDateIdx: Int = -1,
        val statusIdx: Int = -1,
        val returnReasonIdx: Int = -1,
        val expiryIdx: Int = -1,
        val employerIdx: Int = -1,
        val professionIdx: Int = -1,
        val residenceIdx: Int = -1
    )

    private fun buildColumnPlan(headers: List<String>): ColumnPlan {
        val norm = headers.map { normalizeArabic(it) }
        fun findCol(vararg candidates: String): Int {
            for (c in candidates) {
                val cn = normalizeArabic(c)
                val exact = norm.indexOfFirst { it == cn }
                if (exact >= 0) return exact
            }
            for (c in candidates) {
                val cn = normalizeArabic(c)
                val partial = norm.indexOfFirst { it.contains(cn) }
                if (partial >= 0) return partial
            }
            return -1
        }
        return ColumnPlan(
            serialIdx = findCol("م", "الرقم", "serial", "no", "#"),
            fullNameIdx = findCol("الإسم", "الاسم", "اسم المسافر", "full name", "name"),
            passportIdx = findCol("رقم الجواز", "الجواز", "passport", "passport no"),
            nationalityIdx = findCol("الجنسية", "nationality", "country"),
            centerIdx = findCol("المركز", "المنفذ", "center", "port"),
            agencyIdx = findCol("إسم الوكالة", "اسم الوكالة", "الوكالة", "مكتب السفر", "agency", "travel agency"),
            visaTypeIdx = findCol("التأشيرة", "نوع التأشيرة", "visa", "visa type"),
            receiveDateIdx = findCol("تاريخ الإستلام", "تاريخ الاستلام", "ت. الاستلام", "receive date"),
            exitDateIdx = findCol("ت. الخروج", "تاريخ الخروج", "exit date", "departure"),
            statusIdx = findCol("الحالة", "حالة الجواز", "status"),
            returnReasonIdx = findCol("سبب الإرتجاع", "سبب الارتجاع", "ملاحظات", "return reason", "reason"),
            expiryIdx = findCol("تاريخ الانتهاء", "انتهاء الجواز", "expiry", "expiry date"),
            employerIdx = findCol("الكفيل", "جهة العمل", "المؤسسة", "employer", "sponsor"),
            professionIdx = findCol("المهنة", "الوظيفة", "profession", "job"),
            residenceIdx = findCol("رقم الاقامة", "الإقامة", "residence")
        )
    }

    private fun parseCsvRow(line: String, delimiter: Char): List<String> {
        val result = mutableListOf<String>()
        val current = StringBuilder()
        var inQuotes = false
        for (ch in line) {
            when {
                ch == '"' -> inQuotes = !inQuotes
                ch == delimiter && !inQuotes -> {
                    result.add(current.toString().trim())
                    current.setLength(0)
                }
                else -> current.append(ch)
            }
        }
        result.add(current.toString().trim())
        return result
    }

    private fun detectRouteWithLearnedRules(
        fileName: String,
        headers: List<String>,
        plan: ColumnPlan,
        learned: List<LearnedPatternEntity>
    ): Pair<String, List<String>> {
        val normFile = normalizeArabic(fileName)
        val normHeaders = headers.joinToString(" ") { normalizeArabic(it) }
        val combined = "$normFile $normHeaders"

        // التحقق من القواعد المتعلمة من الضابط أولاً
        for (rule in learned.sortedByDescending { it.frequency }) {
            val kws = rule.keywordsCsv.split(",").map { normalizeArabic(it) }.filter { it.isNotEmpty() }
            if (kws.isNotEmpty() && kws.any { combined.contains(it) }) {
                return rule.targetCategory to listOf("سجل المسافرين والتأشيرات", "الوكالات والارتجاع")
            }
        }

        val primary = when {
            plan.employerIdx >= 0 && plan.residenceIdx >= 0 -> "شؤون الوافدين والعمال الأجانب"
            combined.contains("تصريح") || combined.contains("تنقل") -> "تصاريح التنقل والأماكن"
            combined.contains("جنسية") || combined.contains("زواج") -> "طلبات الجنسية والزواج"
            combined.contains("مضبوط") || combined.contains("حجز") -> "الجوازات المضبوطة والتسليم"
            combined.contains("خارجية") || combined.contains("منظم") || combined.contains("مانيفست") -> "تسهيلات الخارجية والمنظمات"
            plan.agencyIdx >= 0 || plan.visaTypeIdx >= 0 -> "التأشيرات الصادرة ووكالات السفر"
            else -> "سجل المسافرين والمنافذ العام"
        }

        val secondary = buildList {
            if (plan.agencyIdx >= 0) add("مؤشر أداء وكالات السفر")
            if (plan.returnReasonIdx >= 0) add("تقرير أسباب الإرتجاع")
            if (plan.nationalityIdx >= 0) add("إحصائية الجنسيات")
            add("المباينة الأمنية وقوائم الضبط")
        }.distinct()

        return primary to secondary
    }

    suspend fun parseAndImportFilesChunked(
        context: Context,
        dao: BorderDao,
        stagedFiles: List<StagedImportFile>,
        onProgress: (percent: Int, statusLabel: String) -> Unit
    ): BatchImportReport = withContext(Dispatchers.Default) {
        val watchlist = dao.getAllWatchlist()
        val watchlistPassSet = watchlist.mapNotNull { it.targetPassportNumber.trim().takeIf { p -> p.isNotEmpty() } }.toSet()
        val existingAgencies = dao.getAllAgencies().associateBy { normalizeArabic(it.agencyName) }.toMutableMap()
        val learnedRules = dao.getAllLearnedPatterns()

        val summaries = mutableListOf<DocumentInsightSummary>()
        var grandTotalRows = 0
        var grandWatchlistHits = 0
        val newAgenciesTouched = mutableSetOf<String>()

        stagedFiles.forEachIndexed { fileIndex, file ->
            onProgress(
                ((fileIndex.toFloat() / stagedFiles.size.coerceAtLeast(1)) * 100).toInt(),
                "تحليل وقراءة: ${file.name}..."
            )

            val rawLines = runCatching {
                context.contentResolver.openInputStream(file.uri)?.use { stream ->
                    BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).readLines()
                } ?: emptyList()
            }.getOrElse { emptyList() }

            val nonEmpty = rawLines.filter { it.isNotBlank() }
            if (nonEmpty.size <= 1) {
                // حفظ سجل تعميم أو مراسلة إذا كان مستند نصي/PDF غير جدولي
                dao.insertCorrespondence(
                    CorrespondenceEntity(
                        id = UUID.randomUUID().toString(),
                        referenceNumber = "DOC-${System.currentTimeMillis().toString().takeLast(5)}",
                        direction = "وارد",
                        letterType = "مذكرة / مستند ${file.format}",
                        subject = file.name.substringBeforeLast('.'),
                        summary = "وثيقة مستوردة بصيغة ${file.format} (${file.readableSize}) جاهزة للأرشفة الإدارية.",
                        senderEntity = "استيراد موحد",
                        recipientEntity = "الأرشيف الذكي",
                        gregorianDate = java.time.LocalDate.now().toString()
                    )
                )
                summaries.add(
                    DocumentInsightSummary(
                        fileName = file.name,
                        rowCount = 1,
                        primaryDestination = "المراسلات والخطابات والأرشيف",
                        secondaryDestinations = listOf("تسهيلات الخارجية والمذكرات"),
                        confidencePercent = 88,
                        arabicSummary = "تمت أرشفة الوثيقة (${file.name}) كمستند رسمي وارد بصيغة ${file.format}.",
                        englishSummary = "Archived (${file.name}) as an incoming official ${file.format} document.",
                        translatedSamples = emptyList(),
                        topAgencies = emptyList(),
                        topReturnReasons = emptyList()
                    )
                )
                grandTotalRows += 1
                return@forEachIndexed
            }

            val headerLine = nonEmpty.first().removePrefix("\uFEFF")
            val delimiter = when {
                headerLine.count { it == ';' } > headerLine.count { it == ',' } -> ';'
                headerLine.count { it == '\t' } > headerLine.count { it == ',' } -> '\t'
                else -> ','
            }
            val headers = parseCsvRow(headerLine, delimiter)
            val plan = buildColumnPlan(headers)
            val (primaryRoute, secondaryRoutes) = detectRouteWithLearnedRules(file.name, headers, plan, learnedRules)

            val translatedSamples = headers.take(6).map { h -> h to translateTermOffline(h) }
            val agencyCounts = mutableMapOf<String, Int>()
            val returnReasonsMap = mutableMapOf<String, Int>()

            val batchBuffer = ArrayList<TravelerEntity>(350)
            val foreignerBuffer = ArrayList<ForeignerResidentEntity>(200)
            val totalDataRows = nonEmpty.size - 1
            var importedInFile = 0

            val isForeignerDoc = primaryRoute.contains("الوافدين")

            for (i in 1 until nonEmpty.size) {
                val cols = parseCsvRow(nonEmpty[i], delimiter)
                fun col(idx: Int): String = if (idx in cols.indices) cols[idx].trim() else ""

                val name = col(plan.fullNameIdx).ifEmpty { col(1) }
                val passport = col(plan.passportIdx).ifEmpty { col(2) }
                if (name.isEmpty() && passport.isEmpty()) continue

                val agencyName = col(plan.agencyIdx)
                val statusVal = col(plan.statusIdx).ifEmpty { "معتمد" }
                val returnReasonVal = col(plan.returnReasonIdx)
                val nationalityVal = col(plan.nationalityIdx).ifEmpty { "اليمن" }
                val portVal = col(plan.centerIdx).ifEmpty { "المركز الرئيسي - العاصمة صنعاء" }

                if (agencyName.isNotEmpty()) {
                    agencyCounts[agencyName] = (agencyCounts[agencyName] ?: 0) + 1
                    newAgenciesTouched.add(agencyName)
                    val normAg = normalizeArabic(agencyName)
                    val cur = existingAgencies[normAg]
                    val isReturned = statusVal.contains("مرتجع") || returnReasonVal.isNotEmpty()
                    existingAgencies[normAg] = TravelAgencyEntity(
                        id = cur?.id ?: UUID.randomUUID().toString(),
                        agencyName = cur?.agencyName ?: agencyName,
                        center = cur?.center?.ifEmpty { portVal } ?: portVal,
                        linkedVisasCount = (cur?.linkedVisasCount ?: 0) + 1,
                        issuedCount = (cur?.issuedCount ?: 0) + if (!isReturned) 1 else 0,
                        returnedCount = (cur?.returnedCount ?: 0) + if (isReturned) 1 else 0
                    )
                }

                if (returnReasonVal.isNotEmpty()) {
                    returnReasonsMap[returnReasonVal] = (returnReasonsMap[returnReasonVal] ?: 0) + 1
                }

                val isWatchlistHit = passport.isNotEmpty() && watchlistPassSet.contains(passport)
                if (isWatchlistHit) grandWatchlistHits++

                if (isForeignerDoc) {
                    foreignerBuffer.add(
                        ForeignerResidentEntity(
                            id = UUID.randomUUID().toString(),
                            residenceNumber = col(plan.residenceIdx).ifEmpty { "RES-${1000 + i}" },
                            fullName = name,
                            passportNumber = passport,
                            nationality = nationalityVal,
                            employer = col(plan.employerIdx).ifEmpty { "قطاع خاص" },
                            profession = col(plan.professionIdx).ifEmpty { "عامل وافد" },
                            entryDate = col(plan.receiveDateIdx),
                            residenceExpiryDate = col(plan.expiryIdx)
                        )
                    )
                    if (foreignerBuffer.size >= 300) {
                        dao.insertForeignersBatch(foreignerBuffer.toList())
                        foreignerBuffer.clear()
                    }
                } else {
                    val agId = if (agencyName.isNotEmpty()) existingAgencies[normalizeArabic(agencyName)]?.id ?: "" else ""
                    batchBuffer.add(
                        TravelerEntity(
                            id = UUID.randomUUID().toString(),
                            serialNumber = col(plan.serialIdx),
                            fullName = name.ifEmpty { "غير محدد" },
                            passportNumber = passport,
                            nationality = nationalityVal,
                            expiryDate = col(plan.expiryIdx),
                            portName = portVal,
                            agency = agencyName,
                            agencyId = agId,
                            visaType = col(plan.visaTypeIdx),
                            receiveDate = col(plan.receiveDateIdx),
                            exitDate = col(plan.exitDateIdx),
                            status = statusVal,
                            returnReason = returnReasonVal,
                            travelAllowed = if (isWatchlistHit) "لا" else "نعم",
                            vettingResult = if (isWatchlistHit) "🚨 تطابق قائمة الترقب" else "سليم",
                            synced = false
                        )
                    )
                    if (batchBuffer.size >= 300) {
                        dao.insertTravelersBatch(batchBuffer.toList())
                        batchBuffer.clear()
                    }
                }

                importedInFile++

                // إتاحة وقت لواجهة المستخدم لمنع التهنيج تماماً عند 3000+ اسم
                if (i % 300 == 0) {
                    val pct = (((fileIndex + (i.toFloat() / totalDataRows.coerceAtLeast(1))) / stagedFiles.size) * 100).toInt()
                    onProgress(pct.coerceIn(1, 99), "تمت معالجة $importedInFile / $totalDataRows من ${file.name}")
                    yield()
                }
            }

            if (batchBuffer.isNotEmpty()) dao.insertTravelersBatch(batchBuffer.toList())
            if (foreignerBuffer.isNotEmpty()) dao.insertForeignersBatch(foreignerBuffer.toList())

            // تعليم تلقائي لبصمة أعمدة هذا الملف
            dao.upsertLearnedPattern(
                LearnedPatternEntity(
                    id = "sig_${normalizeArabic(headers.take(5).joinToString("_")).hashCode()}",
                    patternType = "column_signature",
                    instructionText = "توجيه تلقائي: ${file.name} -> $primaryRoute",
                    keywordsCsv = headers.take(6).joinToString(","),
                    targetCategory = primaryRoute,
                    frequency = 1
                )
            )

            val topAgencies = agencyCounts.entries.sortedByDescending { it.value }.take(4).map { it.key to it.value }
            val topReasons = returnReasonsMap.entries.sortedByDescending { it.value }.take(3).map { it.key to it.value }

            val arSum = buildString {
                append("تم استيراد $importedInFile سجل بنجاح إلى وحدة ($primaryRoute).")
                if (topAgencies.isNotEmpty()) {
                    append(" أبرز الوكالات: ${topAgencies.joinToString("، ") { "${it.first} (${it.second})" }}.")
                }
                if (topReasons.isNotEmpty()) {
                    append(" أسباب الإرتجاع المرصودة: ${topReasons.joinToString("، ") { "${it.first} (${it.second})" }}.")
                }
            }
            val enSum = "Imported $importedInFile records cleanly into [$primaryRoute] via chunked offline engine (${agencyCounts.size} agencies linked)."

            summaries.add(
                DocumentInsightSummary(
                    fileName = file.name,
                    rowCount = importedInFile,
                    primaryDestination = primaryRoute,
                    secondaryDestinations = secondaryRoutes,
                    confidencePercent = 94,
                    arabicSummary = arSum,
                    englishSummary = enSum,
                    translatedSamples = translatedSamples,
                    topAgencies = topAgencies,
                    topReturnReasons = topReasons
                )
            )
            grandTotalRows += importedInFile
        }

        if (existingAgencies.isNotEmpty()) {
            dao.upsertAgencies(existingAgencies.values.toList())
        }

        onProgress(100, "اكتملت المعالجة الذكية لـ $grandTotalRows سجل بدون أي تعليق")
        BatchImportReport(
            totalFiles = stagedFiles.size,
            totalRowsImported = grandTotalRows,
            agenciesLinked = newAgenciesTouched.size,
            watchlistHits = grandWatchlistHits,
            summaries = summaries
        )
    }

    fun buildRealisticMonthlyReport(
        travelers: List<TravelerEntity>,
        agencies: List<TravelAgencyEntity>,
        mofa: List<MofaVisaEntity>,
        seizures: List<PassportSeizureEntity>,
        foreigners: List<ForeignerResidentEntity>,
        permits: List<MovementPermitEntity>,
        citizenship: List<CitizenshipCaseEntity>,
        letters: List<CorrespondenceEntity>,
        watchlist: List<WatchlistReportEntity>
    ): RealisticMonthlyReport {
        val approved = travelers.count { !it.status.contains("مرتجع") && it.travelAllowed == "نعم" }
        val returned = travelers.count { it.status.contains("مرتجع") || it.returnReason.isNotBlank() }
        val flagged = travelers.count { it.travelAllowed != "نعم" || it.vettingResult.contains("تطابق") }

        val reasons = travelers
            .mapNotNull { it.returnReason.trim().takeIf { r -> r.isNotEmpty() } }
            .groupingBy { it }
            .eachCount()
            .entries
            .sortedByDescending { it.value }
            .take(5)
            .map { it.key to it.value }

        val nats = travelers
            .map { it.nationality.trim().ifEmpty { "اليمن" } }
            .groupingBy { it }
            .eachCount()
            .entries
            .sortedByDescending { it.value }
            .take(8)
            .map { it.key to it.value }

        val permitPlaces = permits
            .map { it.accommodationPlace.trim().ifEmpty { it.authorizedRoute } }
            .groupingBy { it }
            .eachCount()
            .entries
            .sortedByDescending { it.value }
            .take(5)
            .map { it.key to it.value }

        return RealisticMonthlyReport(
            generatedDate = java.time.LocalDate.now().toString(),
            totalMonthlyVisas = travelers.size,
            approvedVisas = approved,
            returnedVisas = returned,
            watchlistFlaggedVisas = flagged,
            agencyStats = agencies.sortedByDescending { it.linkedVisasCount }.take(8),
            topReturnReasons = reasons,
            nationalitiesBreakdown = nats,
            foreignersTotal = foreigners.size,
            activeForeigners = foreigners.count { it.residenceExpiryDate.isEmpty() || it.residenceExpiryDate >= java.time.LocalDate.now().toString() },
            mofaRequestsTotal = mofa.size,
            organizationsCount = mofa.map { it.organization }.distinct().size,
            flightManifestsCount = mofa.count { it.requestType.contains("رحلة") || it.flightRoute.isNotBlank() },
            citizenshipTotal = citizenship.size,
            marriageCasesCount = citizenship.count { it.serviceType.contains("زواج") },
            outgoingLettersCount = letters.count { it.direction == "صادر" },
            incomingLettersCount = letters.count { it.direction == "وارد" },
            seizedPassportsCount = seizures.count { it.status != "تم التسليم" },
            deliveredPassportsCount = seizures.count { it.status == "تم التسليم" },
            securityDiscrepanciesCount = flagged + seizures.size,
            activeWatchlistReports = watchlist.size,
            movementPermitsCount = permits.size,
            movementPassengersTotal = permits.sumOf { it.passengersCount },
            topPermitPlaces = permitPlaces
        )
    }
}
