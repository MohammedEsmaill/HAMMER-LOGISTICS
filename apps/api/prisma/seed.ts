/**
 * Idempotent seed: default roles, fixed lists and the first CEO account.
 * The CEO's credentials come from the environment, never from the code:
 *   SEED_CEO_EMAIL, SEED_CEO_PASSWORD, SEED_CEO_NAME, SEED_CEO_NATIONAL_ID
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { Permission } from '../src/auth/permissions';

const prisma = new PrismaClient();

const SHIPMENT_STAGE_OPS: Permission[] = [
  'shipments.stage.operation',
  'shipments.stage.customs',
];

const ROLES: {
  name: string;
  description: string;
  permissions: Permission[];
}[] = [
  {
    name: 'HR',
    description: 'الموظفين والمستخدمين والمستخلصين',
    permissions: [
      'users.manage',
      'employees.manage',
      'employees.salary.view',
      'clearers.manage',
    ],
  },
  {
    name: 'SCAN',
    description: 'تسجيل الشحنات وتحديثها طول التشغيل',
    permissions: [
      'clients.view',
      'shipments.view.all',
      'shipments.create',
      'shipments.basic.update',
      'shipments.operation.update',
      'shipments.customs.update',
      ...SHIPMENT_STAGE_OPS,
      'shipments.documents.upload',
      'shipments.documents.delete',
    ],
  },
  {
    name: 'OPERATION',
    description: 'متابعة شحنات عملائه من التبليغ للصرف',
    permissions: [
      'clients.view',
      'shipments.view.own',
      'shipments.operation.update',
      'shipments.customs.update',
      ...SHIPMENT_STAGE_OPS,
      'shipments.documents.upload',
    ],
  },
  {
    name: 'NAFEZA',
    description: 'الإجراءات على النافذة الموحدة',
    permissions: [
      'clients.view',
      'shipments.view.all',
      'shipments.customs.update',
      'shipments.stage.customs',
      'shipments.documents.upload',
    ],
  },
  {
    name: 'AGENT',
    description: 'مندوب توكيلات',
    permissions: ['shipments.view.all'],
  },
  {
    name: 'CLEARER',
    description: 'مستخلص',
    permissions: ['shipments.view.own'],
  },
  {
    name: 'TREASURY_MANAGER',
    description: 'مدير الخزنة',
    permissions: [
      'employees.salary.view',
      'clients.view',
      'shipments.view.all',
    ],
  },
  {
    name: 'ACCOUNTANT',
    description: 'المحاسب',
    permissions: ['clients.quote.view', 'clients.view', 'shipments.view.all'],
  },
  {
    name: 'ACCOUNTS_MANAGER',
    description: 'مدير الحسابات',
    permissions: ['clients.quote.view', 'clients.view', 'shipments.view.all'],
  },
  {
    name: 'FINANCIAL_RELATIONS',
    description: 'مدير العلاقات المالية',
    permissions: ['clients.view', 'clients.manage', 'shipments.view.all'],
  },
  {
    name: 'GENERAL_AUDITOR',
    description: 'المراجع العام',
    permissions: ['clients.view', 'shipments.view.all', 'audit.view'],
  },
];

const FREE_ZONES = [
  'منطقة حرة إسماعيلية',
  'إدارة جمرك الإسماعيلية',
  'إدارة جمرك العامرية',
  'إدارة جمرك بورسعيد مدينة حرة',
  'الإدارة الجمركية بالمنطقة الحرة ببورتوفيق',
  'اللجنة الجمركية للمنطقة الحرة بمدينة نصر',
  'المنطقة الحرة دمياط',
  'مدينة الإنتاج الإعلامي 6 أكتوبر',
  'جمرك المنطقة الحرة الأدبية',
];

const INSPECTION_AUTHORITIES = [
  'زراعة',
  'مخدرات',
  'واردات',
  'طاقة ذرية',
  'حماية مدنية',
];

async function main() {
  await prisma.role.upsert({
    where: { name: 'CEO' },
    update: { isSystem: true },
    create: {
      name: 'CEO',
      description: 'كل الصلاحيات',
      permissions: [],
      isSystem: true,
    },
  });
  for (const role of ROLES) {
    // only create: never overwrite permissions the CEO has since changed
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  for (const name of FREE_ZONES) {
    await prisma.freeZone.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  for (const name of INSPECTION_AUTHORITIES) {
    await prisma.inspectionAuthority.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  await prisma.setting.upsert({
    where: { key: 'company' },
    update: {},
    create: {
      key: 'company',
      value: {
        name: 'HORUS NEW LOGISTICS',
        address:
          '27 Abdel Hamid Badawy St., Off Chamollion, Al-Azarita, Alexandria, Egypt',
        taxNumber: '655-517-626',
        crNumber: '11731',
      },
    },
  });

  await seedCeo();
}

async function seedCeo() {
  const ceoRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'CEO' },
  });
  const existing = await prisma.user.count({
    where: { roleId: ceoRole.id, deletedAt: null },
  });
  if (existing > 0) return;

  const email = process.env.SEED_CEO_EMAIL;
  const password = process.env.SEED_CEO_PASSWORD;
  if (!email || !password) {
    console.warn(
      'No CEO account yet: set SEED_CEO_EMAIL and SEED_CEO_PASSWORD and run the seed again.',
    );
    return;
  }
  const employee = await prisma.employee.create({
    data: {
      code: 'CEO',
      fullName: process.env.SEED_CEO_NAME ?? 'CEO',
      nationalId: process.env.SEED_CEO_NATIONAL_ID ?? '00000000000000',
      phone: '',
      department: 'MANAGEMENT',
      jobTitle: 'CEO',
      hireDate: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      roleId: ceoRole.id,
      accountType: 'EMPLOYEE',
      employeeId: employee.id,
    },
  });
  console.log(`Created CEO account ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
