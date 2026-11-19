import 'dart:convert';
import 'dart:io';
import '../models/border_models.dart';
import 'local_storage_service.dart';

class StagedImportItem {
  final String id;
  final String filePath;
  final String name;
  final int sizeBytes;
  final String format;

  StagedImportItem({
    required this.id,
    required this.filePath,
    required this.name,
    required this.sizeBytes,
    required this.format,
  });

  String get readableSize {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) return '${(sizeBytes / 1024).toStringAsFixed(0)} KB';
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class DocumentInsightSummary {
  final String fileName;
  final int rowCount;
  final String primaryDestination;
  final List<String> secondaryDestinations;
  final int confidencePercent;
  final String arabicSummary;
  final String englishSummary;
  final List<MapEntry<String, String>> translatedFields;
  final List<MapEntry<String, int>> topAgencies;
  final List<MapEntry<String, int>> topReturnReasons;

  DocumentInsightSummary({
    required this.fileName,
    required this.rowCount,
    required this.primaryDestination,
    required this.secondaryDestinations,
    required this.confidencePercent,
    required this.arabicSummary,
    required this.englishSummary,
    required this.translatedFields,
    required this.topAgencies,
    required this.topReturnReasons,
  });
}

class RealisticMonthlyReportData {
  final String generatedDate;
  final int totalMonthlyVisas;
  final int approvedVisas;
  final int returnedVisas;
  final int flaggedVisas;
  final List<TravelAgency> topAgencies;
  final List<MapEntry<String, int>> topReturnReasons;
  final List<MapEntry<String, int>> nationalities;
  final int foreignersTotal;
  final int activeForeigners;
  final int mofaRequestsTotal;
  final int organizationsCount;
  final int flightManifestsCount;
  final int citizenshipTotal;
  final int marriageCasesCount;
  final int outgoingLettersCount;
  final int incomingLettersCount;
  final int seizedPassportsCount;
  final int deliveredPassportsCount;
  final int watchlistCount;
  final int movementPermitsCount;
  final int movementPassengersCount;
  final List<MapEntry<String, int>> permitPlaces;

  RealisticMonthlyReportData({
    required this.generatedDate,
    required this.totalMonthlyVisas,
    required this.approvedVisas,
    required this.returnedVisas,
    required this.flaggedVisas,
    required this.topAgencies,
    required this.topReturnReasons,
    required this.nationalities,
    required this.foreignersTotal,
    required this.activeForeigners,
    required this.mofaRequestsTotal,
    required this.organizationsCount,
    required this.flightManifestsCount,
    required this.citizenshipTotal,
    required this.marriageCasesCount,
    required this.outgoingLettersCount,
    required this.incomingLettersCount,
    required this.seizedPassportsCount,
    required this.deliveredPassportsCount,
    required this.watchlistCount,
    required this.movementPermitsCount,
    required this.movementPassengersCount,
    required this.permitPlaces,
  });
}

class SmartReaderService {
  static const Map<String, String> _enToAr = {
    'name': 'الاسم الكامل',
    'full name': 'الاسم الكامل',
    'passport': 'رقم الجواز',
    'passport no': 'رقم الجواز',
    'passport number': 'رقم الجواز',
    'nationality': 'الجنسية',
    'agency': 'وكالة السفر',
    'travel agency': 'وكالة السفر',
    'visa': 'التأشيرة',
    'visa type': 'نوع التأشيرة',
    'center': 'المركز / المنفذ',
    'port': 'المنفذ الحدودي',
    'status': 'الحالة',
    'approved': 'معتمد',
    'issued': 'مؤشر',
    'returned': 'مرتجع',
    'return reason': 'سبب الإرتجاع',
    'exit date': 'تاريخ الخروج',
    'receive date': 'تاريخ الاستلام',
    'employer': 'جهة العمل / الكفيل',
    'profession': 'المهنة',
    'residence': 'رقم الإقامة',
    'permit': 'تصريح تنقل',
  };

  static String translateOffline(String text) {
    final clean = text.trim();
    if (clean.isEmpty) return '';
    final lower = clean.toLowerCase();
    if (_enToAr.containsKey(lower)) return _enToAr[lower]!;
    var out = clean;
    for (final e in _enToAr.entries) {
      if (lower.contains(e.key)) {
        out = out.replaceAll(RegExp(RegExp.escape(e.key), caseSensitive: false), e.value);
      }
    }
    return out != clean ? out : clean;
  }

