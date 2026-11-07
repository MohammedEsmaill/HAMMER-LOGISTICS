/**
 * Idempotent seed: default roles, fixed lists and the first CEO account.
 * The CEO's credentials come from the environment, never from the code:
 *   SEED_CEO_EMAIL, SEED_CEO_PASSWORD, SEED_CEO_NAME, SEED_CEO_NATIONAL_ID
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import countries from 'i18n-iso-countries';
import arabic from 'i18n-iso-countries/langs/ar.json';
import english from 'i18n-iso-countries/langs/en.json';
import {
  CEO_ONLY_PERMISSIONS,
  isPermission,
  Permission,
} from '../src/auth/permissions';
import {
  AIRLINES,
  EGYPT_AIRPORTS,
  EGYPT_SEA_PORTS,
  SHIPPING_LINES,
  STORAGE_YARDS,
  WORLD_AIRPORTS,
  WORLD_SEA_PORTS,
} from './seed-data/lookups';

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
      'settings.manage',
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
      'lookups.add',
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
    permissions: ['shipments.view.own', 'finance.ledger.own'],
  },
  {
    name: 'TREASURY_MANAGER',
    description: 'مدير الخزنة',
    permissions: [
      'employees.salary.view',
      'clients.view',
      'shipments.view.all',
      'finance.balances.view',
      'finance.movements.create',
      'finance.payroll.manage',
      'finance.expenses.manage',
      'finance.expenses.report',
      'finance.custody.manage',
      'finance.ledgers.view',
      'finance.client-ledger.view',
    ],
  },
  {
    name: 'ACCOUNTANT',
    description: 'المحاسب',
    permissions: [
      'clients.view',
      'shipments.view.all',
      'finance.review',
      'finance.shipment-account.view',
      'finance.statement.manage',
    ],
  },
  {
    name: 'ACCOUNTS_MANAGER',
    description: 'مدير الحسابات',
    permissions: [
      'clients.view',
      'shipments.view.all',
      'finance.manager_approve',
      'finance.ledgers.view',
      'finance.shipment-account.view',
      'finance.client-ledger.view',
    ],
  },
  {
    name: 'FINANCIAL_RELATIONS',
    description: 'مدير العلاقات المالية',
    permissions: [
      'clients.view',
      'clients.manage',
      'shipments.view.all',
      'finance.balances.view',
      'finance.ledgers.view',
      'finance.shipment-account.view',
      'finance.collections.manage',
      'finance.client-ledger.view',
    ],
  },
  {
    name: 'GENERAL_AUDITOR',
    description: 'المراجع العام',
    permissions: [
      'clients.view',
      'shipments.view.all',
      'audit.view',
      'finance.approve',
    ],
  },
];

/**
 * Permissions added to existing roles by a release. Each grant runs once per database
 * (recorded in settings), so a permission the CEO later removes is not given back.
 */
const GRANTS: { id: string; roles: Record<string, Permission[]> }[] = [
  {
    id: 'finance-phase-1',
    roles: {
      TREASURY_MANAGER: ['finance.balances.view', 'finance.movements.create'],
      ACCOUNTANT: ['finance.review'],
      ACCOUNTS_MANAGER: ['finance.manager_approve'],
      FINANCIAL_RELATIONS: ['finance.balances.view'],
      GENERAL_AUDITOR: ['finance.approve'],
    },
  },
  {
    id: 'finance-phase-2',
    roles: {
      TREASURY_MANAGER: [
        'finance.payroll.manage',
        'finance.expenses.manage',
        'finance.expenses.report',
      ],
    },
  },
  {
    id: 'finance-phase-3',
    roles: {
      TREASURY_MANAGER: ['finance.custody.manage', 'finance.ledgers.view'],
      ACCOUNTS_MANAGER: ['finance.ledgers.view'],
      FINANCIAL_RELATIONS: ['finance.ledgers.view'],
      CLEARER: ['finance.ledger.own'],
    },
  },
  {
    id: 'finance-phase-4',
    roles: {
      ACCOUNTANT: ['finance.shipment-account.view', 'finance.statement.manage'],
      ACCOUNTS_MANAGER: [
        'finance.shipment-account.view',
        'finance.client-ledger.view',
      ],
      FINANCIAL_RELATIONS: [
        'finance.shipment-account.view',
        'finance.collections.manage',
        'finance.client-ledger.view',
      ],
      TREASURY_MANAGER: ['finance.client-ledger.view'],
    },
  },
  {
    // HR adds the company emails with the users and accounts
    id: 'hr-company-settings',
    roles: { HR: ['settings.manage'] },
  },
];

