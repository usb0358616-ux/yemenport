enum ExpiryStatus { valid, expiringSoon, expired }

class TravelerRecord {
  final String id;
  final String serialNumber;
  final String fullName;
  final String passportNumber;
  final String nationality;
  final String issueDate;
  final String expiryDate; // YYYY-MM-DD
  final String portName;
  final String agency;
  final String agencyId;
  final String visaType;
  final String receiveDate;
  final String exitDate;
  final String status; // مؤشر | مرتجع | معتمد
  final String returnReason;
  final String travelAllowed; // 'نعم' | 'لا'
  final String vettingResult;
  final String createdAt;

  TravelerRecord({
    required this.id,
    this.serialNumber = '',
    required this.fullName,
    required this.passportNumber,
    this.nationality = 'اليمن',
    this.issueDate = '',
    this.expiryDate = '',
    this.portName = 'المركز الرئيسي - العاصمة صنعاء',
    this.agency = '',
    this.agencyId = '',
    this.visaType = '',
    this.receiveDate = '',
    this.exitDate = '',
    this.status = 'معتمد',
    this.returnReason = '',
    this.travelAllowed = 'نعم',
    this.vettingResult = 'سليم',
    required this.createdAt,
  });

  ExpiryStatus get expiryStatus {
    final exp = DateTime.tryParse(expiryDate);
    if (exp == null) return ExpiryStatus.valid;
    final diffDays = exp.difference(DateTime.now()).inDays;
    if (diffDays < 0) return ExpiryStatus.expired;
    if (diffDays <= 180) return ExpiryStatus.expiringSoon;
    return ExpiryStatus.valid;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'serialNumber': serialNumber,
        'fullName': fullName,
        'passportNumber': passportNumber,
        'nationality': nationality,
        'issueDate': issueDate,
        'expiryDate': expiryDate,
        'portName': portName,
        'agency': agency,
        'agencyId': agencyId,
        'visaType': visaType,
        'receiveDate': receiveDate,
        'exitDate': exitDate,
        'status': status,
        'returnReason': returnReason,
        'travelAllowed': travelAllowed,
        'vettingResult': vettingResult,
        'createdAt': createdAt,
      };

  factory TravelerRecord.fromJson(Map<String, dynamic> json) => TravelerRecord(
        id: json['id'] ?? '',
        serialNumber: json['serialNumber'] ?? '',
        fullName: json['fullName'] ?? '',
        passportNumber: json['passportNumber'] ?? '',
        nationality: json['nationality'] ?? 'اليمن',
        issueDate: json['issueDate'] ?? '',
        expiryDate: json['expiryDate'] ?? '',
        portName: json['portName'] ?? 'المركز الرئيسي - العاصمة صنعاء',
        agency: json['agency'] ?? '',
        agencyId: json['agencyId'] ?? '',
        visaType: json['visaType'] ?? '',
        receiveDate: json['receiveDate'] ?? '',
        exitDate: json['exitDate'] ?? '',
        status: json['status'] ?? 'معتمد',
        returnReason: json['returnReason'] ?? '',
        travelAllowed: json['travelAllowed'] ?? 'نعم',
        vettingResult: json['vettingResult'] ?? 'سليم',
        createdAt: json['createdAt'] ?? '',
      );
}

class TravelAgency {
  final String id;
  final String agencyName;
  final String governorate;
  final String center;
  final String clearanceStatus;
  final int linkedVisasCount;
  final int issuedCount;
  final int returnedCount;

  TravelAgency({
    required this.id,
    required this.agencyName,
    this.governorate = 'صنعاء',
    this.center = '',
    this.clearanceStatus = 'معتمد وساري',
    this.linkedVisasCount = 0,
    this.issuedCount = 0,
    this.returnedCount = 0,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'agencyName': agencyName,
        'governorate': governorate,
        'center': center,
        'clearanceStatus': clearanceStatus,
        'linkedVisasCount': linkedVisasCount,
        'issuedCount': issuedCount,
        'returnedCount': returnedCount,
      };

  factory TravelAgency.fromJson(Map<String, dynamic> json) => TravelAgency(
        id: json['id'] ?? '',
        agencyName: json['agencyName'] ?? '',
        governorate: json['governorate'] ?? 'صنعاء',
        center: json['center'] ?? '',
        clearanceStatus: json['clearanceStatus'] ?? 'معتمد وساري',
        linkedVisasCount: json['linkedVisasCount'] ?? 0,
        issuedCount: json['issuedCount'] ?? 0,
        returnedCount: json['returnedCount'] ?? 0,
      );
}

class MofaMemoRecord {
  final String id;
  final String memoNumber;
  final String organization;
  final String requestType;
  final String flightRoute;
  final int beneficiariesCount;
  final String approvalStatus;
  final String createdAt;

