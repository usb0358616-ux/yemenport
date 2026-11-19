import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'models/border_models.dart';
import 'services/local_storage_service.dart';
import 'services/smart_reader_service.dart';

void main() {
  runApp(const YemenBordersWindowsApp());
}

class YemenBordersWindowsApp extends StatelessWidget {
  const YemenBordersWindowsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'نظام المنافذ والجوازات الذكي - ويندوز',
      locale: const Locale('ar', 'YE'),
      supportedLocales: const [Locale('ar', 'YE'), Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1E3A5F),
          primary: const Color(0xFF1E3A5F),
          secondary: const Color(0xFFD97706),
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
      home: const DesktopShell(),
    );
  }
}

class DesktopShell extends StatefulWidget {
  const DesktopShell({super.key});

  @override
  State<DesktopShell> createState() => _DesktopShellState();
}

class _DesktopShellState extends State<DesktopShell> {
  int _selectedIndex = 0;
  late List<TravelerRecord> _travelers;
  late List<TravelAgency> _agencies;
  late List<MofaMemoRecord> _mofa;
  late List<PassportSeizureRecord> _seizures;
  late List<ForeignerResidentRecord> _foreigners;
  late List<MovementPermitRecord> _permits;
  late List<CitizenshipCaseRecord> _citizenship;
  late List<CorrespondenceRecord> _letters;
  late List<CustomReaderRule> _rules;
  late List<WatchlistReport> _reports;
  late List<PortOfficer> _officers;

  @override
  void initState() {
    super.initState();
    _travelers = LocalStorageService.loadTravelers();
    _agencies = LocalStorageService.syncTravelAgenciesWithVisas(_travelers, LocalStorageService.loadAgencies());
    _mofa = LocalStorageService.loadMofaMemos();
    _seizures = LocalStorageService.loadSeizures();
    _foreigners = LocalStorageService.loadForeigners();
    _permits = LocalStorageService.loadPermits();
    _citizenship = LocalStorageService.loadCitizenship();
    _letters = LocalStorageService.loadCorrespondence();
    _rules = LocalStorageService.loadReaderRules();
    _reports = LocalStorageService.loadReports();
    _officers = LocalStorageService.loadOfficers();
  }