const CASH_BOXES = [
  { name: 'خزنة الجنيه', currency: 'EGP' },
  { name: 'خزنة الدولار', currency: 'USD' },
] as const;

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
  // drop permissions that left the catalog or became CEO-only
  for (const role of await prisma.role.findMany({
    where: { isSystem: false },
  })) {
    const kept = role.permissions.filter(
      (p) => isPermission(p) && !CEO_ONLY_PERMISSIONS.has(p),
    );
    if (kept.length !== role.permissions.length) {
      await prisma.role.update({
        where: { id: role.id },
        data: { permissions: kept },
      });
    }
  }

  const applied = await prisma.setting.findUnique({
    where: { key: 'seed.grants' },
  });
  const done = new Set((applied?.value as string[] | undefined) ?? []);
  for (const grant of GRANTS.filter((g) => !done.has(g.id))) {
    for (const [name, permissions] of Object.entries(grant.roles)) {
      const role = await prisma.role.findUnique({ where: { name } });
      if (!role) continue;
      const merged = [...new Set([...role.permissions, ...permissions])];
      await prisma.role.update({
        where: { id: role.id },
        data: { permissions: merged },
      });
    }
    done.add(grant.id);
  }
  await prisma.setting.upsert({
    where: { key: 'seed.grants' },
    update: { value: [...done] },
    create: { key: 'seed.grants', value: [...done] },
  });

  for (const box of CASH_BOXES) {
    const exists = await prisma.moneyAccount.findFirst({
      where: { type: 'CASH', currency: box.currency },
    });
    if (!exists) {
      await prisma.moneyAccount.create({ data: { ...box, type: 'CASH' } });
    }
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
        name: 'HAMMER LINE Shipping & Logistics',
        address:
          '27 Abdel Hamid Badawy St., Off Chamollion, Al-Azarita, Alexandria, Egypt',
        taxNumber: '655-517-626',
        crNumber: '11731',
      },
    },
  });

  await seedLookups();
  await seedCeo();
}

async function seedLookups() {
  countries.registerLocale(arabic);
  countries.registerLocale(english);
  for (const code of Object.keys(countries.getAlpha2Codes())) {
    const nameEn = countries.getName(code, 'en') ?? code;
    const nameAr = countries.getName(code, 'ar') ?? nameEn;
    await prisma.country.upsert({
      where: { code },
      update: {},
      create: { code, nameAr, nameEn },
    });
  }
  const countryId = new Map(
    (await prisma.country.findMany()).map((c) => [c.code, c.id]),
  );

  const ports: {
    name: string;
    code: string | null;
    kind: 'SEA' | 'AIR';
    country: string;
  }[] = [
    ...EGYPT_SEA_PORTS.map(([name, code]) => ({
      name,
      code,
      kind: 'SEA' as const,
      country: 'EG',
    })),
    ...EGYPT_AIRPORTS.map(([name, code]) => ({
      name,
      code,
      kind: 'AIR' as const,
      country: 'EG',
    })),
    ...WORLD_SEA_PORTS.map(([name, code]) => ({
      name,
      code,
      kind: 'SEA' as const,
      country: code.slice(0, 2),
    })),
    ...WORLD_AIRPORTS.map(([name, code, country]) => ({
      name,
      code,
      kind: 'AIR' as const,
      country,
    })),
  ];
  for (const port of ports) {
    await prisma.port.upsert({
      where: { kind_name: { kind: port.kind, name: port.name } },
      update: {},
      create: {
        name: port.name,
        code: port.code,
        kind: port.kind,
        countryId: countryId.get(port.country)!,
        isEgyptian: port.country === 'EG',
      },
    });
  }

  const carriers = [
    ...SHIPPING_LINES.map((name, i) => ({
      name,
      kind: 'SEA' as const,
      sortOrder: i + 1,
    })),
    ...AIRLINES.map((name, i) => ({
      name,
      kind: 'AIR' as const,
      sortOrder: i + 1,
    })),
  ];
  for (const { name, kind, sortOrder } of carriers) {
    // only create: the CEO may have reordered the list since
    await prisma.carrier.upsert({
      where: { kind_name: { kind, name } },
      update: {},
      create: { name, kind, sortOrder },
    });
  }

  for (const group of STORAGE_YARDS) {
    const port = await prisma.port.findFirstOrThrow({
      where: {
        kind: group.kind,
        OR: [{ code: group.port }, { name: group.port }],
      },
    });
    for (const name of group.names) {
      await prisma.storageYard.upsert({
        where: { kind_name: { kind: group.kind, name } },
        update: {},
        create: { name, kind: group.kind, portId: port.id },
      });
    }
  }
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
  const ceoEmail = email.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@hammerline\.com$/.test(ceoEmail)) {
    throw new Error(
      `SEED_CEO_EMAIL "${email}" is not valid: it must be name@hammerline.com, with no spaces.`,
    );
  }
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  // the employee and the account together, or neither; an employee left by an
  // earlier failed run is reused
  await prisma.$transaction(async (tx) => {
    const employee =
      (await tx.employee.findFirst({ where: { code: 'CEO', deletedAt: null, users: { none: {} } } })) ??
      (await tx.employee.create({
        data: {
          code: 'CEO',
          fullName: process.env.SEED_CEO_NAME || 'CEO',
          nationalId: process.env.SEED_CEO_NATIONAL_ID || '00000000000000',
          phone: '',
          department: 'MANAGEMENT',
          jobTitle: 'CEO',
          hireDate: new Date(),
        },
      }));
    await tx.user.create({
      data: {
        email: ceoEmail,
        passwordHash,
        roleId: ceoRole.id,
        accountType: 'EMPLOYEE',
        employeeId: employee.id,
      },
    });
  });
  console.log(`Created CEO account ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