  MofaMemoRecord({
    required this.id,
    required this.memoNumber,
    required this.organization,
    required this.requestType,
    this.flightRoute = '',
    this.beneficiariesCount = 1,
    this.approvalStatus = 'معتمد رسمياً',
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'memoNumber': memoNumber,
        'organization': organization,
        'requestType': requestType,
        'flightRoute': flightRoute,
        'beneficiariesCount': beneficiariesCount,
        'approvalStatus': approvalStatus,
        'createdAt': createdAt,
      };

  factory MofaMemoRecord.fromJson(Map<String, dynamic> json) => MofaMemoRecord(
        id: json['id'] ?? '',
        memoNumber: json['memoNumber'] ?? '',
        organization: json['organization'] ?? '',
        requestType: json['requestType'] ?? '',
        flightRoute: json['flightRoute'] ?? '',
        beneficiariesCount: json['beneficiariesCount'] ?? 1,
        approvalStatus: json['approvalStatus'] ?? 'معتمد رسمياً',
        createdAt: json['createdAt'] ?? '',
      );
}

class PassportSeizureRecord {
  final String id;
  final String recordNumber;
  final String travelerName;
  final String passportNumber;
  final String seizurePort;
  final String reason;
  final String status; // مضبوط | تم التسليم
  final String recipientName;
  final String createdAt;

  PassportSeizureRecord({
    required this.id,
    required this.recordNumber,
    required this.travelerName,
    required this.passportNumber,
    required this.seizurePort,
    required this.reason,
    this.status = 'مضبوط',
    this.recipientName = '',
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'recordNumber': recordNumber,
        'travelerName': travelerName,
        'passportNumber': passportNumber,
        'seizurePort': seizurePort,
        'reason': reason,
        'status': status,
        'recipientName': recipientName,
        'createdAt': createdAt,
      };

  factory PassportSeizureRecord.fromJson(Map<String, dynamic> json) => PassportSeizureRecord(
        id: json['id'] ?? '',
        recordNumber: json['recordNumber'] ?? '',
        travelerName: json['travelerName'] ?? '',
        passportNumber: json['passportNumber'] ?? '',
        seizurePort: json['seizurePort'] ?? '',
        reason: json['reason'] ?? '',
        status: json['status'] ?? 'مضبوط',
        recipientName: json['recipientName'] ?? '',
        createdAt: json['createdAt'] ?? '',
      );
}

class ForeignerResidentRecord {
  final String id;
  final String residenceNumber;
  final String fullName;
  final String passportNumber;
  final String nationality;
  final String employer;
  final String profession;
  final String expiryDate;

  ForeignerResidentRecord({
    required this.id,
    required this.residenceNumber,
    required this.fullName,
    required this.passportNumber,
    required this.nationality,
    required this.employer,
    required this.profession,
    this.expiryDate = '',
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'residenceNumber': residenceNumber,
        'fullName': fullName,
        'passportNumber': passportNumber,
        'nationality': nationality,
        'employer': employer,
        'profession': profession,
        'expiryDate': expiryDate,
      };

  factory ForeignerResidentRecord.fromJson(Map<String, dynamic> json) => ForeignerResidentRecord(
        id: json['id'] ?? '',
        residenceNumber: json['residenceNumber'] ?? '',
        fullName: json['fullName'] ?? '',
        passportNumber: json['passportNumber'] ?? '',
        nationality: json['nationality'] ?? '',
        employer: json['employer'] ?? '',
        profession: json['profession'] ?? '',
        expiryDate: json['expiryDate'] ?? '',
      );
}

class MovementPermitRecord {
  final String id;
  final String permitCode;
  final String delegationName;
  final String authorizedRoute;
  final String accommodationPlace;
  final int passengersCount;
  final String validTo;

  MovementPermitRecord({
    required this.id,
    required this.permitCode,
    required this.delegationName,
    required this.authorizedRoute,
    required this.accommodationPlace,
    this.passengersCount = 1,
    this.validTo = '',
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'permitCode': permitCode,
        'delegationName': delegationName,
        'authorizedRoute': authorizedRoute,
        'accommodationPlace': accommodationPlace,
        'passengersCount': passengersCount,
        'validTo': validTo,
      };

  factory MovementPermitRecord.fromJson(Map<String, dynamic> json) => MovementPermitRecord(
        id: json['id'] ?? '',
        permitCode: json['permitCode'] ?? '',
        delegationName: json['delegationName'] ?? '',
        authorizedRoute: json['authorizedRoute'] ?? '',
        accommodationPlace: json['accommodationPlace'] ?? '',
        passengersCount: json['passengersCount'] ?? 1,
        validTo: json['validTo'] ?? '',
      );
}

class CitizenshipCaseRecord {
  final String id;
  final String caseNumber;
  final String serviceType; // طلب جنسية | زواج يمني من أجنبية
  final String applicantName;
  final String spouseNationality;
  final String status;

