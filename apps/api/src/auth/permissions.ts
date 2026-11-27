/**
 * The catalog of every permission in the system. Roles store a subset of these keys;
 * the CEO picks them per role from this list.
 */
export const PERMISSIONS = {
  'roles.manage': 'إدارة الأدوار والصلاحيات',
  'users.manage': 'إدارة المستخدمين',
  'users.signatures': 'رفع توقيعات المستخدمين اللي بتظهر على الفواتير',
  'employees.manage': 'إدارة الموظفين',
  'employees.salary.view': 'عرض المرتبات',
  'clearers.manage': 'إدارة المستخلصين وأسعار أتعابهم',
  'clients.view': 'عرض العملاء والمصانع',
  'clients.manage': 'إدارة العملاء والمصانع والكوتيشن',
  'lookups.add': 'إضافة عناصر للقوائم الثابتة (موانئ، خطوط، ساحات...)',
  'lookups.manage': 'تعديل وحذف عناصر القوائم الثابتة',
  'shipments.view.all': 'عرض كل الشحنات',
  'shipments.view.own': 'عرض الشحنات المسؤول عنها بس',
  'shipments.create': 'تسجيل شحنة جديدة',
  'shipments.basic.update': 'تعديل البيانات الأساسية والحاويات',
  'shipments.operation.update': 'تعديل اسم المركب والـ ETA',
  'shipments.customs.update': 'تعديل تاب النافذة والعروض الرقابية',
  'shipments.stage.operation': 'تحريك مراحل التشغيل',
  'shipments.stage.customs': 'تحريك مراحل النافذة',
  'shipments.reassign': 'تغيير موظف الأوبريشن على شحنة',
  'shipments.documents.upload': 'رفع مستندات الشحنة',
  'shipments.documents.delete': 'حذف مستندات الشحنة',
  'audit.view': 'عرض سجل العمليات',
  'documents.view.all': 'مركز المستندات: كل العملاء',
  'documents.view.own': 'مركز المستندات: عملائي بس',
  'documents.manage': 'رفع وتعديل وحذف مستندات العملاء والمصانع',
  'finance.accounts.manage': 'إضافة وتعديل وإيقاف الحسابات البنكية',
  'finance.balances.view': 'عرض أرصدة الخزن والبنوك وحركتها',
  'finance.movements.create':
    'تسجيل التحويلات والمعاملات الأخرى على الخزن والبنوك',
  'finance.review': 'مراجعة الحركات المالية (المراجع العام)',
  'finance.manager_approve':
    'موافقة مدير الحسابات (الدورة القديمة، مش مستخدمة)',
  'finance.approve': 'الاعتماد النهائي للحركات المالية (مدير الحسابات)',
  'finance.approved.edit': 'تعديل حركة مالية بعد اعتمادها',
  'finance.payroll.manage': 'صرف المرتبات والسلف وكشوف السلف',
  'finance.expenses.manage': 'صرف المصاريف العمومية',
  'finance.expenses.report': 'تقرير المصاريف العمومية',
  'finance.custody.manage': 'صرف العهد',
  'finance.custody.settle': 'تصفية العهد',
  'finance.fees.pay': 'صرف أتعاب المستخلصين',
  'finance.fees.adjust': 'تعديل أتعاب مستخلص على شحنة (تسوية)',
  'finance.ledgers.view': 'كشوف حساب المستخلصين والمندوبين',
  'finance.ledger.own': 'كشف حسابي (للمستخلص)',
  'finance.shipment-account.view': 'عرض حساب الشحنة والـ STATEMENT والفواتير',
  'finance.statement.manage':
    'كشف حساب الشحنة: إنهاؤه وإصدار فواتير العميل وطباعتها',
  'finance.collections.manage': 'تسجيل التحصيل من العملاء',
  'finance.client-ledger.view': 'كشوف حساب العملاء',
  'finance.profit.view':
    'ربحية الشحنات (الإيراد والتكلفة وصافي الربح لكل شحنة)',
  'finance.journal.view': 'عرض اليوميات والتقارير المالية',
  'finance.gl.view': 'دليل الحسابات وميزان المراجعة ودفتر الأستاذ العام',
  'finance.months.close': 'قفل الشهور المالية',
  'finance.bank.reconcile': 'تسوية الحسابات البنكية مع كشف البنك',
  'assets.manage': 'الأصول الثابتة: تسجيل الأجهزة وتعديل بياناتها ومين ماسكها',
  'assets.transact': 'الأصول الثابتة: شراء وبيع وتكهين (فيها فلوس)',
  'finance.prices.manage': 'تعديل أسعار أتعاب المستخلص وبنود التصفية',
  'finance.bank.record': 'تسجيل الصرف من الحسابات البنكية (التحويلات والشيكات)',
  'finance.parties.view': 'عرض الحسابات الداخلية (الشركات الشقيقة والملاك)',
  'finance.parties.record': 'تسجيل حركة الحسابات الداخلية',
  'finance.parties.manage': 'إضافة وتعديل جهات الحسابات الداخلية',
  'settings.manage': 'إعدادات الشركة (بيانات الفواتير)',
  'notifications.manage': 'ربط واتساب وإدارة إشعارات مجموعة الموظفين',
  'backups.manage': 'النسخ الاحتياطي واسترجاع البيانات',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** The moderator role: it alone (beside the CEO) may hold the permissions below. */
export const MODERATOR_ROLE = 'MODERATOR';

/** Held by the CEO and the moderator role only. */
export const MODERATOR_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'clearers.manage',
  'shipments.reassign',
  'finance.prices.manage',
  'finance.accounts.manage',
  'finance.parties.manage',
  'users.signatures',
]);

/** Whether a role may hold a permission (the CEO role holds them all). */
export const mayHold = (roleName: string, p: Permission) =>
  !CEO_ONLY_PERMISSIONS.has(p) &&
  (!MODERATOR_PERMISSIONS.has(p) || roleName === MODERATOR_ROLE);

/** Held only by the system (CEO) role: no other role may be given these. */
export const CEO_ONLY_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'roles.manage',
  'finance.approved.edit',
  'finance.fees.adjust',
  'notifications.manage',
  'backups.manage',
]);

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
