/**
 * Mirror of the API's permission catalog (apps/api/src/auth/permissions.ts). The UI
 * uses it only to hide what the user cannot do; the API checks every request anyway.
 */
export type Permission =
  | 'roles.manage'
  | 'users.manage'
  | 'employees.manage'
  | 'employees.salary.view'
  | 'clearers.manage'
  | 'clients.view'
  | 'clients.manage'
  | 'lookups.add'
  | 'lookups.manage'
  | 'shipments.view.all'
  | 'shipments.view.own'
  | 'shipments.create'
  | 'shipments.basic.update'
  | 'shipments.operation.update'
  | 'shipments.customs.update'
  | 'shipments.stage.operation'
  | 'shipments.stage.customs'
  | 'shipments.reassign'
  | 'shipments.documents.upload'
  | 'shipments.documents.delete'
  | 'audit.view'
  | 'finance.accounts.manage'
  | 'finance.balances.view'
  | 'finance.movements.create'
  | 'finance.review'
  | 'finance.manager_approve'
  | 'finance.approve'
  | 'finance.approved.edit'
  | 'finance.payroll.manage'
  | 'finance.expenses.manage'
  | 'finance.expenses.report';

export interface Profile {
  id: number;
  email: string;
  name: string;
  accountType: 'EMPLOYEE' | 'CLEARER';
  role: { id: number; name: string };
  permissions: Permission[];
}
