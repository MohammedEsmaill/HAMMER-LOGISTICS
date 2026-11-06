/**
 * The catalog of every permission in the system. Roles store a subset of these keys;
 * the CEO picks them per role from this list.
 */
export const PERMISSIONS = {
  'roles.manage': 'إدارة الأدوار والصلاحيات',
  'users.manage': 'إدارة المستخدمين',
  'employees.manage': 'إدارة الموظفين',
  'employees.salary.view': 'عرض المرتبات',
  'clearers.manage': 'إدارة المستخلصين',
  'clearers.prices.manage': 'تعديل أسعار أتعاب المستخلصين',
  'clients.view': 'عرض العملاء والمصانع',
  'clients.manage': 'إدارة العملاء والمصانع والكوتيشن',
  'clients.quote.view': 'عرض كوتيشن العملاء',
  'lookups.manage': 'إدارة القوائم الثابتة',
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
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Held only by the system (CEO) role: no other role may be given these. */
export const CEO_ONLY_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'roles.manage',
  'clearers.prices.manage',
  'shipments.reassign',
]);

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