  CitizenshipCaseRecord({
    required this.id,
    required this.caseNumber,
    required this.serviceType,
    required this.applicantName,
    this.spouseNationality = '',
    this.status = 'قيد المراجعة',
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'caseNumber': caseNumber,
        'serviceType': serviceType,
        'applicantName': applicantName,
        'spouseNationality': spouseNationality,
        'status': status,
      };

  factory CitizenshipCaseRecord.fromJson(Map<String, dynamic> json) => CitizenshipCaseRecord(
        id: json['id'] ?? '',
        caseNumber: json['caseNumber'] ?? '',
        serviceType: json['serviceType'] ?? '',
        applicantName: json['applicantName'] ?? '',
        spouseNationality: json['spouseNationality'] ?? '',
        status: json['status'] ?? 'قيد المراجعة',
      );
}

class CorrespondenceRecord {
  final String id;
  final String referenceNumber;
  final String direction; // صادر | وارد
  final String subject;
  final String summary;
  final String dateStr;

  CorrespondenceRecord({
    required this.id,
    required this.referenceNumber,
    required this.direction,
    required this.subject,
    required this.summary,
    required this.dateStr,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'referenceNumber': referenceNumber,
        'direction': direction,
        'subject': subject,
        'summary': summary,
        'dateStr': dateStr,
      };

  factory CorrespondenceRecord.fromJson(Map<String, dynamic> json) => CorrespondenceRecord(
        id: json['id'] ?? '',
        referenceNumber: json['referenceNumber'] ?? '',
        direction: json['direction'] ?? 'وارد',
        subject: json['subject'] ?? '',
        summary: json['summary'] ?? '',
        dateStr: json['dateStr'] ?? '',
      );
}

class CustomReaderRule {
  final String id;
  final String instructionText;
  final List<String> keywords;
  final String targetCategory;
  final int frequency;

  CustomReaderRule({
    required this.id,
    required this.instructionText,
    required this.keywords,
    required this.targetCategory,
    this.frequency = 1,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'instructionText': instructionText,
        'keywords': keywords,
        'targetCategory': targetCategory,
        'frequency': frequency,
      };

  factory CustomReaderRule.fromJson(Map<String, dynamic> json) => CustomReaderRule(
        id: json['id'] ?? '',
        instructionText: json['instructionText'] ?? '',
        keywords: List<String>.from(json['keywords'] ?? const []),
        targetCategory: json['targetCategory'] ?? '',
        frequency: json['frequency'] ?? 1,
      );
}

class WatchlistReport {
  final String id;
  final String title;
  final String targetName;
  final String targetPassport;
  final String status;
  final String createdAt;

  WatchlistReport({
    required this.id,
    required this.title,
    required this.targetName,
    required this.targetPassport,
    this.status = 'جديد',
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'targetName': targetName,
        'targetPassport': targetPassport,
        'status': status,
        'createdAt': createdAt,
      };

  factory WatchlistReport.fromJson(Map<String, dynamic> json) => WatchlistReport(
        id: json['id'] ?? '',
        title: json['title'] ?? '',
        targetName: json['targetName'] ?? '',
        targetPassport: json['targetPassport'] ?? '',
        status: json['status'] ?? 'جديد',
        createdAt: json['createdAt'] ?? '',
      );
}

class PortOfficer {
  final String id;
  final String rank;
  final String fullName;
  final String assignedPort;
  final String role;
  final bool isDutyOfficer;

  PortOfficer({
    required this.id,
    required this.rank,
    required this.fullName,
    required this.assignedPort,
    this.role = 'ضابط منفذ',
    this.isDutyOfficer = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'rank': rank,
        'fullName': fullName,
        'assignedPort': assignedPort,
        'role': role,
        'isDutyOfficer': isDutyOfficer,
      };

  factory PortOfficer.fromJson(Map<String, dynamic> json) => PortOfficer(
        id: json['id'] ?? '',
        rank: json['rank'] ?? 'نقيب',
        fullName: json['fullName'] ?? '',
        assignedPort: json['assignedPort'] ?? 'المركز الرئيسي - العاصمة صنعاء',
        role: json['role'] ?? 'ضابط منفذ',
        isDutyOfficer: json['isDutyOfficer'] ?? false,
      );
}

const List<String> kYemenSovereignPorts = [
  'المركز الرئيسي - العاصمة صنعاء',
  'مطار صنعاء الدولي',
  'مطار عدن الدولي',
  'مطار الريان الدولي',
  'مطار سيئون الدولي',
  'مطار الغيضة الدولي',
  'مطار سقطرى الدولي',
  'مطار الحديدة الدولي',
  'منفذ الوديعة البري',
  'منفذ شحن البري',
  'منفذ صرفيت البري',
  'منفذ علب البري',
  'منفذ الطوال البري',
  'ميناء عدن البحري',
  'ميناء الحديدة البحري',
  'ميناء المكلا البحري',
  'ميناء نشطون البحري',
  'ميناء الصليف البحري',
  'ميناء المخا البحري',
];
