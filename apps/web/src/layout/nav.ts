import {
  BadgeCheck,
  Calculator,
  Contact,
  Settings,
  BookOpenText,
  Briefcase,
  HandCoins,
  Receipt,
  Landmark,
  Building2,
  Container,
  HardHat,
  LayoutDashboard,
  ListTree,
  NotebookPen,
  FileBarChart,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/auth/permissions';

export type NavGroup = 'operations' | 'finance' | 'admin';

/** The sidebar sections, in order. */
export const NAV_GROUPS: { key: NavGroup; label: string }[] = [
  { key: 'operations', label: 'التشغيل' },
  { key: 'finance', label: 'المالية' },
  { key: 'admin', label: 'الإدارة' },
];

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** The sidebar section; none = above the sections (home). */
  group?: NavGroup;
  /** Shown to users holding any of these; empty = every logged-in user. */
  any: Permission[];
}

/** One list drives the sidebar, the route guards and the home page shortcuts. */
export const NAV: NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard, any: [] },
  {
    to: '/shipments',
    label: 'الشحنات',
    icon: Container,
    group: 'operations',
    any: ['shipments.view.all', 'shipments.view.own'],
  },
  {
    to: '/journal',
    label: 'اليوميات',
    icon: NotebookPen,
    group: 'finance',
    any: ['finance.journal.view'],
  },
  {
    to: '/treasury',
    label: 'الخزن والحسابات البنكية',
    icon: Landmark,
    group: 'finance',
    any: ['finance.balances.view', 'finance.accounts.manage'],
  },
  {
    to: '/approvals',
    label: 'الاعتمادات',
    icon: BadgeCheck,
    group: 'finance',
    any: [
      'finance.review',
      'finance.manager_approve',
      'finance.approve',
      'finance.approved.edit',
      'finance.movements.create',
    ],
  },
  {
    to: '/payroll',
    label: 'المرتبات والسلف',
    icon: HandCoins,
    group: 'finance',
    any: ['finance.payroll.manage', 'finance.approve'],
  },
  {
    to: '/expenses',
    label: 'المصاريف العمومية',
    icon: Receipt,
    group: 'finance',
    any: ['finance.expenses.manage', 'finance.expenses.report'],
  },
  {
    to: '/custodies',
    label: 'العهد',
    icon: Briefcase,
    group: 'finance',
    any: ['finance.custody.manage', 'finance.ledgers.view', 'finance.review', 'finance.manager_approve', 'finance.approve'],
  },
  {
    to: '/ledgers',
    label: 'كشوف الحساب',
    icon: BookOpenText,
    group: 'finance',
    any: ['finance.ledgers.view', 'finance.ledger.own'],
  },
  {
    to: '/shipment-accounts',
    label: 'حسابات الشحنات',
    icon: Calculator,
    group: 'finance',
    any: ['finance.shipment-account.view', 'finance.statement.manage', 'finance.collections.manage'],
  },
  {
    to: '/client-ledgers',
    label: 'حسابات العملاء',
    icon: Contact,
    group: 'finance',
    any: ['finance.client-ledger.view'],
  },
  {
    to: '/reports',
    label: 'التقارير',
    icon: FileBarChart,
    group: 'finance',
    any: ['finance.journal.view'],
  },
  { to: '/clients', label: 'العملاء والمصانع', icon: Building2, group: 'admin', any: ['clients.view'] },
  { to: '/employees', label: 'الموظفين', icon: Users, group: 'admin', any: ['employees.manage'] },
  { to: '/clearers', label: 'المستخلصين', icon: HardHat, group: 'admin', any: ['clearers.manage'] },
  { to: '/users', label: 'المستخدمين', icon: UserCog, group: 'admin', any: ['users.manage'] },
  { to: '/roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck, group: 'admin', any: ['roles.manage'] },
  {
    to: '/lookups',
    label: 'القوائم الثابتة',
    icon: ListTree,
    group: 'admin',
    any: ['lookups.add', 'lookups.manage'],
  },
  { to: '/settings', label: 'إعدادات الشركة', icon: Settings, group: 'admin', any: ['settings.manage'] },
];
