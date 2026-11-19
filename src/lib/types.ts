import { SovereignUserRole } from './constants';

export interface Traveler {
  id: string;
  firstName: string;
  secondName: string;
  thirdName: string;
  fourthName: string;
  lastName: string;
  age: number;
  idNumber: string;
  idType: string;
  country: string;
  governorate: string;
  phone: string;
  vettingResult: string;
  vettingResult1?: string;
  vettingResult2?: string;
  vettingResult3?: string;
  vettingResult4?: string;
  destination: string;
  visitReason: string;
  investigatingOfficer: string;
  travelAllowed: 'نعم' | 'لا';
  center?: string;
  agency?: string;
  agencyId?: string;
  serialNumber?: string;
  receiveDate?: string;
  exitDate?: string;
  status?: string;
  returnReason?: string;
  visaType?: string;
  requestNumber?: string;
  photoUrl?: string;
  documentsUrls?: string[];
  linkedReportIds?: string[];
  // Sovereign Port binding
  portId?: string;
  portName?: string;
  // Biometrics & Identity Verification
  biometrics?: {
    fingerprintTemplate?: string;
    fingerprintCapturedAt?: string;
    faceEmbedding?: string;
    faceCapturedAt?: string;
    biometricStatus?: 'مكتمل' | 'جزئي' | 'غير مسجل';
  };
  // Transaction SLA tracking (processing duration in seconds)
  processingDurationSeconds?: number;
  // Additional info and cumulative unmapped data / notes
  additionalInfo?: string;
  // Dedicated sovereign passport & identity fields
  passportName?: string; // اسم المسافر كما هو مدون بالجواز
  passportStatus?: string; // حالة الجواز (صالح، منتهي، مفقود، ملغي، مسحوب)
  profession?: string; // المهنة / الوظيفة
  placeOfIssue?: string; // مكان أو جهة إصدار الجواز
  issueDate?: string; // تاريخ إصدار الجواز
  expiryDate?: string; // تاريخ انتهاء الجواز
  birthDate?: string; // تاريخ الميلاد
  gender?: string; // الجنس (ذكر / أنثى)
  nationalId?: string; // الرقم الوطني / بطاقة الهوية