  void _showWatchlistPopup(WatchlistReport report, String travelerName, String passportNo) {
    showDialog(
      context: context,
      builder: (ctx) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: Color(0xFFDC2626), width: 2),
          ),
          title: const Row(
            children: [
              Icon(Icons.gpp_bad, color: Color(0xFFDC2626), size: 30),
              SizedBox(width: 10),
              Flexible(
                child: Text(
                  'تنبيه أمني: تطابق مع المطلوبين!',
                  style: TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('المسافر: $travelerName', style: const TextStyle(fontWeight: FontWeight.bold)),
                Text('رقم الوثيقة: $passportNo'),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text('البلاغ المطابق: ${report.title}\nالإجراء: التحفظ الفوري وإبلاغ المركز الرئيسي بصنعاء.'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إغلاق')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
              onPressed: () {
                Navigator.pop(ctx);
                setState(() => _selectedIndex = 4);
              },
              child: const Text('الرقابة وبلاغات الضبط'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isWide = constraints.maxWidth >= 820;
          final bodyContent = Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                color: Colors.white,
                child: Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('نظام المنافذ والجوازات الذكي - محطة العمل المكتبية (Windows)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        Text('الجمهورية اليمنية · المركز الرئيسي - العاصمة صنعاء (تشغيل محلي كامل)', style: TextStyle(fontSize: 12, color: Colors.blueGrey)),
                      ],
                    ),
                    Chip(label: Text('السجلات: ${_travelers.length} | الوكالات: ${_agencies.length}'), backgroundColor: const Color(0xFFECFDF5)),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: IndexedStack(
                  index: _selectedIndex,
                  children: [
                    _PassportVerifyView(
                      reports: _reports,
                      onSaveTraveler: (record, matched) {
                        setState(() {
                          _travelers = [record, ..._travelers];
                          _agencies = LocalStorageService.syncTravelAgenciesWithVisas(_travelers, _agencies);
                        });
                        LocalStorageService.saveTravelers(_travelers);
                        if (matched != null) {
                          _showWatchlistPopup(matched, record.fullName, record.passportNumber);
                        }
                      },
                    ),
                    _TravelersAndAgenciesView(travelers: _travelers, agencies: _agencies),
                    _SmartMultiImportView(
                      watchlist: _reports,
                      rules: _rules,
                      onBatchImported: (newTravelers, newForeigners) {
                        setState(() {
                          _travelers = [...newTravelers, ..._travelers];
                          _foreigners = [...newForeigners, ..._foreigners];
                          _agencies = LocalStorageService.syncTravelAgenciesWithVisas(_travelers, _agencies);
                        });
                        LocalStorageService.saveTravelers(_travelers);
                        LocalStorageService.saveForeigners(_foreigners);
                      },
                      onLearnRule: (rule) {
                        setState(() => _rules = [rule, ..._rules]);
                        LocalStorageService.saveReaderRules(_rules);
                      },
                    ),
                    _RealisticReportsView(
                      travelers: _travelers,
                      agencies: _agencies,
                      mofa: _mofa,
                      seizures: _seizures,
                      foreigners: _foreigners,
                      permits: _permits,
                      citizenship: _citizenship,
                      letters: _letters,
                      watchlist: _reports,
                      onQuickAddModuleRecord: (type, a, b) {
                        setState(() {
                          if (type == 'ضبط جواز' || type == 'تسليم جواز') {
                            _seizures = [
                              PassportSeizureRecord(
                                id: 'SZ-${DateTime.now().millisecondsSinceEpoch}',
                                recordNumber: 'SZ-${DateTime.now().millisecond}',
                                travelerName: a,
                                passportNumber: b,
                                seizurePort: 'المركز الرئيسي - صنعاء',
                                reason: type == 'تسليم جواز' ? 'سليم وتم التسليم' : 'مباينة أمنية',
                                status: type == 'تسليم جواز' ? 'تم التسليم' : 'مضبوط',
                                createdAt: DateTime.now().toIso8601String(),
                              ),
                              ..._seizures,
                            ];
                            LocalStorageService.saveSeizures(_seizures);
                          } else if (type == 'تصريح تنقل') {
                            _permits = [
                              MovementPermitRecord(
                                id: 'PRM-${DateTime.now().millisecondsSinceEpoch}',
                                permitCode: 'PRM-${DateTime.now().millisecond}',
                                delegationName: a,
                                authorizedRoute: b,
                                accommodationPlace: b,
                              ),
                              ..._permits,
                            ];
                            LocalStorageService.savePermits(_permits);
                          } else {
                            _letters = [
                              CorrespondenceRecord(
                                id: 'MSG-${DateTime.now().millisecondsSinceEpoch}',
                                referenceNumber: 'MSG-${DateTime.now().millisecond}',
                                direction: 'وارد',
                                subject: a,
                                summary: b,
                                dateStr: DateTime.now().toString().split(' ').first,
                              ),
                              ..._letters,
                            ];
                            LocalStorageService.saveCorrespondence(_letters);
                          }
                        });
                      },
                    ),
                    _WatchlistAndOfficersView(
                      reports: _reports,
                      officers: _officers,
                      onAddReport: (r) {
                        setState(() => _reports = [r, ..._reports]);
                        LocalStorageService.saveReports(_reports);
                      },
                      onAddOfficer: (o) {
                        setState(() => _officers = [o, ..._officers]);
                        LocalStorageService.saveOfficers(_officers);
                      },
                    ),
                  ],
                ),
              ),
            ],
          );

          if (!isWide) {
            return Scaffold(
              body: bodyContent,
              bottomNavigationBar: NavigationBar(
                selectedIndex: _selectedIndex,
                onDestinationSelected: (idx) => setState(() => _selectedIndex = idx),
                destinations: const [
                  NavigationDestination(icon: Icon(Icons.verified_user), label: 'الفحص'),
                  NavigationDestination(icon: Icon(Icons.badge), label: 'السجل'),
                  NavigationDestination(icon: Icon(Icons.upload_file), label: 'استيراد'),
                  NavigationDestination(icon: Icon(Icons.assessment), label: 'التقارير'),
                  NavigationDestination(icon: Icon(Icons.security), label: 'الرقابة'),
                ],
              ),
            );
          }

          return Scaffold(
            body: Row(
              children: [
                NavigationRail(
                  extended: constraints.maxWidth > 1050,
                  backgroundColor: const Color(0xFF0F172A),
                  selectedIconTheme: const IconThemeData(color: Color(0xFFFCD34D)),
                  unselectedIconTheme: const IconThemeData(color: Colors.white70),
                  selectedLabelTextStyle: const TextStyle(color: Color(0xFFFCD34D), fontWeight: FontWeight.bold),
                  unselectedLabelTextStyle: const TextStyle(color: Colors.white70),
                  selectedIndex: _selectedIndex,
                  onDestinationSelected: (idx) => setState(() => _selectedIndex = idx),
                  leading: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16, horizontal: 12),
                    child: Column(
                      children: [
                        Icon(Icons.shield, color: Color(0xFFFCD34D), size: 34),
                        SizedBox(height: 6),
                        Text('المركز الرئيسي\nصنعاء', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                  destinations: const [
                    NavigationRailDestination(icon: Icon(Icons.verified_user), label: Text('الفحص والتحقق')),
                    NavigationRailDestination(icon: Icon(Icons.badge), label: Text('السجلات والوكالات')),
                    NavigationRailDestination(icon: Icon(Icons.upload_file), label: Text('الاستيراد والقارئ الذكي')),
                    NavigationRailDestination(icon: Icon(Icons.assessment), label: Text('التقارير الواقعية (10)')),
                    NavigationRailDestination(icon: Icon(Icons.security), label: Text('البلاغات والضباط')),
                  ],
                ),
                Expanded(child: bodyContent),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _PassportVerifyView extends StatefulWidget {
  final List<WatchlistReport> reports;
  final void Function(TravelerRecord, WatchlistReport?) onSaveTraveler;

  const _PassportVerifyView({required this.reports, required this.onSaveTraveler});

  @override
  State<_PassportVerifyView> createState() => _PassportVerifyViewState();
}

class _PassportVerifyViewState extends State<_PassportVerifyView> {
  final _nameCtrl = TextEditingController();
  final _passportCtrl = TextEditingController();
  final _natCtrl = TextEditingController(text: 'اليمن');
  final _agencyCtrl = TextEditingController();
  final _visaCtrl = TextEditingController(text: 'تأشيرة عمل');
  final _expiryCtrl = TextEditingController(text: '2032-01-01');
  String _selectedPort = kYemenSovereignPorts.first;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('إدخال وفحص جواز سفر والتأشيرات', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  SizedBox(width: 280, child: TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'الاسم الكامل للمسافر', border: OutlineInputBorder()))),
                  SizedBox(width: 220, child: TextField(controller: _passportCtrl, decoration: const InputDecoration(labelText: 'رقم الجواز / الهوية', border: OutlineInputBorder()))),
                  SizedBox(width: 180, child: TextField(controller: _natCtrl, decoration: const InputDecoration(labelText: 'الجنسية', border: OutlineInputBorder()))),
                  SizedBox(width: 240, child: TextField(controller: _agencyCtrl, decoration: const InputDecoration(labelText: 'وكالة / مكتب السفر', border: OutlineInputBorder()))),
                  SizedBox(width: 200, child: TextField(controller: _visaCtrl, decoration: const InputDecoration(labelText: 'نوع التأشيرة', border: OutlineInputBorder()))),
                  SizedBox(width: 200, child: TextField(controller: _expiryCtrl, decoration: const InputDecoration(labelText: 'تاريخ الانتهاء (YYYY-MM-DD)', border: OutlineInputBorder()))),
                  SizedBox(
                    width: 280,
                    child: DropdownButtonFormField<String>(
                      value: _selectedPort,
                      decoration: const InputDecoration(labelText: 'المنفذ / المركز', border: OutlineInputBorder()),
                      items: kYemenSovereignPorts.map((p) => DropdownMenuItem(value: p, child: Text(p, overflow: TextOverflow.ellipsis))).toList(),
                      onChanged: (v) => setState(() => _selectedPort = v ?? kYemenSovereignPorts.first),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                icon: const Icon(Icons.verified),
                label: const Text('تحقق فوري من الصلاحية والمطلوبين وحفظ السجل'),
                onPressed: () {
                  if (_nameCtrl.text.trim().isEmpty || _passportCtrl.text.trim().isEmpty) return;
                  final match = LocalStorageService.findMatch(widget.reports, _passportCtrl.text, _nameCtrl.text);
                  final rec = TravelerRecord(
                    id: DateTime.now().millisecondsSinceEpoch.toString(),
                    fullName: _nameCtrl.text.trim(),
                    passportNumber: _passportCtrl.text.trim(),
                    nationality: _natCtrl.text.trim(),
                    agency: _agencyCtrl.text.trim(),
                    visaType: _visaCtrl.text.trim(),
                    expiryDate: _expiryCtrl.text.trim(),
                    portName: _selectedPort,
                    travelAllowed: match == null ? 'نعم' : 'لا',
                    vettingResult: match != null ? 'تطابق: ${match.title}' : 'سليم',
                    createdAt: DateTime.now().toIso8601String(),
                  );
                  widget.onSaveTraveler(rec, match);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(match != null ? 'تحذير أمني: مطلوب للضبط' : 'تم الحفظ والتحقق وربط الوكالة بنجاح')),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TravelersAndAgenciesView extends StatefulWidget {
  final List<TravelerRecord> travelers;
  final List<TravelAgency> agencies;

  const _TravelersAndAgenciesView({required this.travelers, required this.agencies});

  @override
  State<_TravelersAndAgenciesView> createState() => _TravelersAndAgenciesViewState();
}

class _TravelersAndAgenciesViewState extends State<_TravelersAndAgenciesView> {
  String _query = '';
  String _selectedAgency = '';

  @override
  Widget build(BuildContext context) {
    final filtered = widget.travelers.where((t) {
      final qOk = _query.isEmpty || t.fullName.contains(_query) || t.passportNumber.contains(_query);
      final aOk = _selectedAgency.isEmpty || t.agency == _selectedAgency;
      return qOk && aOk;
    }).take(300).toList();

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            decoration: const InputDecoration(
              labelText: 'بحث بالاسم أو رقم الجواز',
              prefixIcon: Icon(Icons.search),
              border: OutlineInputBorder(),
            ),
            onChanged: (v) => setState(() => _query = v.trim()),
          ),
          if (widget.agencies.isNotEmpty) ...[
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  FilterChip(
                    label: Text('الكل (${widget.travelers.length})'),
                    selected: _selectedAgency.isEmpty,
                    onSelected: (_) => setState(() => _selectedAgency = ''),
                  ),
                  const SizedBox(width: 6),
                  ...widget.agencies.take(10).map((ag) => Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: FilterChip(
                          label: Text('${ag.agencyName} (${ag.linkedVisasCount})'),
                          selected: _selectedAgency == ag.agencyName,
                          onSelected: (_) => setState(() => _selectedAgency = _selectedAgency == ag.agencyName ? '' : ag.agencyName),
                        ),
                      )),
                ],
              ),
            ),
          ],
          const SizedBox(height: 10),
          Expanded(
            child: ListView.builder(
              itemCount: filtered.length,
              itemBuilder: (_, i) {
                final t = filtered[i];
                return Card(
                  child: ListTile(
                    title: Text('${t.fullName} (${t.passportNumber})', style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text(
                      '${t.portName} · الوكالة: ${t.agency.isNotEmpty ? t.agency : "غير محددة"} · التأشيرة: ${t.visaType.isNotEmpty ? t.visaType : "-"}${t.returnReason.isNotEmpty ? " · سبب الإرتجاع: ${t.returnReason}" : ""}',
                    ),
                    trailing: Chip(
                      label: Text(t.travelAllowed == 'نعم' ? '✓ ${t.status}' : '✕ محظور'),
                      backgroundColor: t.travelAllowed == 'نعم' ? const Color(0xFFECFDF5) : const Color(0xFFFEF2F2),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _SmartMultiImportView extends StatefulWidget {
  final List<WatchlistReport> watchlist;
  final List<CustomReaderRule> rules;
  final void Function(List<TravelerRecord>, List<ForeignerResidentRecord>) onBatchImported;
  final void Function(CustomReaderRule) onLearnRule;

  const _SmartMultiImportView({
    required this.watchlist,
    required this.rules,
    required this.onBatchImported,
    required this.onLearnRule,
  });

  @override
  State<_SmartMultiImportView> createState() => _SmartMultiImportViewState();
}

class _SmartMultiImportViewState extends State<_SmartMultiImportView> {
  List<StagedImportItem> _staged = [];
  bool _processing = false;
  int _progressPct = 0;
  String _progressText = '';
  List<DocumentInsightSummary> _summaries = [];

  final _manualPathCtrl = TextEditingController();
  final _transCtrl = TextEditingController();
  String _transResult = '';
  final _ruleKwCtrl = TextEditingController();
  String _ruleTarget = 'التأشيرات الصادرة ووكالات السفر';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Card(
                  color: const Color(0xFF1E3A5F),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('مركز الاستيراد المتعدد والقارئ الذكي (3000+ سجل بدون تهنيج)', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 6),
                        const Text('اختيار ملفات متعددة دفعة واحدة، معاينة القائمة وحذف ملف واحد قبل التحليل، ربط الوكالات والتلخيص والترجمة.', style: TextStyle(color: Color(0xFFE2E8F0), fontSize: 12)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 10,
                          runSpacing: 8,
                          children: [
                            FilledButton.icon(
                              style: FilledButton.styleFrom(backgroundColor: const Color(0xFFD97706)),
                              icon: const Icon(Icons.note_add),
                              label: const Text('اختيار عدة ملفات من الجهاز'),
                              onPressed: () async {
                                final picked = await SmartReaderService.pickMultipleFilesWindows();
                                if (picked.isNotEmpty) {
                                  setState(() => _staged = [..._staged, ...picked]);
                                }
                              },
                            ),
                            SizedBox(
                              width: 280,
                              child: TextField(
                                controller: _manualPathCtrl,
                                style: const TextStyle(color: Colors.white),
                                decoration: InputDecoration(
                                  labelText: 'أو لصق مسار ملف إضافي',
                                  labelStyle: const TextStyle(color: Colors.white70),
                                  border: const OutlineInputBorder(),
                                  suffixIcon: IconButton(
                                    icon: const Icon(Icons.add_circle, color: Color(0xFFFCD34D)),
                                    onPressed: () {
                                      final item = SmartReaderService.stageManualPath(_manualPathCtrl.text);
                                      if (item != null) {
                                        setState(() {
                                          _staged = [..._staged, item];
                                          _manualPathCtrl.clear();
                                        });
                                      }
                                    },
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                if (_staged.isNotEmpty)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('معاينة الملفات المختارة (FilePreviewList - ${_staged.length})', style: const TextStyle(fontWeight: FontWeight.bold)),
                              TextButton(onPressed: () => setState(() => _staged = []), child: const Text('إفراغ القائمة')),
                            ],
                          ),
                          const Divider(),
                          ..._staged.map((f) => ListTile(
                                dense: true,
                                leading: Icon(f.format == 'PDF' ? Icons.picture_as_pdf : Icons.table_chart, color: const Color(0xFF1E3A5F)),
                                title: Text(f.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                                subtitle: Text('${f.format} · ${f.readableSize}'),
                                trailing: IconButton(
                                  icon: const Icon(Icons.delete_outline, color: Color(0xFFDC2626)),
                                  tooltip: 'حذف هذا الملف',
                                  onPressed: () => setState(() => _staged = _staged.where((x) => x.id != f.id).toList()),
                                ),
                              )),
                        ],
                      ),
                    ),
                  ),
                if (_processing) ...[
                  const SizedBox(height: 12),
                  Card(
                    color: const Color(0xFFEFF6FF),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_progressText, style: const TextStyle(fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          LinearProgressIndicator(value: _progressPct / 100.0),
                          const SizedBox(height: 4),
                          Text('نسبة الإنجاز: $_progressPct%'),
                        ],
                      ),
                    ),
                  ),
                ],
                if (_summaries.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ..._summaries.map((s) => Card(
                        color: const Color(0xFFECFDF5),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${s.fileName} (${s.rowCount} سجل) -> ${s.primaryDestination}', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF065F46))),
                              const SizedBox(height: 4),
                              Text('ملخص عربي: ${s.arabicSummary}'),
                              Text('EN Summary: ${s.englishSummary}', style: const TextStyle(fontSize: 12, color: Colors.black54)),
                              Text('وجهات ثانوية مقترحة: ${s.secondaryDestinations.join(" | ")}', style: const TextStyle(fontSize: 12, color: Color(0xFF1E3A5F))),
                            ],
                          ),
                        ),
                      )),
                ],
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('المترجم الفوري وتعليم القارئ الذكي (${widget.rules.length} قاعدة متعلمة)', style: const TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _transCtrl,
                          decoration: const InputDecoration(labelText: 'ترجمة مصطلح أو عنوان عمود إنجليزي', border: OutlineInputBorder()),
                          onChanged: (v) => setState(() => _transResult = SmartReaderService.translateOffline(v)),
                        ),
                        if (_transResult.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text('الترجمة العربية: $_transResult', style: const TextStyle(color: Color(0xFF065F46), fontWeight: FontWeight.bold)),
                        ],
                        const Divider(height: 24),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: [
                            SizedBox(
                              width: 260,
                              child: TextField(
                                controller: _ruleKwCtrl,
                                decoration: const InputDecoration(labelText: 'كلمات مفتاحية للتوجيه', border: OutlineInputBorder()),
                              ),
                            ),
                            SizedBox(
                              width: 260,
                              child: DropdownButtonFormField<String>(
                                value: _ruleTarget,
                                decoration: const InputDecoration(labelText: 'الوجهة المستهدفة', border: OutlineInputBorder()),
                                items: const [
                                  DropdownMenuItem(value: 'التأشيرات الصادرة ووكالات السفر', child: Text('التأشيرات ووكالات السفر')),
                                  DropdownMenuItem(value: 'شؤون الوافدين والعمال الأجانب', child: Text('الوافدين والعمال الأجانب')),
                                  DropdownMenuItem(value: 'تصاريح التنقل والأماكن', child: Text('تصاريح التنقل والأماكن')),
                                  DropdownMenuItem(value: 'أرشيف المراسلات والمذكرات', child: Text('المراسلات والمذكرات')),
                                ],
                                onChanged: (v) => setState(() => _ruleTarget = v ?? 'التأشيرات الصادرة ووكالات السفر'),
                              ),
                            ),
                            FilledButton(
                              onPressed: () {
                                if (_ruleKwCtrl.text.trim().isEmpty) return;
                                widget.onLearnRule(CustomReaderRule(
                                  id: 'R-${DateTime.now().millisecondsSinceEpoch}',
                                  instructionText: 'توجيه ${_ruleKwCtrl.text.trim()} -> $_ruleTarget',
                                  keywords: _ruleKwCtrl.text.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList(),
                                  targetCategory: _ruleTarget,
                                ));
                                _ruleKwCtrl.clear();
                              },
                              child: const Text('حفظ قاعدة التعلم'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_staged.isNotEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            color: Colors.white,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF059669), minimumSize: const Size(double.infinity, 48)),
              icon: const Icon(Icons.auto_awesome),
              label: Text('بدء التحليل والفرز الذكي الآن (${_staged.length} ملفات)'),
              onPressed: _processing
                  ? null
                  : () async {
                      setState(() {
                        _processing = true;
                        _progressPct = 5;
                      });
                      final res = await SmartReaderService.processStagedFilesChunked(
                        files: _staged,
                        watchlist: widget.watchlist,
                        learnedRules: widget.rules,
                        onProgress: (pct, txt) {
                          if (mounted) setState(() { _progressPct = pct; _progressText = txt; });
                        },
                      );
                      widget.onBatchImported(res.addedTravelers, res.addedForeigners);
                      if (mounted) {
                        setState(() {
                          _summaries = res.summaries;
                          _staged = [];
                          _processing = false;
                        });
                      }
                    },
            ),
          ),
      ],
    );
  }
}

class _RealisticReportsView extends StatelessWidget {
  final List<TravelerRecord> travelers;
  final List<TravelAgency> agencies;
  final List<MofaMemoRecord> mofa;
  final List<PassportSeizureRecord> seizures;
  final List<ForeignerResidentRecord> foreigners;
  final List<MovementPermitRecord> permits;
  final List<CitizenshipCaseRecord> citizenship;
  final List<CorrespondenceRecord> letters;
  final List<WatchlistReport> watchlist;
  final void Function(String type, String fieldA, String fieldB) onQuickAddModuleRecord;

  const _RealisticReportsView({
    required this.travelers,
    required this.agencies,
    required this.mofa,
    required this.seizures,
    required this.foreigners,
    required this.permits,
    required this.citizenship,
    required this.letters,
    required this.watchlist,
    required this.onQuickAddModuleRecord,
  });

  @override
  Widget build(BuildContext context) {
    final rep = SmartReaderService.buildMonthlyReport(
      travelers: travelers,
      agencies: agencies,
      mofa: mofa,
      seizures: seizures,
      foreigners: foreigners,
      permits: permits,
      citizenship: citizenship,
      letters: letters,
      watchlist: watchlist,
    );

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                color: const Color(0xFF0F172A),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    'التقارير الشهرية الواقعية (10 محاور محسوبة من البيانات الفعلية · ${rep.generatedDate})',
                    style: const TextStyle(color: Color(0xFFFCD34D), fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
              ),
              _sec('1. التأشيرات المستخرجة والوكالات وأسباب الإرتجاع',
                  'الإجمالي: ${rep.totalMonthlyVisas} (معتمدة: ${rep.approvedVisas} | مرتجعة: ${rep.returnedVisas}) · الوكالات المربوطة: ${rep.topAgencies.length} · أبرز الأسباب: ${rep.topReturnReasons.map((e) => "${e.key}(${e.value})").join("، ").ifEmpty("لا يوجد")}'),
              _sec('2. توزيع الجنسيات المسجلة', rep.nationalities.map((e) => '${e.key}: ${e.value}').join(' | ').ifEmpty('لا توجد بيانات')),
              _sec('3. العمال الأجانب والوافدين', 'إجمالي السجلات: ${rep.foreignersTotal} · السارية إقاماتهم: ${rep.activeForeigners}'),
              _sec('4. المنظمات ورحلات الطيران (الخارجية)', 'طلبات التسهيل: ${rep.mofaRequestsTotal} · المنظمات: ${rep.organizationsCount} · كشوف الرحلات: ${rep.flightManifestsCount}'),
              _sec('5. طلبات الجنسية والزواج وأبناء اليمنيات', 'إجمالي الحالات: ${rep.citizenshipTotal} · منها زواج من أجنبية: ${rep.marriageCasesCount}'),
              _sec('6. الخطابات الصادرة والواردة وملخصاتها', 'صادرة: ${rep.outgoingLettersCount} · واردة: ${rep.incomingLettersCount}'),
              _sec('7. الجوازات المضبوطة', 'إجمالي المضبوطة قيد الإجراء: ${rep.seizedPassportsCount}'),
              _sec('8. المباينة الأمنية وقوائم الضبط', 'حالات المباينة والتطابق: ${rep.flaggedVisas + rep.seizedPassportsCount} · التعميمات النشطة: ${rep.watchlistCount}'),
              _sec('9. الجوازات التي تم تسليمها', 'تم تسليمها لأصحابها/الوكالات: ${rep.deliveredPassportsCount}'),
              _sec('10. تصاريح التنقل والأماكن', 'التصاريح: ${rep.movementPermitsCount} (${rep.movementPassengersTotal} مسافر) · الأماكن: ${rep.permitPlaces.map((e) => e.key).join("، ").ifEmpty("لا يوجد")}'),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            icon: const Icon(Icons.add_circle_outline),
            label: const Text('تسجيل قيد إداري (ضبط / تسليم / تصريح تنقل / خطاب)'),
            onPressed: () {
              final fieldACtrl = TextEditingController();
              final fieldBCtrl = TextEditingController();
              String selectedType = 'ضبط جواز';
              showDialog(
                context: context,
                builder: (ctx) => StatefulBuilder(
                  builder: (ctx, setS) => Directionality(
                    textDirection: TextDirection.rtl,
                    child: AlertDialog(
                      title: const Text('إضافة قيد جديد للتقارير'),
                      content: SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            DropdownButtonFormField<String>(
                              value: selectedType,
                              items: const [
                                DropdownMenuItem(value: 'ضبط جواز', child: Text('ضبط جواز')),
                                DropdownMenuItem(value: 'تسليم جواز', child: Text('تسليم جواز')),
                                DropdownMenuItem(value: 'تصريح تنقل', child: Text('تصريح تنقل')),
                                DropdownMenuItem(value: 'خطاب', child: Text('خطاب صادر/وارد')),
                              ],
                              onChanged: (v) => setS(() => selectedType = v ?? 'ضبط جواز'),
                            ),
                            const SizedBox(height: 8),
                            TextField(controller: fieldACtrl, decoration: const InputDecoration(labelText: 'الاسم / الجهة / الموضوع')),
                            const SizedBox(height: 8),
                            TextField(controller: fieldBCtrl, decoration: const InputDecoration(labelText: 'رقم الجواز / المكان / الملخص')),
                          ],
                        ),
                      ),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
                        FilledButton(
                          onPressed: () {
                            if (fieldACtrl.text.trim().isNotEmpty) {
                              onQuickAddModuleRecord(selectedType, fieldACtrl.text.trim(), fieldBCtrl.text.trim());
                              Navigator.pop(ctx);
                            }
                          },
                          child: const Text('حفظ'),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _sec(String title, String body) => Card(
        child: ListTile(
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF1E3A5F))),
          subtitle: Padding(padding: const EdgeInsets.only(top: 4), child: Text(body)),
        ),
      );
}

extension _StrExt on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}

class _WatchlistAndOfficersView extends StatefulWidget {
  final List<WatchlistReport> reports;
  final List<PortOfficer> officers;
  final void Function(WatchlistReport) onAddReport;
  final void Function(PortOfficer) onAddOfficer;

  const _WatchlistAndOfficersView({
    required this.reports,
    required this.officers,
    required this.onAddReport,
    required this.onAddOfficer,
  });

  @override
  State<_WatchlistAndOfficersView> createState() => _WatchlistAndOfficersViewState();
}

class _WatchlistAndOfficersViewState extends State<_WatchlistAndOfficersView> {
  final _titleCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _rankCtrl = TextEditingController(text: 'نقيب');
  final _offNameCtrl = TextEditingController();
  String _selectedPort = kYemenSovereignPorts.first;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                SizedBox(width: 220, child: TextField(controller: _titleCtrl, decoration: const InputDecoration(labelText: 'عنوان بلاغ الضبط'))),
                SizedBox(width: 200, child: TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'اسم المطلوب'))),
                SizedBox(width: 160, child: TextField(controller: _passCtrl, decoration: const InputDecoration(labelText: 'رقم الجواز'))),
                FilledButton(
                  onPressed: () {
                    if (_titleCtrl.text.trim().isEmpty) return;
                    widget.onAddReport(WatchlistReport(
                      id: DateTime.now().millisecondsSinceEpoch.toString(),
                      title: _titleCtrl.text.trim(),
                      targetName: _nameCtrl.text.trim(),
                      targetPassport: _passCtrl.text.trim(),
                      createdAt: DateTime.now().toIso8601String(),
                    ));
                    _titleCtrl.clear();
                    _nameCtrl.clear();
                    _passCtrl.clear();
                  },
                  child: const Text('إضافة تعميم'),
                ),
              ],
            ),
          ),
        ),
        ...widget.reports.map((r) => Card(
              color: const Color(0xFFFEF2F2),
              child: ListTile(
                leading: const Icon(Icons.report, color: Color(0xFFDC2626)),
                title: Text(r.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('المطلوب: ${r.targetName} | جواز: ${r.targetPassport}'),
              ),
            )),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                SizedBox(width: 120, child: TextField(controller: _rankCtrl, decoration: const InputDecoration(labelText: 'الرتبة'))),
                SizedBox(width: 220, child: TextField(controller: _offNameCtrl, decoration: const InputDecoration(labelText: 'اسم الضابط'))),
                SizedBox(
                  width: 260,
                  child: DropdownButtonFormField<String>(
                    value: _selectedPort,
                    items: kYemenSovereignPorts.map((p) => DropdownMenuItem(value: p, child: Text(p, overflow: TextOverflow.ellipsis))).toList(),
                    onChanged: (v) => setState(() => _selectedPort = v ?? kYemenSovereignPorts.first),
                  ),
                ),
                FilledButton(
                  onPressed: () {
                    if (_offNameCtrl.text.trim().isEmpty) return;
                    widget.onAddOfficer(PortOfficer(
                      id: DateTime.now().millisecondsSinceEpoch.toString(),
                      rank: _rankCtrl.text.trim(),
                      fullName: _offNameCtrl.text.trim(),
                      assignedPort: _selectedPort,
                      isDutyOfficer: widget.officers.isEmpty,
                    ));
                    _offNameCtrl.clear();
                  },
                  child: const Text('إدراج ضابط'),
                ),
              ],
            ),
          ),
        ),
        ...widget.officers.map((o) => Card(
              child: ListTile(
                leading: const Icon(Icons.local_police),
                title: Text('${o.rank}/ ${o.fullName}', style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text(o.assignedPort),
                trailing: o.isDutyOfficer ? const Chip(label: Text('مناوب')) : null,
              ),
            )),
      ],
    );
  }
}
