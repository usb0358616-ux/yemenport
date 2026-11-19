package ye.gov.moi.borders.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ye.gov.moi.borders.data.*
import ye.gov.moi.borders.sync.*
import java.time.LocalDate
import java.util.UUID

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        BorderSyncWorker.schedulePeriodicSync(this)

        val db = BorderDatabase.getInstance(this)
        val dao = db.borderDao()

        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme(
                    colorScheme = lightColorScheme(
                        primary = Color(0xFF1E3A5F),
                        secondary = Color(0xFFD97706),
                        error = Color(0xFFDC2626),
                        background = Color(0xFFF8FAFC)
                    )
                ) {
                    YemenBordersAndroidApp(dao = dao)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YemenBordersAndroidApp(dao: BorderDao) {
    val scope = rememberCoroutineScope()
    val travelers by dao.observeTravelers().collectAsState(initial = emptyList())
    val agencies by dao.observeAgencies().collectAsState(initial = emptyList())
    val mofaVisas by dao.observeMofaVisas().collectAsState(initial = emptyList())
    val seizures by dao.observeSeizures().collectAsState(initial = emptyList())
    val foreigners by dao.observeForeigners().collectAsState(initial = emptyList())
    val permits by dao.observePermits().collectAsState(initial = emptyList())
    val citizenshipCases by dao.observeCitizenshipCases().collectAsState(initial = emptyList())
    val letters by dao.observeCorrespondence().collectAsState(initial = emptyList())
    val learnedPatterns by dao.observeLearnedPatterns().collectAsState(initial = emptyList())
    val reports by dao.observeWatchlist().collectAsState(initial = emptyList())
    val officers by dao.observeOfficers().collectAsState(initial = emptyList())

    var currentTab by remember { mutableIntStateOf(0) }
    var activeAlert by remember { mutableStateOf<WatchlistReportEntity?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF0F172A),
                    titleContentColor = Color.White
                ),
                title = {
                    Column {
                        Text(
                            text = "نظام المنافذ والجوازات الذكي",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = "الجمهورية اليمنية · المركز الرئيسي - صنعاء (Offline)",
                            color = Color(0xFFFCD34D),
                            fontSize = 11.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = currentTab == 0,
                    onClick = { currentTab = 0 },
                    icon = { Icon(Icons.Default.VerifiedUser, contentDescription = null) },
                    label = { Text("الفحص", maxLines = 1, fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = currentTab == 1,
                    onClick = { currentTab = 1 },
                    icon = { Icon(Icons.Default.Badge, contentDescription = null) },
                    label = { Text("السجل (${travelers.size})", maxLines = 1, fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = currentTab == 2,
                    onClick = { currentTab = 2 },
                    icon = { Icon(Icons.Default.UploadFile, contentDescription = null) },
                    label = { Text("استيراد ذكي", maxLines = 1, fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = currentTab == 3,
                    onClick = { currentTab = 3 },
                    icon = { Icon(Icons.Default.Assessment, contentDescription = null) },
                    label = { Text("التقارير", maxLines = 1, fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = currentTab == 4,
                    onClick = { currentTab = 4 },
                    icon = { Icon(Icons.Default.Security, contentDescription = null) },
                    label = { Text("الرقابة", maxLines = 1, fontSize = 11.sp) }
                )
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (currentTab) {
                0 -> QuickCheckScreen(
                    dao = dao,
                    onVerify = { passport, name, nationality, expiry, port, agency, visa ->
                        scope.launch {
                            val match = dao.findWatchlistMatch(passport, name)
                            val eval = PassportSecurityEngine.evaluateValidity(expiry, match?.title)
                            dao.insertTraveler(
                                TravelerEntity(
                                    id = UUID.randomUUID().toString(),
                                    fullName = name,
                                    passportNumber = passport,
                                    nationality = nationality,
                                    expiryDate = expiry,
                                    portName = port,
                                    agency = agency,
                                    visaType = visa,
                                    travelAllowed = if (eval.isAllowed) "نعم" else "لا",
                                    vettingResult = eval.statusMessage
                                )
                            )
                            if (match != null) activeAlert = match
                        }
                    }
                )
                1 -> TravelersAndAgenciesScreen(travelers = travelers, agencies = agencies)
                2 -> SmartMultiImportScreen(dao = dao, learnedPatterns = learnedPatterns)
                3 -> RealisticReportsAndModulesScreen(
                    dao = dao,
                    travelers = travelers,
                    agencies = agencies,
                    mofaVisas = mofaVisas,
                    seizures = seizures,
                    foreigners = foreigners,
                    permits = permits,
                    citizenship = citizenshipCases,
                    letters = letters,
                    watchlist = reports
                )
                4 -> WatchlistAndOfficersScreen(
                    reports = reports,
                    officers = officers,
                    onAddReport = { title, targetName, passport ->
                        scope.launch {
                            dao.insertReport(
                                WatchlistReportEntity(
                                    id = UUID.randomUUID().toString(),
                                    title = title,
                                    targetName = targetName,
                                    targetPassportNumber = passport,
                                    description = "تعميم ضبط صادر من منظومة المنافذ"
                                )
                            )
                        }
                    },
                    onAddOfficer = { rank, name, port ->
                        scope.launch {
                            dao.insertOfficer(
                                PortOfficerEntity(
                                    id = UUID.randomUUID().toString(),
                                    rank = rank,
                                    fullName = name,
                                    assignedPort = port,
                                    isDutyOfficer = officers.isEmpty()
                                )
                            )
                        }
                    }
                )
            }
        }
    }

    activeAlert?.let { alert ->
        AlertDialog(
            onDismissRequest = { activeAlert = null },
            containerColor = Color.White,
            icon = { Icon(Icons.Default.GppBad, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(48.dp)) },
            title = { Text("تنبيه أمني عالي الخطورة", color = Color(0xFFDC2626), fontWeight = FontWeight.ExtraBold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("تم رصد تطابق فوري مع قوائم المطلوبين وبلاغات الضبط:", fontWeight = FontWeight.Bold)
                    Text("البلاغ: ${alert.title}")
                    Text("المطلوب: ${alert.targetName}")
                    Text("رقم الجواز: ${alert.targetPassportNumber}")
                    Text("الإجراء: التحفظ الفوري على الوثيقة وإبلاغ العمليات المركزية بصنعاء.", color = Color(0xFFB45309), fontSize = 12.sp)
                }
            },
            confirmButton = {
                Button(
                    onClick = { activeAlert = null; currentTab = 4 },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))
                ) { Text("الانتقال للرقابة والبلاغات") }
            },
            dismissButton = {
                TextButton(onClick = { activeAlert = null }) { Text("إغلاق") }
            }
        )
    }
}

@Composable
fun QuickCheckScreen(
    dao: BorderDao,
    onVerify: (String, String, String, String, String, String, String) -> Unit
) {
    val scope = rememberCoroutineScope()
    var passport by remember { mutableStateOf("") }
    var fullName by remember { mutableStateOf("") }
    var nationality by remember { mutableStateOf("اليمن") }
    var expiryDate by remember { mutableStateOf("2032-01-01") }
    var selectedPort by remember { mutableStateOf(BorderDatabase.YEMEN_PORTS.first()) }
    var agency by remember { mutableStateOf("") }
    var visaType by remember { mutableStateOf("تأشيرة عمل") }
    var lastEval by remember { mutableStateOf<PassportVerificationResult?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Card(shape = RoundedCornerShape(16.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("الفحص الميداني للجوازات والتأشيرات (Offline)", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    OutlinedTextField(value = passport, onValueChange = { passport = it }, label = { Text("رقم الجواز / الهوية") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = fullName, onValueChange = { fullName = it }, label = { Text("الاسم الكامل للمسافر") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = nationality, onValueChange = { nationality = it }, label = { Text("الجنسية") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = agency, onValueChange = { agency = it }, label = { Text("وكالة / مكتب السفر (اختياري)") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = visaType, onValueChange = { visaType = it }, label = { Text("نوع التأشيرة") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = expiryDate, onValueChange = { expiryDate = it }, label = { Text("تاريخ الانتهاء (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = selectedPort, onValueChange = { selectedPort = it }, label = { Text("المنفذ / المركز") }, modifier = Modifier.fillMaxWidth())

                    Button(
                        onClick = {
                            if (passport.isNotBlank() && fullName.isNotBlank()) {
                                scope.launch {
                                    val match = dao.findWatchlistMatch(passport.trim(), fullName.trim())
                                    lastEval = PassportSecurityEngine.evaluateValidity(expiryDate.trim(), match?.title)
                                    onVerify(passport.trim(), fullName.trim(), nationality.trim(), expiryDate.trim(), selectedPort.trim(), agency.trim(), visaType.trim())
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    ) {
                        Icon(Icons.Default.Search, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("فحص وحفظ في السجل المحلي", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        lastEval?.let { res ->
            item {
                val bg = if (res.isAllowed && !res.isExpiringSoon) Color(0xFFECFDF5) else if (res.isExpiringSoon) Color(0xFFFFFBEB) else Color(0xFFFEF2F2)
                Card(colors = CardDefaults.cardColors(containerColor = bg), shape = RoundedCornerShape(16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(res.statusMessage, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun TravelersAndAgenciesScreen(
    travelers: List<TravelerEntity>,
    agencies: List<TravelAgencyEntity>
) {
    var searchQuery by remember { mutableStateOf("") }
    var agencyFilter by remember { mutableStateOf("") }

    val filtered = remember(travelers, searchQuery, agencyFilter) {
        travelers.filter { t ->
            val qMatch = searchQuery.isBlank() || t.fullName.contains(searchQuery, true) || t.passportNumber.contains(searchQuery, true)
            val aMatch = agencyFilter.isBlank() || t.agency == agencyFilter
            qMatch && aMatch
        }.take(250)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("بحث بالاسم أو رقم الجواز") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (agencies.isNotEmpty()) {
            item {
                Text("وكالات السفر المربوطة بالتأشيرات (${agencies.size}):", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Spacer(Modifier.height(6.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(
                        selected = agencyFilter.isEmpty(),
                        onClick = { agencyFilter = "" },
                        label = { Text("الكل", fontSize = 11.sp) }
                    )
                    agencies.take(3).forEach { ag ->
                        FilterChip(
                            selected = agencyFilter == ag.agencyName,
                            onClick = { agencyFilter = if (agencyFilter == ag.agencyName) "" else ag.agencyName },
                            label = { Text("${ag.agencyName} (${ag.linkedVisasCount})", maxLines = 1, fontSize = 11.sp) }
                        )
                    }
                }
            }
        }
        items(filtered) { t ->
            Card(shape = RoundedCornerShape(14.dp)) {
                Column(modifier = Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(t.fullName, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text(
                            if (t.travelAllowed == "نعم") "✓ ${t.status}" else "✕ محظور",
                            color = if (t.travelAllowed == "نعم") Color(0xFF059669) else Color(0xFFDC2626),
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Text("جواز: ${t.passportNumber} · الجنسية: ${t.nationality}", fontSize = 12.sp, color = Color.Gray)
                    if (t.agency.isNotEmpty() || t.visaType.isNotEmpty()) {
                        Text("الوكالة: ${t.agency.ifEmpty { "غير محددة" }} · التأشيرة: ${t.visaType.ifEmpty { "-" }}", fontSize = 12.sp, color = Color(0xFF1E3A5F))
                    }
                    if (t.returnReason.isNotEmpty()) {
                        Text("سبب الإرتجاع: ${t.returnReason}", fontSize = 11.sp, color = Color(0xFFDC2626))
                    }
                    Text("المركز/المنفذ: ${t.portName}", fontSize = 11.sp, color = Color.DarkGray)
                }
            }
        }
    }
}

@Composable
fun SmartMultiImportScreen(
    dao: BorderDao,
    learnedPatterns: List<LearnedPatternEntity>
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var stagedFiles by remember { mutableStateOf<List<StagedImportFile>>(emptyList()) }
    var isProcessing by remember { mutableStateOf(false) }
    var progressPercent by remember { mutableIntStateOf(0) }
    var progressLabel by remember { mutableStateOf("") }
    var batchReport by remember { mutableStateOf<BatchImportReport?>(null) }

    var ruleKeywords by remember { mutableStateOf("") }
    var ruleTarget by remember { mutableStateOf("التأشيرات الصادرة ووكالات السفر") }
    var translateInput by remember { mutableStateOf("") }
    var translatedOutput by remember { mutableStateOf("") }

    val multiPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments()
    ) { uris ->
        if (uris.isNotEmpty()) {
            val inspected = uris.map { SmartImportBrain.inspectUriMetadata(context, it) }
            stagedFiles = (stagedFiles + inspected).distinctBy { it.name + it.sizeBytes }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E3A5F)),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("مركز الاستيراد المتعدد والقارئ الذكي (3000+ سجل بدون تهنيج)", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                        Text("يدعم اختيار عدة ملفات دفعة واحدة، معاينة القائمة وحذف أي ملف قبل المعالجة، ربط وكالات السفر، والتعلم المستمر.", color = Color(0xFFE2E8F0), fontSize = 12.sp)
                        Button(
                            onClick = { multiPicker.launch(arrayOf("*/*")) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706)),
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                        ) {
                            Icon(Icons.Default.NoteAdd, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("اختيار عدة ملفات (CSV / PDF / Excel)", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // مكون FilePreviewList بجانب زر الاستيراد مع حذف ملف واحد
            if (stagedFiles.isNotEmpty()) {
                item {
                    Card(shape = RoundedCornerShape(14.dp)) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text("معاينة الملفات المختارة (FilePreviewList - ${stagedFiles.size})", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                TextButton(onClick = { stagedFiles = emptyList() }) { Text("إفراغ الكل") }
                            }
                            stagedFiles.forEach { file ->
                                Row(
                                    modifier = Modifier.fillMaxWidth().background(Color(0xFFF1F5F9), RoundedCornerShape(10.dp)).padding(horizontal = 10.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                        Icon(
                                            when (file.format) {
                                                "PDF" -> Icons.Default.PictureAsPdf
                                                "CSV", "XLSX", "XLS" -> Icons.Default.TableChart
                                                else -> Icons.Default.Description
                                            },
                                            contentDescription = null,
                                            tint = Color(0xFF1E3A5F)
                                        )
                                        Spacer(Modifier.width(8.dp))
                                        Column {
                                            Text(file.name, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text("${file.format} · ${file.readableSize}", fontSize = 11.sp, color = Color.Gray)
                                        }
                                    }
                                    IconButton(onClick = { stagedFiles = stagedFiles.filterNot { it.id == file.id } }) {
                                        Icon(Icons.Default.DeleteOutline, contentDescription = "حذف الملف", tint = Color(0xFFDC2626))
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (isProcessing) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF))) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(progressLabel, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            LinearProgressIndicator(progress = { progressPercent / 100f }, modifier = Modifier.fillMaxWidth())
                            Text("التقدم: $progressPercent%", fontSize = 12.sp)
                        }
                    }
                }
            }

            batchReport?.let { rep ->
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5)), shape = RoundedCornerShape(14.dp)) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("نتائج التحليل والتلخيص الذكي (${rep.totalRowsImported} سجل)", fontWeight = FontWeight.ExtraBold, color = Color(0xFF065F46))
                            Text("الوكالات المربوطة: ${rep.agenciesLinked} · مطابقات الترقب الأمني: ${rep.watchlistHits}", fontSize = 12.sp)
                            rep.summaries.forEach { s ->
                                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                Text("${s.fileName} -> الوجهة: ${s.primaryDestination} (${s.confidencePercent}%)", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                Text("ملخص عربي: ${s.arabicSummary}", fontSize = 12.sp)
                                Text("EN Summary: ${s.englishSummary}", fontSize = 11.sp, color = Color.DarkGray)
                                if (s.secondaryDestinations.isNotEmpty()) {
                                    Text("وجهات ثانوية مقترحة: ${s.secondaryDestinations.joinToString(" | ")}", fontSize = 11.sp, color = Color(0xFF1E3A5F))
                                }
                            }
                        }
                    }
                }
            }

            // المترجم الفوري المحلي وتعليم القارئ
            item {
                Card(shape = RoundedCornerShape(14.dp)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("المترجم الميداني وتعليم القارئ الذكي (${learnedPatterns.size} قاعدة)", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        OutlinedTextField(
                            value = translateInput,
                            onValueChange = {
                                translateInput = it
                                translatedOutput = SmartImportBrain.translateTermOffline(it)
                            },
                            label = { Text("ترجمة حقل أو مصطلح إنجليزي (مثال: Passport No, Agency)") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        if (translatedOutput.isNotEmpty()) {
                            Text("الترجمة العربية الفورية: $translatedOutput", color = Color(0xFF065F46), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                        HorizontalDivider()
                        OutlinedTextField(
                            value = ruleKeywords,
                            onValueChange = { ruleKeywords = it },
                            label = { Text("كلمات مفتاحية للتوجيه التلقائي (مثال: الجوازات الخارجة، تأشيرة)") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = ruleTarget,
                            onValueChange = { ruleTarget = it },
                            label = { Text("الوجهة المعتمدة") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Button(
                            onClick = {
                                if (ruleKeywords.isNotBlank()) {
                                    scope.launch {
                                        dao.upsertLearnedPattern(
                                            LearnedPatternEntity(
                                                id = "rule_${System.currentTimeMillis()}",
                                                patternType = "instruction",
                                                instructionText = "قاعدة ضابط: $ruleKeywords -> $ruleTarget",
                                                keywordsCsv = ruleKeywords,
                                                targetCategory = ruleTarget,
                                                frequency = 5
                                            )
                                        )
                                        ruleKeywords = ""
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                        ) {
                            Text("تعليم القارئ وحفظ القاعدة محلياً")
                        }
                    }
                }
            }
        }

        // زر التحليل والدمج مثبت في الأسفل دائماً ولا تغطيه البيانات
        if (stagedFiles.isNotEmpty()) {
            Surface(shadowElevation = 8.dp, color = Color.White, modifier = Modifier.fillMaxWidth()) {
                Button(
                    enabled = !isProcessing,
                    onClick = {
                        scope.launch {
                            isProcessing = true
                            batchReport = SmartImportBrain.parseAndImportFilesChunked(
                                context = context,
                                dao = dao,
                                stagedFiles = stagedFiles
                            ) { pct, lbl ->
                                progressPercent = pct
                                progressLabel = lbl
                            }
                            stagedFiles = emptyList()
                            isProcessing = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth().padding(12.dp).heightIn(min = 50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669))
                ) {
                    Icon(Icons.Default.AutoAwesome, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("بدء التحليل الشامل والفرز الذكي (${stagedFiles.size} ملفات)", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun RealisticReportsAndModulesScreen(
    dao: BorderDao,
    travelers: List<TravelerEntity>,
    agencies: List<TravelAgencyEntity>,
    mofaVisas: List<MofaVisaEntity>,
    seizures: List<PassportSeizureEntity>,
    foreigners: List<ForeignerResidentEntity>,
    permits: List<MovementPermitEntity>,
    citizenship: List<CitizenshipCaseEntity>,
    letters: List<CorrespondenceEntity>,
    watchlist: List<WatchlistReportEntity>
) {
    val scope = rememberCoroutineScope()
    val rep = remember(travelers, agencies, mofaVisas, seizures, foreigners, permits, citizenship, letters, watchlist) {
        SmartImportBrain.buildRealisticMonthlyReport(
            travelers, agencies, mofaVisas, seizures, foreigners, permits, citizenship, letters, watchlist
        )
    }

    var showQuickAddSheet by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A))) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("التقرير الشهري التنفيذي الواقعي (10 محاور سيادية)", color = Color(0xFFFCD34D), fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                        Text("محسوب مباشرة من السجلات المحلية · تاريخ: ${rep.generatedDate}", color = Color.White, fontSize = 12.sp)
                    }
                }
            }

            item {
                ReportSectionCard(
                    title = "1. التأشيرات المستخرجة والوكالات وأسباب الإرتجاع",
                    lines = listOf(
                        "إجمالي التأشيرات والحركات: ${rep.totalMonthlyVisas} (معتمدة: ${rep.approvedVisas} | مرتجعة: ${rep.returnedVisas})",
                        "الوكالات المربوطة: ${rep.agencyStats.size} وكالة",
                        "أبرز الوكالات: ${rep.agencyStats.take(3).joinToString("، ") { "${it.agencyName}(${it.linkedVisasCount})" }.ifEmpty { "لا توجد وكالات مسجلة" }}",
                        "أسباب الإرتجاع: ${rep.topReturnReasons.joinToString("، ") { "${it.first}(${it.second})" }.ifEmpty { "لا يوجد مرتجع" }}"
                    )
                )
            }
            item {
                ReportSectionCard(
                    title = "2. إحصائية الجنسيات",
                    lines = listOf(
                        if (rep.nationalitiesBreakdown.isEmpty()) "لا توجد جنسيات مسجلة"
                        else rep.nationalitiesBreakdown.joinToString(" | ") { "${it.first}: ${it.second}" }
                    )
                )
            }
            item {
                ReportSectionCard(
                    title = "3. العمال الأجانب والوافدين",
                    lines = listOf("إجمالي المقيمين والعمال المسجلين: ${rep.foreignersTotal} · السارية إقاماتهم: ${rep.activeForeigners}")
                )
            }
            item {
                ReportSectionCard(
                    title = "4. المنظمات ورحلات الطيران (الخارجية)",
                    lines = listOf("طلبات تسهيلات: ${rep.mofaRequestsTotal} · المنظمات: ${rep.organizationsCount} · كشوف الرحلات: ${rep.flightManifestsCount}")
                )
            }
            item {
                ReportSectionCard(
                    title = "5. طلبات الجنسية والزواج وأبناء اليمنيات",
                    lines = listOf("إجمالي الطلبات: ${rep.citizenshipTotal} · منها طلبات زواج من أجنبية: ${rep.marriageCasesCount}")
                )
            }
            item {
                ReportSectionCard(
                    title = "6. الخطابات الصادرة والواردة وملخصاتها",
                    lines = listOf(
                        "الصادرة: ${rep.outgoingLettersCount} · الواردة: ${rep.incomingLettersCount}",
                        letters.take(2).joinToString(" | ") { "${it.direction}: ${it.subject}" }.ifEmpty { "لا توجد مراسلات مضافة" }
                    )
                )
            }
            item {
                ReportSectionCard(
                    title = "7 & 8 & 9. الجوازات المضبوطة والمباينة والتسليم",
                    lines = listOf(
                        "7. الجوازات المضبوطة (قيد الإجراء): ${rep.seizedPassportsCount}",
                        "8. المباينة الأمنية ومطابقات قوائم الترقب: ${rep.securityDiscrepanciesCount} (بلاغات نشطة: ${rep.activeWatchlistReports})",
                        "9. الجوازات التي تم تسليمها للمسافرين/الوكالات: ${rep.deliveredPassportsCount}"
                    )
                )
            }
            item {
                ReportSectionCard(
                    title = "10. تصاريح التنقل والأماكن المصرح بها",
                    lines = listOf(
                        "عدد التصاريح: ${rep.movementPermitsCount} · إجمالي المسافرين والمرافقين: ${rep.movementPassengersTotal}",
                        "أبرز الأماكن وخطوط السير: ${rep.topPermitPlaces.joinToString("، ") { "${it.first}(${it.second})" }.ifEmpty { "لا توجد تصاريح مضافة" }}"
                    )
                )
            }
        }

        Surface(shadowElevation = 6.dp, color = Color.White, modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = { showQuickAddSheet = true },
                modifier = Modifier.fillMaxWidth().padding(12.dp).heightIn(min = 48.dp)
            ) {
                Icon(Icons.Default.AddCircleOutline, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("تسجيل قيد إداري (ضبط / تصريح / خطاب / وافد)", fontWeight = FontWeight.Bold)
            }
        }
    }

    if (showQuickAddSheet) {
        var modType by remember { mutableStateOf("ضبط جواز") }
        var fieldA by remember { mutableStateOf("") }
        var fieldB by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showQuickAddSheet = false },
            title = { Text("إدراج قيد سريع للوحدات الإدارية") },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("ضبط جواز", "تسليم جواز", "تصريح تنقل", "خطاب").forEach { t ->
                            FilterChip(selected = modType == t, onClick = { modType = t }, label = { Text(t, fontSize = 11.sp) })
                        }
                    }
                    OutlinedTextField(value = fieldA, onValueChange = { fieldA = it }, label = { Text(if (modType == "تصريح تنقل") "الوفد / الجهة" else if (modType == "خطاب") "موضوع الخطاب" else "اسم صاحب الجواز") })
                    OutlinedTextField(value = fieldB, onValueChange = { fieldB = it }, label = { Text(if (modType == "تصريح تنقل") "الأماكن المصرح بها" else if (modType == "خطاب") "الملخص" else "رقم الجواز / السبب") })
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (fieldA.isNotBlank()) {
                        scope.launch {
                            when (modType) {
                                "ضبط جواز", "تسليم جواز" -> dao.insertSeizure(
                                    PassportSeizureEntity(
                                        id = UUID.randomUUID().toString(),
                                        recordNumber = "SZ-${System.currentTimeMillis().toString().takeLast(4)}",
                                        travelerName = fieldA,
                                        passportNumber = fieldB,
                                        seizurePort = "المركز الرئيسي - صنعاء",
                                        reason = if (modType == "تسليم جواز") "مكتمل الإجراءات" else "مباينة / فحص",
                                        status = if (modType == "تسليم جواز") "تم التسليم" else "جديد",
                                        deliveredAt = if (modType == "تسليم جواز") LocalDate.now().toString() else ""
                                    )
                                )
                                "تصريح تنقل" -> dao.insertPermit(
                                    MovementPermitEntity(
                                        id = UUID.randomUUID().toString(),
                                        permitCode = "PRM-${System.currentTimeMillis().toString().takeLast(4)}",
                                        delegationName = fieldA,
                                        authorizedRoute = fieldB.ifEmpty { "صنعاء - الحديدة" },
                                        accommodationPlace = fieldB.ifEmpty { "صنعاء" },
                                        validFrom = LocalDate.now().toString(),
                                        validTo = LocalDate.now().plusDays(14).toString()
                                    )
                                )
                                else -> dao.insertCorrespondence(
                                    CorrespondenceEntity(
                                        id = UUID.randomUUID().toString(),
                                        referenceNumber = "MSG-${System.currentTimeMillis().toString().takeLast(4)}",
                                        direction = "وارد",
                                        letterType = "مذكرة رسمية",
                                        subject = fieldA,
                                        summary = fieldB,
                                        senderEntity = "جهة خارجية",
                                        recipientEntity = "مصلحة الهجرة والجوازات",
                                        gregorianDate = LocalDate.now().toString()
                                    )
                                )
                            }
                            showQuickAddSheet = false
                        }
                    }
                }) { Text("حفظ القيد") }
            },
            dismissButton = { TextButton(onClick = { showQuickAddSheet = false }) { Text("إلغاء") } }
        )
    }
}

@Composable
private fun ReportSectionCard(title: String, lines: List<String>) {
    Card(shape = RoundedCornerShape(14.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontWeight = FontWeight.Bold, color = Color(0xFF1E3A5F), fontSize = 14.sp)
            lines.forEach { Text("• $it", fontSize = 12.sp, color = Color(0xFF334155)) }
        }
    }
}

@Composable
fun WatchlistAndOfficersScreen(
    reports: List<WatchlistReportEntity>,
    officers: List<PortOfficerEntity>,
    onAddReport: (String, String, String) -> Unit,
    onAddOfficer: (String, String, String) -> Unit
) {
    var subTab by remember { mutableIntStateOf(0) }
    var title by remember { mutableStateOf("") }
    var targetName by remember { mutableStateOf("") }
    var targetPass by remember { mutableStateOf("") }

    var offRank by remember { mutableStateOf("نقيب") }
    var offName by remember { mutableStateOf("") }
    var offPort by remember { mutableStateOf(BorderDatabase.YEMEN_PORTS.first()) }

    Column(modifier = Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { subTab = 0 },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = if (subTab == 0) Color(0xFFDC2626) else Color.Gray)
            ) { Text("البلاغات (${reports.size})") }
            Button(
                onClick = { subTab = 1 },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = if (subTab == 1) Color(0xFF1E3A5F) else Color.Gray)
            ) { Text("الضباط (${officers.size})") }
        }

        LazyColumn(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (subTab == 0) {
                item {
                    Card {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("عنوان بلاغ الضبط") }, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(value = targetName, onValueChange = { targetName = it }, label = { Text("اسم المطلوب") }, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(value = targetPass, onValueChange = { targetPass = it }, label = { Text("رقم الجواز") }, modifier = Modifier.fillMaxWidth())
                            Button(
                                onClick = {
                                    if (title.isNotBlank()) {
                                        onAddReport(title.trim(), targetName.trim(), targetPass.trim())
                                        title = ""; targetName = ""; targetPass = ""
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            ) { Text("إضافة لقائمة الترقب") }
                        }
                    }
                }
                items(reports) { r ->
                    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2))) {
                        Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                            Text(r.title, fontWeight = FontWeight.Bold, color = Color(0xFF991B1B))
                            Text("${r.targetName} | جواز: ${r.targetPassportNumber}", fontSize = 12.sp)
                        }
                    }
                }
            } else {
                item {
                    Card {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(value = offRank, onValueChange = { offRank = it }, label = { Text("الرتبة") }, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(value = offName, onValueChange = { offName = it }, label = { Text("اسم الضابط الكامل") }, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(value = offPort, onValueChange = { offPort = it }, label = { Text("المنفذ") }, modifier = Modifier.fillMaxWidth())
                            Button(
                                onClick = {
                                    if (offName.isNotBlank()) {
                                        onAddOfficer(offRank.trim(), offName.trim(), offPort.trim())
                                        offName = ""
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            ) { Text("حفظ الضابط") }
                        }
                    }
                }
                items(officers) { off ->
                    Card {
                        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text("${off.rank}/ ${off.fullName}", fontWeight = FontWeight.Bold)
                                Text(off.assignedPort, fontSize = 12.sp, color = Color.Gray)
                            }
                            if (off.isDutyOfficer) {
                                Box(modifier = Modifier.background(Color(0xFF059669), RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                                    Text("مناوب", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
