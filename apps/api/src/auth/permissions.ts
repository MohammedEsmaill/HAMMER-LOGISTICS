/**
 * The catalog of every permission in the system. Roles store a subset of these keys;
 * the CEO picks them per role from this list.
 */
export const PERMISSIONS = {
  'roles.manage': 'إدارة الأدوار والصلاحيات',
  'users.manage': 'إدارة المستخدمين',
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
  'finance.accounts.manage': 'إضافة وتعديل وإيقاف الحسابات البنكية',
  'finance.balances.view': 'عرض أرصدة الخزن والبنوك وحركتها',
  'finance.movements.create':
    'تسجيل التحويلات والحركات التانية على الخزن والبنوك',
  'finance.review': 'مراجعة الحركات المالية (المستوى الأول)',
  'finance.manager_approve': 'موافقة مدير الحسابات على الحركات المالية',
  'finance.approve': 'الاعتماد النهائي للحركات المالية',
  'finance.approved.edit': 'تعديل حركة مالية بعد اعتمادها',
  'finance.payroll.manage': 'صرف المرتبات والسلف وكشوف السلف',
  'finance.expenses.manage': 'صرف المصاريف العمومية',
  'finance.expenses.report': 'تقرير المصاريف العمومية',
  'finance.custody.manage': 'صرف العهد وتصفيتها وصرف أتعاب المستخلصين',
  'finance.fees.adjust': 'تعديل أتعاب مستخلص على شحنة (تسوية)',
  'finance.ledgers.view': 'كشوف حساب المستخلصين والمندوبين',
  'finance.ledger.own': 'كشف حسابي (للمستخلص)',
  'finance.shipment-account.view': 'عرض حساب الشحنة والـ STATEMENT والفواتير',
  'finance.statement.manage': 'تجهيز كشف حساب الشحنة وإنهاؤه وإصدار الفواتير',
  'finance.collections.manage': 'تسجيل التحصيل من العملاء',
  'finance.client-ledger.view': 'كشوف حساب العملاء',
  'finance.journal.view': 'عرض اليوميات والتقارير المالية',
  'settings.manage': 'إعدادات الشركة (بيانات الفواتير)',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Held only by the system (CEO) role: no other role may be given these. */
export const CEO_ONLY_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'roles.manage',
  'clearers.manage',
  'shipments.reassign',
  'finance.accounts.manage',
  'finance.approved.edit',
  'finance.fees.adjust',
]);

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
