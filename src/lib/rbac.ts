/**
 * منظومة الصلاحيات والأمان وإدارة المستخدمين السيادية (RBAC & Managed Accounts)
 * تغطي: القيادة والمشرفين · ضباط المنافذ والتحقيق · موظفي الإدخال
 */
import { SovereignUserRole } from './constants';
import { User, AuditLogEntity } from './types';
import {
  addAuditLog,
  generateId,
  getAuditLogs,
  getCurrentUser,
  saveAuditLogs,
  setCurrentUser
} from './storage';
import { kvGet, kvSet } from './sovereignStorageBackend';

export type Permission =
  | 'view_travelers'
  | 'create_edit_traveler'
  | 'delete_traveler'
  | 'approve_travel_ban'
  | 'view_reports'
  | 'manage_reports'
  | 'import_documents'
  | 'export_data'
  | 'manage_officers'
  | 'manage_users_roles'
  | 'view_audit_logs'
  | 'manage_settings';

export type RoleCategory = 'supervisor' | 'officer' | 'data_entry';

export interface ManagedUserAccount {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: SovereignUserRole;
  portOrDepartment: string;
  militaryNumber?: string;
  status: 'نشط' | 'موقوف';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export const PERMISSION_DEFINITIONS: Array<{
  key: Permission;
  label: string;
  description: string;
}> = [
  { key: 'view_travelers', label: 'الاطلاع على سجل المسافرين', description: 'عرض البحث والتفاصيل والوثائق' },
  { key: 'create_edit_traveler', label: 'إدخال وتعديل بيانات المسافرين', description: 'تسجيل المسافرين ومسح الجوازات OCR' },
  { key: 'delete_traveler', label: 'حذف سجلات المسافرين', description: 'صلاحية الإزالة النهائية للسجلات' },
  { key: 'approve_travel_ban', label: 'اعتماد المنع من السفر والمباينة', description: 'تغيير السماح بالسفر (ممنوع / مسموح)' },
  { key: 'view_reports', label: 'متابعة بلاغات الضبط', description: 'عرض البلاغات والتحريات الأمنية' },
  { key: 'manage_reports', label: 'اعتماد وإحالة بلاغات الضبط', description: 'تعديل حالة البلاغات واعتمادها أو حذفها' },
  { key: 'import_documents', label: 'الاستيراد الموحد (Excel/PDF/OCR)', description: 'استيراد الكشوفات وملفات الجوازات' },
  { key: 'export_data', label: 'تصدير التقارير والكشوفات', description: 'تصدير Excel و PDF والطباعة الرسمية' },
  { key: 'manage_officers', label: 'إدارة دليل ضباط المنافذ', description: 'إضافة وتعديل وتعيين الضابط المناوب' },
  { key: 'manage_users_roles', label: 'إدارة حسابات المستخدمين والصلاحيات', description: 'إنشاء الحسابات وتعديل الأدوار وإيقافها' },
  { key: 'view_audit_logs', label: 'الاطلاع على سجلات التدقيق والرقابة', description: 'مراقبة وتصدير سجل العمليات السيادي' },
  { key: 'manage_settings', label: 'تعديل إعدادات المقر الرئيسي', description: 'تغيير بيانات المركز السيادي والتهيئة' }
];

const ALL_PERMISSIONS: Permission[] = PERMISSION_DEFINITIONS.map(p => p.key);

export const ROLE_PERMISSIONS: Record<SovereignUserRole, Permission[]> = {
  'مدير عام': ALL_PERMISSIONS,
  'آدمن': ALL_PERMISSIONS,
  'نائب مدير عام': ALL_PERMISSIONS,
  'مدير إدارة': [
    'view_travelers',
    'create_edit_traveler',
    'delete_traveler',
    'approve_travel_ban',
    'view_reports',
    'manage_reports',
    'import_documents',
    'export_data',
    'manage_officers',
    'manage_users_roles',
    'view_audit_logs',
    'manage_settings'
  ],
  'رئيس قسم': [
    'view_travelers',
    'create_edit_traveler',
    'approve_travel_ban',
    'view_reports',
    'manage_reports',
    'import_documents',
    'export_data',
    'manage_officers',
    'view_audit_logs'
  ],
  'محقق أول': [
    'view_travelers',
    'create_edit_traveler',
    'approve_travel_ban',
    'view_reports',
    'manage_reports',
    'import_documents',
    'export_data',
    'view_audit_logs'
  ],
  'ضابط': [
    'view_travelers',
    'create_edit_traveler',
    'approve_travel_ban',
    'view_reports',
    'manage_reports',
    'import_documents',
    'export_data',
    'view_audit_logs'
  ],
  'محقق ميداني': [
    'view_travelers',
    'create_edit_traveler',
    'approve_travel_ban',
    'view_reports',
    'import_documents',
    'export_data'
  ],
  'موظف إدخال بيانات': [
    'view_travelers',
    'create_edit_traveler',
    'view_reports',
    'import_documents'
  ],
  'مدخل بيانات': [
    'view_travelers',
    'create_edit_traveler',
    'view_reports',
    'import_documents'
  ]
};

export function getRoleCategory(role?: SovereignUserRole): RoleCategory {
  switch (role) {
    case 'مدير عام':
    case 'آدمن':
    case 'نائب مدير عام':
    case 'مدير إدارة':
    case 'رئيس قسم':
      return 'supervisor';
    case 'محقق أول':
    case 'محقق ميداني':
    case 'ضابط':
      return 'officer';
    default:
      return 'data_entry';
  }
}

export function getRoleCategoryLabel(role?: SovereignUserRole): string {
  const cat = getRoleCategory(role);
  if (cat === 'supervisor') return 'مشرف / قيادة';
  if (cat === 'officer') return 'ضابط منفذ / محقق';
  return 'موظف إدخال بيانات';
}

export function hasPermission(user: Pick<User, 'role' | 'status'> | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (user.status === 'موقوف') return false;
  const perms = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS['موظف إدخال بيانات'];
  return perms.includes(permission);
}

/**
 * تجزئة محلية آمنة وحتمية لكلمة المرور (Salted FNV-1a Multi-round Hash)
 */
export function hashPasswordLocal(password: string): string {
  const input = `SOVEREIGN_BORDER_2026::${password}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `shv1_${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

const MANAGED_USERS_KEY = 'sovereign_managed_users';

function buildSeededUsers(): ManagedUserAccount[] {
  const now = new Date().toISOString();
  const defaultHash = hashPasswordLocal('123456');
  return [
    {
      id: 'usr-1',
      username: 'admin',
      passwordHash: defaultHash,
      name: 'مدير العمليات المركزية',
      role: 'مدير عام',
      portOrDepartment: 'غرفة العمليات المركزية والسيطرة - المركز الرئيسي (صنعاء)',
      militaryNumber: '10001',
      status: 'نشط',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'usr-2',
      username: 'supervisor',
      passwordHash: defaultHash,
      name: 'مشرف المنافذ المناوب',
      role: 'مدير إدارة',
      portOrDepartment: 'مطار صنعاء الدولي',
      militaryNumber: '10204',
      status: 'نشط',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'usr-3',
      username: 'officer',
      passwordHash: defaultHash,
      name: 'نقيب / ضابط منفذ ومباينة',
      role: 'محقق أول',
      portOrDepartment: 'منفذ الوديعة البري',
      militaryNumber: '20418',
      status: 'نشط',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'usr-4',
      username: 'user',
      passwordHash: defaultHash,
      name: 'موظف إدخال الجوازات',
      role: 'موظف إدخال بيانات',
      portOrDepartment: 'منفذ شحن البري',
      militaryNumber: '30912',
      status: 'نشط',
      createdAt: now,
      updatedAt: now
    }
  ];
}

export function getManagedUsers(): ManagedUserAccount[] {
  try {
    const raw = kvGet(MANAGED_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore parse failure and re-seed
  }
  const seeded = buildSeededUsers();
  saveManagedUsers(seeded);
  return seeded;
}

export function saveManagedUsers(users: ManagedUserAccount[]): void {
  kvSet(MANAGED_USERS_KEY, JSON.stringify(users));
}

function appendSystemAuditEntry(
  actor: Pick<User, 'username' | 'name' | 'role' | 'portOrDepartment'>,
  action: AuditLogEntity['action'],
  targetModule: AuditLogEntity['targetModule'],
  details: string,
  targetRecordId?: string
) {
  const logs = getAuditLogs();
  const entry: AuditLogEntity = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    officerUsername: actor.username,
    officerName: actor.name,
    officerRole: actor.role,
    portOrDepartment: actor.portOrDepartment || 'المركز الرئيسي - العاصمة صنعاء',
    action,
    targetModule,
    targetRecordId,
    details,
    ipAddress: '127.0.0.1 (محلي)',
    deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 45) : 'نظام المراقبة'
  };
  saveAuditLogs([entry, ...logs].slice(0, 500));
}

export function authenticateManagedUser(
  usernameInput: string,
  passwordInput: string
): { success: true; user: User } | { success: false; error: string } {
  const username = usernameInput.trim().toLowerCase();
  const password = passwordInput || '';
  if (!username || !password) {
    return { success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' };
  }

  const users = getManagedUsers();
  const found = users.find(u => u.username.trim().toLowerCase() === username);
  if (!found) {
    appendSystemAuditEntry(
      { username, name: 'مجهول', role: 'موظف إدخال بيانات', portOrDepartment: 'بوابة الدخول' },
      'محاولة دخول فاشلة',
      'المصادقة',
      `محاولة دخول باسم مستخدم غير مسجل (${usernameInput})`
    );
    return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }

  if (found.status === 'موقوف') {
    appendSystemAuditEntry(
      found,
      'محاولة دخول فاشلة',
      'المصادقة',
      `رفض تسجيل الدخول لحساب موقوف (${found.username} - ${found.role})`,
      found.id
    );
    return { success: false, error: 'تم إيقاف هذا الحساب مؤقتاً من قبل المشرف الأمني.' };
  }

  const expectedHash = hashPasswordLocal(password);
  if (found.passwordHash !== expectedHash) {
    appendSystemAuditEntry(
      found,
      'محاولة دخول فاشلة',
      'المصادقة',
      `كلمة مرور غير صحيحة للحساب (${found.username})`,
      found.id
    );
    return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }

  const now = new Date().toISOString();
  const updatedList = users.map(u => (u.id === found.id ? { ...u, lastLoginAt: now } : u));
  saveManagedUsers(updatedList);

  const sessionUser: User = {
    id: found.id,
    username: found.username,
    name: found.name,
    role: found.role,
    portOrDepartment: found.portOrDepartment,
    militaryNumber: found.militaryNumber,
    status: found.status,
    lastLoginAt: now
  };
  setCurrentUser(sessionUser);

  appendSystemAuditEntry(
    sessionUser,
    'تسجيل دخول',
    'المصادقة',
    `تسجيل دخول ناجح بصلاحية (${found.role}) في (${found.portOrDepartment})`,
    found.id
  );

  return { success: true, user: sessionUser };
}

export function saveManagedUserAccount(input: {
  id?: string;
  username: string;
  password?: string;
  name: string;
  role: SovereignUserRole;
  portOrDepartment: string;
  militaryNumber?: string;
  status: 'نشط' | 'موقوف';
}): { ok: true; users: ManagedUserAccount[] } | { ok: false; error: string } {
  const cleanUsername = input.username.trim();
  const cleanName = input.name.trim();
  if (!cleanUsername || !cleanName) {
    return { ok: false, error: 'يرجى إدخال الاسم الكامل واسم المستخدم' };
  }

  const users = getManagedUsers();
  const duplicate = users.find(
    u => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.id !== input.id
  );
  if (duplicate) {
    return { ok: false, error: `اسم المستخدم (${cleanUsername}) مسجل لحساب آخر بالفعل` };
  }

  const now = new Date().toISOString();

  if (input.id) {
    const existing = users.find(u => u.id === input.id);
    if (!existing) return { ok: false, error: 'الحساب غير موجود' };

    const updatedAccount: ManagedUserAccount = {
      ...existing,
      username: cleanUsername,
      name: cleanName,
      role: input.role,
      portOrDepartment: input.portOrDepartment,
      militaryNumber: input.militaryNumber?.trim() || '',
      status: input.status,
      passwordHash: input.password?.trim() ? hashPasswordLocal(input.password.trim()) : existing.passwordHash,
      updatedAt: now
    };
    const next = users.map(u => (u.id === input.id ? updatedAccount : u));
    saveManagedUsers(next);

    // Sync active session if editing current user
    const active = getCurrentUser();
    if (active && active.id === updatedAccount.id) {
      setCurrentUser({
        ...active,
        username: updatedAccount.username,
        name: updatedAccount.name,
        role: updatedAccount.role,
        portOrDepartment: updatedAccount.portOrDepartment,
        militaryNumber: updatedAccount.militaryNumber,
        status: updatedAccount.status
      });
    }

    addAuditLog(
      'إدارة صلاحيات',
      'الأمان والصلاحيات',
      `تحديث حساب (${updatedAccount.username}) — الدور: ${updatedAccount.role}، المنفذ: ${updatedAccount.portOrDepartment}، الحالة: ${updatedAccount.status}`,
      updatedAccount.id
    );
    return { ok: true, users: next };
  }

  if (!input.password?.trim()) {
    return { ok: false, error: 'يرجى تحديد كلمة مرور مبدئية للحساب الجديد' };
  }

  const newAccount: ManagedUserAccount = {
    id: `usr-${generateId()}`,
    username: cleanUsername,
    passwordHash: hashPasswordLocal(input.password.trim()),
    name: cleanName,
    role: input.role,
    portOrDepartment: input.portOrDepartment || 'المركز الرئيسي - العاصمة صنعاء',
    militaryNumber: input.militaryNumber?.trim() || '',
    status: input.status || 'نشط',
    createdAt: now,
    updatedAt: now
  };

  const next = [newAccount, ...users];
  saveManagedUsers(next);
  addAuditLog(
    'إدارة صلاحيات',
    'الأمان والصلاحيات',
    `إنشاء حساب مستخدم جديد (${newAccount.username} - ${newAccount.name}) بصلاحية (${newAccount.role})`,
    newAccount.id
  );
  return { ok: true, users: next };
}

export function toggleManagedUserStatus(id: string): ManagedUserAccount[] {
  const users = getManagedUsers();
  const target = users.find(u => u.id === id);
  if (!target) return users;
  const nextStatus: 'نشط' | 'موقوف' = target.status === 'نشط' ? 'موقوف' : 'نشط';
  const next = users.map(u =>
    u.id === id ? { ...u, status: nextStatus, updatedAt: new Date().toISOString() } : u
  );
  saveManagedUsers(next);
  addAuditLog(
    'إدارة صلاحيات',
    'الأمان والصلاحيات',
    `${nextStatus === 'موقوف' ? 'إيقاف' : 'تفعيل'} حساب المستخدم (${target.username} - ${target.role})`,
    target.id
  );
  return next;
}

export function resetManagedUserPassword(id: string, newPassword: string): { ok: boolean; error?: string } {
  if (!newPassword || newPassword.trim().length < 4) {
    return { ok: false, error: 'يجب أن لا تقل كلمة المرور عن 4 أحرف' };
  }
  const users = getManagedUsers();
  const target = users.find(u => u.id === id);
  if (!target) return { ok: false, error: 'المستخدم غير موجود' };

  const next = users.map(u =>
    u.id === id
      ? { ...u, passwordHash: hashPasswordLocal(newPassword.trim()), updatedAt: new Date().toISOString() }
      : u
  );
  saveManagedUsers(next);
  addAuditLog(
    'إدارة صلاحيات',
    'الأمان والصلاحيات',
    `إعادة تعيين كلمة المرور لحساب (${target.username})`,
    target.id
  );
  return { ok: true };
}

export function deleteManagedUser(id: string): { ok: boolean; users: ManagedUserAccount[]; error?: string } {
  const users = getManagedUsers();
  const target = users.find(u => u.id === id);
  if (!target) return { ok: false, users, error: 'الحساب غير موجود' };
  const active = getCurrentUser();
  if (active && active.id === id) {
    return { ok: false, users, error: 'لا يمكن حذف الحساب المسجل دخوله حالياً' };
  }
  const next = users.filter(u => u.id !== id);
  saveManagedUsers(next);
  addAuditLog(
    'حذف',
    'الأمان والصلاحيات',
    `حذف حساب المستخدم (${target.username} - ${target.name})`,
    target.id
  );
  return { ok: true, users: next };
}