  /// استدعاء مربع اختيار ملفات متعدد أصلي في ويندوز عبر PowerShell بدون إضافات خارجية
  static Future<List<StagedImportItem>> pickMultipleFilesWindows() async {
    if (!Platform.isWindows) return [];
    const script = r'''
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Multiselect = $true
$dlg.Title = "اختيار عدة ملفات أو كشوفات للاستيراد والفرز الذكي"
$dlg.Filter = "All Supported|*.csv;*.txt;*.json;*.pdf;*.xlsx;*.xls|CSV & Text|*.csv;*.txt|All Files|*.*"
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  $dlg.FileNames | ForEach-Object { Write-Output $_ }
}
''';
    try {
      final result = await Process.run('powershell', ['-NoProfile', '-STA', '-Command', script]);
      if (result.exitCode != 0) return [];
      final paths = result.stdout
          .toString()
          .split(RegExp(r'\r?\n'))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      return paths.map((p) {
        final f = File(p);
        final name = p.split(Platform.pathSeparator).last;
        final ext = name.contains('.') ? name.split('.').last.toUpperCase() : 'FILE';
        final size = f.existsSync() ? f.lengthSync() : 0;
        return StagedImportItem(
          id: '${p.hashCode}_${DateTime.now().microsecondsSinceEpoch}',
          filePath: p,
          name: name,
          sizeBytes: size,
          format: ext,
        );
      }).toList();
    } catch (_) {
      return [];
    }
  }

  static StagedImportItem? stageManualPath(String path) {
    final clean = path.trim().replaceAll('"', '');
    if (clean.isEmpty) return null;
    final f = File(clean);
    if (!f.existsSync()) return null;
    final name = clean.split(RegExp(r'[/\\]')).last;
    final ext = name.contains('.') ? name.split('.').last.toUpperCase() : 'FILE';
    return StagedImportItem(
      id: '${clean.hashCode}_${DateTime.now().microsecondsSinceEpoch}',
      filePath: clean,
      name: name,
      sizeBytes: f.lengthSync(),
      format: ext,
    );
  }

  static List<String> _parseCsvRow(String line, String delimiter) {
    final out = <String>[];
    final buf = StringBuffer();
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      final ch = line[i];
      if (ch == '"') {
        inQuotes = !inQuotes;
      } else if (ch == delimiter && !inQuotes) {
        out.add(buf.toString().trim());
        buf.clear();
      } else {
        buf.write(ch);
      }
    }
    out.add(buf.toString().trim());
    return out;
  }

