import {
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
    to: '/lookups',
    label: 'القوائم الثابتة',
    icon: ListTree,
    any: ['lookups.add', 'lookups.manage'],
  },
];