  // SmartMerge history tracking
  mergeHistory?: {
    timestamp: string;
    source: string;
    changes: {
      field: string;
      label: string;
      oldValue: any;
      newValue: any;
    }[];
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedTravelerData {
  fullName?: string;
  firstName: string;
  secondName?: string;
  thirdName?: string;
  fourthName?: string;
  lastName: string;
  passportName?: string;
  passportStatus?: string;
  profession?: string;
  placeOfIssue?: string;
  issueDate?: string;
  expiryDate?: string;
  birthDate?: string;
  gender?: string;
  nationalId?: string;
  idNumber: string;
  idType?: string;
  age?: number;
  country?: string;
  governorate?: string;
  phone?: string;
  destination?: string;
  visitReason?: string;
  visaType?: string;
  center?: string;
  agency?: string;
  agencyId?: string;
  serialNumber?: string;
  receiveDate?: string;
  exitDate?: string;
  travelAllowed?: 'نعم' | 'لا';
  status?: string;
  returnReason?: string;
  investigatingOfficer?: string;
  requestNumber?: string;
  vettingResult?: string;
  vettingResult1?: string;
  vettingResult2?: string;
  vettingResult3?: string;
  vettingResult4?: string;
  additionalInfo?: string;
  unmappedFields?: Record<string, string>;
  detectedDepartment?: 'travelers' | 'seizures' | 'migrants' | 'refugees' | 'foreigners' | 'mofa_visas' | 'reports' | 'permits';
  detectionReason?: string;
  rawSource?: string;
}

// الوحدة 2: محاضر الضبط والجوازات المحتجزة
export type PassportTimelineStatus =
  | 'جديد'
  | 'بانتظار الفحص'
  | 'تم الفحص'
  | 'سليم'
  | 'مزور'
  | 'محال'
  | 'جاهز للتسليم'
  | 'تم التسليم';

export interface PassportSeizure {
  id: string;
  recordNumber: string; // محضر-2026-0001
  travelerName: string;
  passportNumber: string;
  nationality: string;
  seizurePort: string;
  seizureDate: string;
  officerInCharge: string;
  reason: string;
  status: PassportTimelineStatus;
  referredTo?: 'فرع استخبارات الشرطة' | 'المباحث الجنائية' | 'النيابة العامة' | 'مصلحة الجوازات';
  referralDate?: string;
  referralNotes?: string;
  examinationResult?: 'سليم ومبرأ' | 'تزوير جزئي' | 'تزوير كلي' | 'منتحل صفة' | 'مدرج بقائمة المنع';
  recipientName?: string;
  recipientIdNumber?: string;
  electronicSignature?: string;
  deliveredAt?: string;
  linkedTravelerId?: string;
  attachments?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// الوحدة 3: المهاجرون غير الشرعيين
export interface UndocumentedMigrant {
  id: string;
  fileNumber: string; // هجرة-2026-0001
  fullName: string;
  aliasName?: string;
  nationality: string; // إثيوبيا، الصومال، إريتريا، إلخ
  countryOfOrigin: string;
  infiltrationPoint: string; // نقطة التسلل أو الساحل أو المنفذ البري
  apprehensionDate: string;
  apprehensionPlace: string;
  gender: 'ذكر' | 'أنثى';
  approximateAge: number;
  medicalCheckStatus: 'سليم' | 'اشتباه مرضي' | 'بحاجة عزل' | 'قيد الفحص';
  medicalNotes?: string;
  fingerprintRegistered: boolean;
  shelterCenter: string; // مركز إيواء عمران، مركز إيواء عدن، إلخ
  deportationStatus: 'قيد الإيواء والتحقيق' | 'جاهز للترحيل' | 'ترحيل طوعي (IOM)' | 'ترحيل جبري' | 'تم الترحيل';
  deportationDate?: string;
  carrierOrVessel?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// الوحدة 5: اللاجئون وتصاريح اللجوء المؤقتة
export interface RefugeeRecord {
  id: string;
  unhcrNumber: string; // رقم ملف المفوضية السامية
  temporaryPermitNumber: string; // تصريح-2026-0001
  fullName: string;
  nationality: string; // صومالي، سوري، فلسطيني، إثيوبي، إلخ
  birthDate?: string;
  arrivalDate: string;
  familyMembersCount: number;
  securityVettingStatus: 'مبرأ ومطابق' | 'قيد التدقيق الأمني' | 'مرفوض أمنياً' | 'محظور';
  vettingOfficer: string;
  permitStatus: 'ساري' | 'منتهي' | 'ملغى لأسباب أمنية' | 'قيد التجديد';
  permitExpiryDate: string;
  qrVerificationCode: string;
  residentialAddress: string;
  phone?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// الوحدة 6: الوافدون الأجانب
export interface ForeignerResident {
  id: string;
  residenceNumber: string; // إقامة-2026-0001
  fullName: string;
  passportNumber: string;
  nationality: string;
  employer: string; // جهة العمل أو الكفيل أو المنشأة
  profession: string;
  entryDate: string;
  entryPort: string;
  residenceExpiryDate: string;
  medicalExamResult: 'لائق طبياً' | 'غير لائق' | 'بانتظار الفحص';
  reEntryVisaStatus: 'سارية' | 'منتهية' | 'غير مطلوبة' | 'مغادرة نهائية';
  linkedCompanyId?: string;
  securityClearanceStatus: 'معتمد' | 'تحت المراجعة' | 'مطلوب للمباينة';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// الوحدة 7: تصاريح التنقل والتحرك الداخلي
export interface InternalMovementPermit {
  id: string;
  permitCode: string; // تصريح-أمني-2026-0001
  delegationName: string; // اسم الوفد أو المنظمة أو البعثة
  organizationType: 'منظمة أمم متحدة (UN)' | 'منظمة دولية (INGO)' | 'بعثة دبلوماسية' | 'وفد تجاري' | 'خبراء أجانب';
  authorizedRoute: string; // صنعاء -> مأرب -> حضرموت
  allowedCheckpoints: string[];
  vehicleDetails: { plate: string; model: string; color: string }[];
  delegationHead: string;
  passportNumber: string;
  passengersCount: number;
  passengersList?: { fullName: string; passportNumber: string; nationality?: string; role?: string }[];
  securityEscortNeeded: boolean;
  escortTeamLeader?: string;
  validFrom: string;
  validTo: string;
  accommodationPlace: string;
  qrVerificationCode: string;
  approvalStatus: 'معتمد رسمياً' | 'قيد الدراسة' | 'مرفوض';
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
}

// الوحدة 9 & 10: معاملات الجنسية والزواج ووثائق السفر
export interface CitizenshipAndLegalCase {
  id: string;
  caseNumber: string; // معاملة-2026-0001
  serviceType:
    | 'زواج يمني من أجنبية'
    | 'زواج أجنبي من يمنية'
    | 'اكتساب الجنسية لزوجة يمني'
    | 'طلب الجنسية بأمر جمهوري'
    | 'طلب إذن اكتساب جنسية أجنبية'
    | 'وثائق سفر للاجئين'
    | 'جوازات سفر أبناء اليمنيات';
  applicantName: string;
  applicantIdOrPassport: string;
  applicantNationality: string;
  spouseOrBeneficiaryName?: string;
  spouseNationality?: string;
  submissionDate: string;
  targetCompletionDate: string;
  actualCompletionDate?: string;
  targetDaysSla: number;
  status: 'جديد' | 'قيد التحري والاستخبارات' | 'بانتظار موافقة الوزير' | 'معتمد ومصدر' | 'مرفوض';
  investigatingOfficer: string;
  intelligenceRefNumber?: string; // قيد استخبارات الشرطة 001
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// الوحدة 11: الرقابة على الشركات والوكالات الخمس
export interface MonitoredCompany {
  id: string;
  licenseNumber: string; // ترخيص-2026-0001
  companyName: string;
  commercialRecord: string;
  type:
    | 'شركات الحج والعمرة'
    | 'شركات ومحلات الصرافة والتحويلات'
    | 'شركات ووكالات السفر والسياحة'
    | 'وكالات التوظيف وتشغيل الأيدي العاملة'
    | 'شركات التأمين الصحي والتجاري';
  ownerName: string;
  supervisorName: string;
  securityClearanceStatus: 'معتمد وساري' | 'تحت المراجعة الدورية' | 'إيقاف مؤقت' | 'سحب الترخيص الأمني';
  lastInspectionDate: string;
  violationsCount: number;
  violationsLog: { date: string; description: string; penalty: string; officer: string }[];
  governorate: string;
  address: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

// الوحدة 12: المكاتبات والبرقيات الرسمية المؤتمتة
export interface OfficialCorrespondence {
  id: string;
  incomingOutgoingNumber: string; // ص-2026-001 أو و-2026-001
  letterType: 'برقية داخلية عاجلة' | 'مذكرة رسمية' | 'طلب تحري أمني' | 'رد على مذكرة' | 'إشعار ضبط وتوقيف';
  gregorianDate: string;
  hijriDate: string;
  senderEntity: string; // من: الإدارة العامة للمنافذ والرقابة الحدودية
  recipientEntity: string; // إلى: فرع استخبارات الشرطة / مدير أمن المحافظة
  referenceText: string; // الإشارة: عطفاً على مذكرتكم رقم (...)
  subject: string; // الموضوع: شأن المسافر / القضية (...)
  introClause: string; // المتضمن / نفيدكم علماً بأنه (...)
  actionRequired: string; // وعليه / يرجى التكرم بالإطلاع والتوجيه (...)
  closingClause: string; // التحية والختام
  signatoryTitle: string; // التوقيع والختم: مدير عام الرقابة والمنافذ
  signatoryName: string;
  isUrgent: boolean;
  status: 'مسودة' | 'معتمد ومرسل' | 'تم الرد' | 'مؤرشف';
  linkedEntityId?: string; // Linked case, traveler, or seizure
  createdAt: string;
  updatedAt: string;
}

// الوحدة 13: سجل العمليات الرقابي السيادي (Audit Log Entity)
export interface AuditLogEntity {
  id: string;
  timestamp: string;
  officerUsername: string;
  officerName: string;
  officerRole: SovereignUserRole;
  portOrDepartment: string;
  action:
    | 'إنشاء'
    | 'تعديل'
    | 'حذف'
    | 'طباعة تقرير'
    | 'إحالة أمنية'
    | 'استيراد كشف'
    | 'تصدير كشف'
    | 'اعتماد ترخيص'
    | 'تسجيل دخول'
    | 'محاولة دخول فاشلة'
    | 'إدارة صلاحيات'
    | 'تنبيه أمني OCR';
  targetModule:
    | 'المسافرين'
    | 'المضبوطات والجوازات'
    | 'المهاجرون غير الشرعيين'
    | 'المنافذ السيادية'
    | 'اللاجئون'
    | 'الوافدون الأجانب'
    | 'تصاريح التنقل'
    | 'الجنسية ووثائق السفر'
    | 'الرقابة على الشركات'
    | 'المكاتبات والبرقيات'
    | 'وحدة المطور والتهيئة'
    | 'الأمان والصلاحيات'
    | 'المصادقة';
  targetRecordId?: string;
  details: string;
  ipAddress: string;
  deviceInfo: string;
}

// الوحدة 14: وحدة المطور وتخصيص المنظومة (Developer Module - EAV & Rules)
export interface DynamicCustomField {
  id: string;
  targetTable: 'travelers' | 'seizures' | 'migrants' | 'refugees' | 'foreigners' | 'companies' | 'permits';
  fieldKey: string;
  fieldLabel: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options?: string[]; // for select
  required: boolean;
}

export interface DeveloperSystemSettings {
  autoFieldRules: {
    seizurePrefix: string;
    migrantPrefix: string;
    permitPrefix: string;
    correspondencePrefix: string;
  };
  customFields: DynamicCustomField[];
  customDropdownOptions: Record<string, string[]>;
  printHeaders: {
    republicTitle: string;
    ministryTitle: string;
    departmentTitle: string;
  };
}

export interface Report {
  id: string;
  autoNumber?: string;
  reportDate?: string;
  sendingAuthority?: string;
  subject?: string;
  priority?: 'عادي' | 'عاجل' | 'سري وعاجل';
  actionsTaken?: string;
  title: string;
  description: string;
  type: string;
  status: 'جديد' | 'قيد التحقيق' | 'معتمد' | 'مرفوض';
  attachments?: string[];
  linkedTravelerIds?: string[];
  transportDetails?: {
    batchName?: string;
    totalPassports?: number;
    agencies?: { name: string; count: number }[];
    route?: string;
    driverName?: string;
    escortName?: string;
    vehicleDesc?: string;
    plateNumber?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Movement {
  id: string;
  type: 'طقم' | 'دراجة نارية' | 'أخرى';
  plateNumber: string;
  driverName: string;
  personnelCount: number;
  mission: string;
  departureTime: string;
  expectedReturnTime: string;
  actualReturnTime?: string;
  outcome?: string;
  status: 'خروج' | 'عودة';
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  role: SovereignUserRole;
  name: string;
  portOrDepartment?: string;
  militaryNumber?: string;
  status?: 'نشط' | 'موقوف';
  lastLoginAt?: string;
}

// وحدة مذكرات وزارة الخارجية وتأشيرات المنظمات والرحلات الدولية
export interface MofaBeneficiary {
  id: string;
  fullName: string;
  fullNameEn?: string;
  passportNumber: string;
  passportType: 'عادي' | 'دبلوماسي' | 'خاص' | 'جواز مرور أمم متحدة (UN LP)' | 'جواز مرور الاتحاد الأوروبي (EU LP)';
  nationality: string;
  gender?: 'ذكر' | 'أنثى';
  birthDate?: string;
  profession: string;
  missionDuration?: string;
  startDate?: string;
  endDate?: string;
  workLocation?: string;
  photoUrl?: string;
  contractDetails?: string;
  educationDetails?: string;
}

export interface MofaVisaRequest {
  id: string;
  memoNumber: string; // e.g. و-2301 / 26-10-2026 أو 40/50/13
  memoDate: string;
  hijriDate?: string;
  organization: string;
  organizationType: 'منظمة دولية (INGO)' | 'وكالة أمم متحدة (UN)' | 'بعثة دبلوماسية' | 'وفد إنساني' | 'شركة نقل وسفريات';
  requestType: 'طلب تأشيرة دخول' | 'تجديد تأشيرة' | 'منح إقامة' | 'تجديد إقامة' | 'تصريح تنقل ومهمة' | 'مانيفست رحلة طيران' | 'إرسالية نقل جوازات';
  beneficiaries: MofaBeneficiary[];
  flightDetails?: {
    aircraftType?: string;
    callSign?: string;
    flightDate?: string;
    route?: string;
    totalPassengers?: number;
  };
  dispatchDetails?: {
    companyName?: string;
    driverName?: string;
    carPlate?: string;
    carModel?: string;
    passportsCount?: number;
    destinationBranch?: string;
  };
  mofaDirective: string;
  approvalStatus: 'معتمد رسمياً' | 'بانتظار الموافقة الأمنية' | 'تنسيق مع وزارة الصحة' | 'قيد الفحص' | 'مرفوض';
  securityClearanceStatus: 'معتمد' | 'بانتظار الفحص' | 'مطلوب للمباينة' | 'محظور';
  securityNotes?: string;
  sourceFileName?: string;
  sourceFileUrl?: string;
  attachedDocuments?: string[];
  additionalInfo?: string;
  createdAt: string;
  updatedAt: string;
}

// ضباط ومسؤولي المنافذ وغرف العمليات
export interface PortOfficer {
  id: string;
  name: string; // اسم الضابط كاملاً
  rank: string; // الرتبة: ملازم، ملازم أول، نقيب، رائد، مقدم، عقيد، عميد، صف ضابط، مدني
  portOrCenter: string; // المنفذ / المركز التابع له
  role: string; // المهمة: ضابط منفذ، مشرف نوبة، محقق مباينة أمنية، فاحص وثائق، مدير إدارة، ضابط إحصاء
  militaryNumber?: string; // الرقم العسكري
  phone?: string; // رقم الهاتف / اللاسلكي
  status: 'نشط' | 'في إجازة' | 'منقول';
  isCurrentDutyOfficer?: boolean; // هل هو الضابط المناوب الحالي
  createdAt: string;
  updatedAt?: string;
}