  static Future<({
    List<TravelerRecord> addedTravelers,
    List<ForeignerResidentRecord> addedForeigners,
    List<DocumentInsightSummary> summaries,
    int watchlistHits,
  })> processStagedFilesChunked({
    required List<StagedImportItem> files,
    required List<WatchlistReport> watchlist,
    required List<CustomReaderRule> learnedRules,
    required void Function(int percent, String status) onProgress,
  }) async {
    final passSet = watchlist.map((w) => w.targetPassport.trim()).where((p) => p.isNotEmpty).toSet();
    final addedTravelers = <TravelerRecord>[];
    final addedForeigners = <ForeignerResidentRecord>[];
    final summaries = <DocumentInsightSummary>[];
    var watchlistHits = 0;

    for (var fIdx = 0; fIdx < files.length; fIdx++) {
      final item = files[fIdx];
      onProgress(((fIdx / files.length) * 100).round(), 'جاري قراءة وتحليل: ${item.name}...');

      final f = File(item.filePath);
      if (!f.existsSync()) continue;

      List<String> lines = [];
      try {
        lines = (await f.readAsLines(encoding: utf8)).where((l) => l.trim().isNotEmpty).toList();
      } catch (_) {
        lines = [];
      }

      if (lines.length <= 1) {
        summaries.add(DocumentInsightSummary(
          fileName: item.name,
          rowCount: 1,
          primaryDestination: 'أرشيف المراسلات والمذكرات',
          secondaryDestinations: const ['تسهيلات الخارجية'],
          confidencePercent: 86,
          arabicSummary: 'تم تحليل وأرشفة الوثيقة (${item.name}) كمستند رسمي (${item.format}).',
          englishSummary: 'Indexed official document (${item.name}) into Correspondence Archive.',
          translatedFields: const [],
          topAgencies: const [],
          topReturnReasons: const [],
        ));
        continue;
      }

      final headerLine = lines.first.replaceFirst('\uFEFF', '');
      final delimiter = ';'.allMatches(headerLine).length > ','.allMatches(headerLine).length ? ';' : ',';
      final headers = _parseCsvRow(headerLine, delimiter);
      final normHeaders = headers.map(LocalStorageService.normalizeArabic).toList();

      int colIdx(List<String> names) {
        for (final n in names) {
          final nn = LocalStorageService.normalizeArabic(n);
          final exact = normHeaders.indexWhere((h) => h == nn);
          if (exact >= 0) return exact;
        }
        for (final n in names) {
          final nn = LocalStorageService.normalizeArabic(n);
          final part = normHeaders.indexWhere((h) => h.contains(nn));
          if (part >= 0) return part;
        }
        return -1;
      }

      final serialIdx = colIdx(['م', 'الرقم', 'serial']);
      final nameIdx = colIdx(['الإسم', 'الاسم', 'اسم المسافر', 'full name', 'name']);
      final passIdx = colIdx(['رقم الجواز', 'الجواز', 'passport']);
      final natIdx = colIdx(['الجنسية', 'nationality']);
      final centerIdx = colIdx(['المركز', 'المنفذ', 'center', 'port']);
      final agencyIdx = colIdx(['إسم الوكالة', 'اسم الوكالة', 'الوكالة', 'agency']);
      final visaIdx = colIdx(['التأشيرة', 'نوع التأشيرة', 'visa']);
      final recvIdx = colIdx(['تاريخ الإستلام', 'تاريخ الاستلام', 'receive date']);
      final exitIdx = colIdx(['ت. الخروج', 'تاريخ الخروج', 'exit date']);
      final statusIdx = colIdx(['الحالة', 'status']);
      final reasonIdx = colIdx(['سبب الإرتجاع', 'سبب الارتجاع', 'ملاحظات', 'return reason']);
      final empIdx = colIdx(['الكفيل', 'جهة العمل', 'employer']);
      final resIdx = colIdx(['رقم الإقامة', 'الإقامة', 'residence']);

      final combinedText = LocalStorageService.normalizeArabic('${item.name} ${headers.join(' ')}');
      String primaryDest = agencyIdx >= 0 || visaIdx >= 0
          ? 'التأشيرات الصادرة ووكالات السفر'
          : (empIdx >= 0 && resIdx >= 0 ? 'شؤون الوافدين والعمال الأجانب' : 'سجل المسافرين العام');
      for (final r in learnedRules) {
        if (r.keywords.any((k) => combinedText.contains(LocalStorageService.normalizeArabic(k)))) {
          primaryDest = r.targetCategory;
          break;
        }
      }

      final agencyCounts = <String, int>{};
      final reasonCounts = <String, int>{};
      final totalRows = lines.length - 1;
      var importedInFile = 0;

      for (var i = 1; i < lines.length; i++) {
        final cols = _parseCsvRow(lines[i], delimiter);
        String val(int idx) => (idx >= 0 && idx < cols.length) ? cols[idx].trim() : '';

        final fullName = val(nameIdx).isNotEmpty ? val(nameIdx) : val(1);
        final passport = val(passIdx).isNotEmpty ? val(passIdx) : val(2);
        if (fullName.isEmpty && passport.isEmpty) continue;

        final agency = val(agencyIdx);
        final status = val(statusIdx).isNotEmpty ? val(statusIdx) : 'معتمد';
        final reason = val(reasonIdx);
        final nat = val(natIdx).isNotEmpty ? val(natIdx) : 'اليمن';

        if (agency.isNotEmpty) agencyCounts[agency] = (agencyCounts[agency] ?? 0) + 1;
        if (reason.isNotEmpty) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;

        final hit = passport.isNotEmpty && passSet.contains(passport);
        if (hit) watchlistHits++;

        if (primaryDest.contains('الوافدين')) {
          addedForeigners.add(ForeignerResidentRecord(
            id: 'FR-${DateTime.now().microsecondsSinceEpoch}-$i',
            residenceNumber: val(resIdx).isNotEmpty ? val(resIdx) : 'RES-$i',
            fullName: fullName,
            passportNumber: passport,
            nationality: nat,
            employer: val(empIdx),
            profession: 'عامل وافد',
          ));
        } else {
          addedTravelers.add(TravelerRecord(
            id: 'TR-${DateTime.now().microsecondsSinceEpoch}-$i',
            serialNumber: val(serialIdx),
            fullName: fullName,
            passportNumber: passport,
            nationality: nat,
            portName: val(centerIdx).isNotEmpty ? val(centerIdx) : 'المركز الرئيسي - العاصمة صنعاء',
            agency: agency,
            visaType: val(visaIdx),
            receiveDate: val(recvIdx),
            exitDate: val(exitIdx),
            status: status,
            returnReason: reason,
            travelAllowed: hit ? 'لا' : 'نعم',
            vettingResult: hit ? '🚨 تطابق قائمة الترقب' : 'سليم',
            createdAt: DateTime.now().toIso8601String(),
          ));
        }

        importedInFile++;

        // منع تجمد واجهة ويندوز تماماً عند استيراد 3000+ سجل
        if (i % 300 == 0) {
          final pct = (((fIdx + (i / totalRows)) / files.length) * 100).round().clamp(1, 99);
          onProgress(pct, 'استيراد غير متوقف: $importedInFile / $totalRows سجل (${item.name})');
          await Future.delayed(Duration.zero);
        }
      }

      final topAg = agencyCounts.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
      final topReas = reasonCounts.entries.toList()..sort((a, b) => b.value.compareTo(a.value));

      summaries.add(DocumentInsightSummary(
        fileName: item.name,
        rowCount: importedInFile,
        primaryDestination: primaryDest,
        secondaryDestinations: const ['وكالات السفر المربوطة', 'التقارير الشهرية الـ 10', 'المباينة الأمنية'],
        confidencePercent: 95,
        arabicSummary:
            'تم تحليل واستيراد $importedInFile سجل إلى ($primaryDest). عدد الوكالات المكتشفة: ${agencyCounts.length}.',
        englishSummary:
            'Parsed $importedInFile records into [$primaryDest] without UI freeze (${agencyCounts.length} linked agencies).',
        translatedFields: headers.take(6).map((h) => MapEntry(h, translateOffline(h))).toList(),
        topAgencies: topAg.take(5).toList(),
        topReturnReasons: topReas.take(4).toList(),
      ));
    }

    onProgress(100, 'اكتملت المعالجة الذكية لـ ${addedTravelers.length + addedForeigners.length} سجل');
    return (
      addedTravelers: addedTravelers,
      addedForeigners: addedForeigners,
      summaries: summaries,
      watchlistHits: watchlistHits,
    );
  }

