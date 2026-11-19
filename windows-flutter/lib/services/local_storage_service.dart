import 'dart:convert';
import 'dart:io';
import '../models/border_models.dart';

class LocalStorageService {
  static final String _dataDir = Platform.environment['APPDATA'] != null
      ? '${Platform.environment['APPDATA']}\\YemenBordersSystem'
      : '${Directory.current.path}\\yemen_borders_data';

  static File _file(String name) {
    final dir = Directory(_dataDir);
    if (!dir.existsSync()) {
      dir.createSync(recursive: true);
    }
    return File('$_dataDir${Platform.pathSeparator}$name');
  }

  static List<T> _loadList<T>(String filename, T Function(Map<String, dynamic>) fromJson) {
    final f = _file(filename);
    if (!f.existsSync()) return [];
    try {
      final raw = jsonDecode(f.readAsStringSync()) as List<dynamic>;
      return raw.map((e) => fromJson(Map<String, dynamic>.from(e))).toList();
    } catch (_) {
      return [];
    }
  }

  static void _saveList(String filename, List<dynamic> items) {
    _file(filename).writeAsStringSync(
      const JsonEncoder.withIndent('  ').convert(items.map((e) => e.toJson()).toList()),
    );
  }

  static List<TravelerRecord> loadTravelers() => _loadList('travelers.json', TravelerRecord.fromJson);
  static void saveTravelers(List<TravelerRecord> items) => _saveList('travelers.json', items);

  static List<TravelAgency> loadAgencies() => _loadList('travel_agencies.json', TravelAgency.fromJson);
  static void saveAgencies(List<TravelAgency> items) => _saveList('travel_agencies.json', items);

  static List<MofaMemoRecord> loadMofaMemos() => _loadList('mofa_memos.json', MofaMemoRecord.fromJson);
  static void saveMofaMemos(List<MofaMemoRecord> items) => _saveList('mofa_memos.json', items);

  static List<PassportSeizureRecord> loadSeizures() => _loadList('passport_seizures.json', PassportSeizureRecord.fromJson);
  static void saveSeizures(List<PassportSeizureRecord> items) => _saveList('passport_seizures.json', items);

  static List<ForeignerResidentRecord> loadForeigners() => _loadList('foreigner_residents.json', ForeignerResidentRecord.fromJson);
  static void saveForeigners(List<ForeignerResidentRecord> items) => _saveList('foreigner_residents.json', items);

  static List<MovementPermitRecord> loadPermits() => _loadList('movement_permits.json', MovementPermitRecord.fromJson);
  static void savePermits(List<MovementPermitRecord> items) => _saveList('movement_permits.json', items);

  static List<CitizenshipCaseRecord> loadCitizenship() => _loadList('citizenship_cases.json', CitizenshipCaseRecord.fromJson);
  static void saveCitizenship(List<CitizenshipCaseRecord> items) => _saveList('citizenship_cases.json', items);

  static List<CorrespondenceRecord> loadCorrespondence() => _loadList('correspondence.json', CorrespondenceRecord.fromJson);
  static void saveCorrespondence(List<CorrespondenceRecord> items) => _saveList('correspondence.json', items);

  static List<CustomReaderRule> loadReaderRules() => _loadList('reader_rules.json', CustomReaderRule.fromJson);
  static void saveReaderRules(List<CustomReaderRule> items) => _saveList('reader_rules.json', items);

  static List<WatchlistReport> loadReports() => _loadList('watchlist_reports.json', WatchlistReport.fromJson);
  static void saveReports(List<WatchlistReport> items) => _saveList('watchlist_reports.json', items);

  static List<PortOfficer> loadOfficers() => _loadList('port_officers.json', PortOfficer.fromJson);
  static void saveOfficers(List<PortOfficer> items) => _saveList('port_officers.json', items);

  static String normalizeArabic(String input) {
    return input
        .trim()
        .replaceAll('أ', 'ا')
        .replaceAll('إ', 'ا')
        .replaceAll('آ', 'ا')
        .replaceAll('ة', 'ه')
        .replaceAll('ى', 'ي')
        .replaceAll(RegExp(r'\s+'), ' ')
        .toLowerCase();
  }

  static List<TravelAgency> syncTravelAgenciesWithVisas(
    List<TravelerRecord> travelers,
    List<TravelAgency> existingAgencies,
  ) {
    final map = <String, TravelAgency>{};
    for (final a in existingAgencies) {
      map[normalizeArabic(a.agencyName)] = TravelAgency(
        id: a.id,
        agencyName: a.agencyName,
        governorate: a.governorate,
        center: a.center,
        clearanceStatus: a.clearanceStatus,
        linkedVisasCount: 0,
        issuedCount: 0,
        returnedCount: 0,
      );
    }

    for (final t in travelers) {
      final ag = t.agency.trim();
      if (ag.isEmpty) continue;
      final key = normalizeArabic(ag);
      final cur = map[key];
      final isReturned = t.status.contains('مرتجع') || t.returnReason.trim().isNotEmpty;
      map[key] = TravelAgency(
        id: cur?.id ?? 'AG-${key.hashCode.abs()}',
        agencyName: cur?.agencyName ?? ag,
        governorate: cur?.governorate ?? 'صنعاء',
        center: (cur?.center ?? '').isNotEmpty ? cur!.center : t.portName,
        clearanceStatus: cur?.clearanceStatus ?? 'معتمد وساري',
        linkedVisasCount: (cur?.linkedVisasCount ?? 0) + 1,
        issuedCount: (cur?.issuedCount ?? 0) + (isReturned ? 0 : 1),
        returnedCount: (cur?.returnedCount ?? 0) + (isReturned ? 1 : 0),
      );
    }

    final result = map.values.toList();
    result.sort((a, b) => b.linkedVisasCount.compareTo(a.linkedVisasCount));
    saveAgencies(result);
    return result;
  }

  static WatchlistReport? findMatch(
    List<WatchlistReport> reports,
    String passportNo,
    String fullName,
  ) {
    final cleanPass = passportNo.trim();
    final cleanName = normalizeArabic(fullName);
    for (final r in reports) {
      final passHit = cleanPass.isNotEmpty && r.targetPassport.trim() == cleanPass;
      final nameHit = cleanName.length >= 3 && normalizeArabic(r.targetName).contains(cleanName);
      if (passHit || nameHit) return r;
    }
    return null;
  }
}
