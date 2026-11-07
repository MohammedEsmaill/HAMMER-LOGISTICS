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
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/auth/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
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
    any: ['shipments.view.all', 'shipments.view.own'],
  },
  { to: '/clients', label: 'العملاء والمصانع', icon: Building2, any: ['clients.view'] },
  { to: '/employees', label: 'الموظفين', icon: Users, any: ['employees.manage'] },
  { to: '/clearers', label: 'المستخلصين', icon: HardHat, any: ['clearers.manage'] },
  { to: '/users', label: 'المستخدمين', icon: UserCog, any: ['users.manage'] },
  { to: '/roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck, any: ['roles.manage'] },
  {
    to: '/treasury',
    label: 'الخزن والبنوك',
    icon: Landmark,
    any: ['finance.balances.view', 'finance.movements.create', 'finance.accounts.manage'],
  },
  {
    to: '/payroll',
    label: 'المرتبات والسلف',
    icon: HandCoins,
    any: ['finance.payroll.manage', 'finance.approve'],
  },
  {
    to: '/expenses',
    label: 'المصاريف العمومية',
    icon: Receipt,
    any: ['finance.expenses.manage', 'finance.expenses.report'],
  },
  {
    to: '/custodies',
    label: 'العهد',
    icon: Briefcase,
    any: ['finance.custody.manage', 'finance.ledgers.view', 'finance.review', 'finance.manager_approve', 'finance.approve'],
  },
  {
    to: '/ledgers',
    label: 'كشوف الحساب',
    icon: BookOpenText,
    any: ['finance.ledgers.view', 'finance.ledger.own'],
  },
  {
    to: '/shipment-accounts',
    label: 'حسابات الشحنات',
    icon: Calculator,
    any: ['finance.shipment-account.view', 'finance.statement.manage', 'finance.collections.manage'],
  },
  {
    to: '/client-ledgers',
    label: 'حسابات العملاء',
    icon: Contact,
    any: ['finance.client-ledger.view'],
  },
  {
    to: '/approvals',
    label: 'الاعتمادات',
    icon: BadgeCheck,
    any: [
      'finance.review',
      'finance.manager_approve',
      'finance.approve',
      'finance.approved.edit',
      'finance.movements.create',
    ],
  },
  {
    to: '/lookups',
    label: 'القوائم الثابتة',
    icon: ListTree,
    any: ['lookups.add', 'lookups.manage'],
  },
  { to: '/settings', label: 'إعدادات الشركة', icon: Settings, any: ['settings.manage'] },
];