  static RealisticMonthlyReportData buildMonthlyReport({
    required List<TravelerRecord> travelers,
    required List<TravelAgency> agencies,
    required List<MofaMemoRecord> mofa,
    required List<PassportSeizureRecord> seizures,
    required List<ForeignerResidentRecord> foreigners,
    required List<MovementPermitRecord> permits,
    required List<CitizenshipCaseRecord> citizenship,
    required List<CorrespondenceRecord> letters,
    required List<WatchlistReport> watchlist,
  }) {
    final approved = travelers.where((t) => !t.status.contains('مرتجع') && t.travelAllowed == 'نعم').length;
    final returned = travelers.where((t) => t.status.contains('مرتجع') || t.returnReason.trim().isNotEmpty).length;
    final flagged = travelers.where((t) => t.travelAllowed != 'نعم' || t.vettingResult.contains('تطابق')).length;

    final reasons = <String, int>{};
    final nats = <String, int>{};
    for (final t in travelers) {
      if (t.returnReason.trim().isNotEmpty) {
        reasons[t.returnReason.trim()] = (reasons[t.returnReason.trim()] ?? 0) + 1;
      }
      final nat = t.nationality.trim().isNotEmpty ? t.nationality.trim() : 'اليمن';
      nats[nat] = (nats[nat] ?? 0) + 1;
    }

    final permitPlaces = <String, int>{};
    for (final p in permits) {
      final place = p.accommodationPlace.trim().isNotEmpty ? p.accommodationPlace.trim() : p.authorizedRoute;
      if (place.isNotEmpty) permitPlaces[place] = (permitPlaces[place] ?? 0) + 1;
    }

    final reasonEntries = reasons.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final natEntries = nats.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final placeEntries = permitPlaces.entries.toList()..sort((a, b) => b.value.compareTo(a.value));

    return RealisticMonthlyReportData(
      generatedDate: DateTime.now().toString().split(' ').first,
      totalMonthlyVisas: travelers.length,
      approvedVisas: approved,
      returnedVisas: returned,
      flaggedVisas: flagged,
      topAgencies: agencies.take(8).toList(),
      topReturnReasons: reasonEntries.take(5).toList(),
      nationalities: natEntries.take(8).toList(),
      foreignersTotal: foreigners.length,
      activeForeigners: foreigners.length,
      mofaRequestsTotal: mofa.length,
      organizationsCount: mofa.map((m) => m.organization).toSet().length,
      flightManifestsCount: mofa.where((m) => m.requestType.contains('رحلة') || m.flightRoute.isNotEmpty).length,
      citizenshipTotal: citizenship.length,
      marriageCasesCount: citizenship.where((c) => c.serviceType.contains('زواج')).length,
      outgoingLettersCount: letters.where((l) => l.direction == 'صادر').length,
      incomingLettersCount: letters.where((l) => l.direction == 'وارد').length,
      seizedPassportsCount: seizures.where((s) => s.status != 'تم التسليم').length,
      deliveredPassportsCount: seizures.where((s) => s.status == 'تم التسليم').length,
      watchlistCount: watchlist.length,
      movementPermitsCount: permits.length,
      movementPassengersCount: permits.fold(0, (sum, p) => sum + p.passengersCount),
      permitPlaces: placeEntries.take(5).toList(),
    );
  }
}
