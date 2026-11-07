import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { AuthUser, can } from '../../auth/auth-user';
import { Permission } from '../../auth/permissions';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { ApprovalQueryDto } from './approval.dto';
import {
  APPROVABLE,
  ApprovableType,
  ApprovalFlow,
  RESTRICTED_TYPES,
} from './approvable';

export { APPROVABLE, APPROVABLE_TYPES } from './approvable';
export type { ApprovableType } from './approvable';

export type ApprovalAction =
  'review' | 'manager-approve' | 'approve' | 'reject';

interface Step {
  from: ApprovalStatus;
  to: ApprovalStatus;
  permission: Permission;
  by: string;
}

/** Each step: the status it starts from, the one it leads to, who may take it. */
const THREE_LEVEL_STEPS: Partial<
  Record<Exclude<ApprovalAction, 'reject'>, Step>
> = {
  review: {
    from: 'PENDING',
    to: 'REVIEWED',
    permission: 'finance.review',
    by: 'reviewed',
  },
  'manager-approve': {
    from: 'REVIEWED',
    to: 'MANAGER_APPROVED',
    permission: 'finance.manager_approve',
    by: 'manager',
  },
  approve: {
    from: 'MANAGER_APPROVED',
    to: 'APPROVED',
    permission: 'finance.approve',
    by: 'approved',
  },
};

const FINAL_ONLY_STEPS: Partial<
  Record<Exclude<ApprovalAction, 'reject'>, Step>
> = {
  approve: {
    from: 'PENDING',
    to: 'APPROVED',
    permission: 'finance.approve',
    by: 'approved',
  },
};

const STEPS: Record<ApprovalFlow, typeof THREE_LEVEL_STEPS> = {
  THREE_LEVELS: THREE_LEVEL_STEPS,
  FINAL_ONLY: FINAL_ONLY_STEPS,
};

/** Whose turn it is at each status: that level may move it on or reject it. */
const TURNS: Record<
  ApprovalFlow,
  Partial<Record<ApprovalStatus, Permission>>
> = {
  THREE_LEVELS: {
    PENDING: 'finance.review',
    REVIEWED: 'finance.manager_approve',
    MANAGER_APPROVED: 'finance.approve',
  },
  FINAL_ONLY: { PENDING: 'finance.approve' },
};

const turnOf = (type: ApprovableType, status: ApprovalStatus) =>
  TURNS[APPROVABLE[type].flow][status];

/** Salary data (salaries, advances) is seen by payroll, the general auditor and the CEO. */
export function canSeeRestricted(actor: AuthUser): boolean {
  return can(actor, 'finance.payroll.manage') || can(actor, 'finance.approve');
}

export const APPROVAL_PERMISSIONS: Permission[] = [
  'finance.review',
  'finance.manager_approve',
  'finance.approve',
];

/** The approval columns every financial document carries, reset by an edit. */
export const APPROVAL_RESET = {
  approvalStatus: 'PENDING',
  reviewedById: null,
  reviewedAt: null,
  managerById: null,
  managerAt: null,
  approvedById: null,
  approvedAt: null,
  rejectedById: null,
  rejectedAt: null,
  rejectionReason: null,
} as const;

interface DocumentRow {
  id: number;
  approval_status: ApprovalStatus;
  created_by: number;
  version: number;
}

export interface FinancialOperation {
  type: ApprovableType;
  id: number;
  currency: string;
  amount: Prisma.Decimal;
  operation_date: Date;
  approval_status: ApprovalStatus;
  created_by: number;
  created_at: Date;
  version: number;
  rejection_reason: string | null;
}

/**
 * The 3-level approval of every financial document (spec section 15). Approval
 * reviews what already happened: balances moved when the document was saved.
 */
@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async act(
    actor: AuthUser,
    type: ApprovableType,
    id: number,
    action: ApprovalAction,
    version: number,
    reason?: string,
  ) {
    const { table, restricted } = APPROVABLE[type];
    if (restricted && !canSeeRestricted(actor)) {
      throw new NotFoundException('الحركة غير موجودة');
    }
    return this.prisma.$transaction(async (tx) => {
      const doc = await this.find(tx, table, id);
      if (doc.version !== version) {
        throw new ConflictException(
          'الحركة اتعدلت بعد ما فتحتها، حدّث الصفحة وحاول تاني',
        );
      }
      if (doc.created_by === actor.id) {
        throw new ForbiddenException(
          'مينفعش تراجع أو تعتمد حركة انت اللي سجلتها',
        );
      }
      const turn = turnOf(type, doc.approval_status);
      let set: Prisma.Sql;
      let to: ApprovalStatus;
      if (action === 'reject') {
        if (!turn) {
          throw new BadRequestException(
            doc.approval_status === 'APPROVED'
              ? 'الحركة اتعتمدت خلاص'
              : 'الحركة مرفوضة بالفعل ومستنية تعديل صاحبها',
          );
        }
        if (!can(actor, turn)) {
          throw new ForbiddenException('الدور مش عليك في الحركة دي');
        }
        if (!reason || reason.trim().length < 3) {
          throw new BadRequestException('اكتب سبب الرفض');
        }
        to = 'REJECTED';
        set = Prisma.sql`"rejected_by" = ${actor.id}, "rejected_at" = now(), "rejection_reason" = ${reason.trim()}`;
      } else {
        const step = STEPS[APPROVABLE[type].flow][action];
        if (!step) {
          throw new BadRequestException(
            `${APPROVABLE[type].label} بيتعتمد من المراجع العام مباشرة`,
          );
        }
        if (!can(actor, step.permission)) {
          throw new ForbiddenException('ليس لديك صلاحية لهذا الإجراء');
        }
        if (doc.approval_status !== step.from) {
          throw new BadRequestException(
            `الحركة مش في المرحلة دي (حالتها: ${STATUS_LABELS[doc.approval_status]})`,
          );
        }
        to = step.to;
        set = Prisma.sql`${Prisma.raw(`"${step.by}_by"`)} = ${actor.id}, ${Prisma.raw(`"${step.by}_at"`)} = now()`;
      }
      await tx.$executeRaw`
        UPDATE ${Prisma.raw(`"${table}"`)}
           SET "approval_status" = ${to}::"ApprovalStatus", ${set},
               "version" = "version" + 1, "updated_at" = now()
         WHERE "id" = ${id}`;
      await this.audit.log(
        {
          userId: actor.id,
          action: `APPROVAL_${action.toUpperCase().replace('-', '_')}`,
          entity: table,
          entityId: id,
          before: { approvalStatus: doc.approval_status },
          after: { approvalStatus: to, ...(reason ? { reason } : {}) },
        },
        tx,
      );
      return { type, id, approvalStatus: to, version: doc.version + 1 };
    });
  }

  /** The approval screen: every document, filtered, newest first. */
  async list(actor: AuthUser, q: ApprovalQueryDto) {
    const where: Prisma.Sql[] = [];
    if (q.status) where.push(Prisma.sql`"approval_status" = ${q.status}`);
    if (q.type) where.push(Prisma.sql`"type" = ${q.type}`);
    if (q.from) where.push(Prisma.sql`"operation_date" >= ${q.from}`);
    if (q.to) where.push(Prisma.sql`"operation_date" <= ${q.to}`);
    if (q.createdBy) where.push(Prisma.sql`"created_by" = ${q.createdBy}`);
    if (q.minAmount !== undefined)
      where.push(Prisma.sql`"amount" >= ${q.minAmount}`);
    if (q.maxAmount !== undefined)
      where.push(Prisma.sql`"amount" <= ${q.maxAmount}`);
    if (q.mine) where.push(Prisma.sql`"created_by" = ${actor.id}`);
    if (!canSeeRestricted(actor)) {
      where.push(Prisma.sql`"type" NOT IN (${Prisma.join(RESTRICTED_TYPES)})`);
    }
    // someone who only records documents sees their own
    if (
      !APPROVAL_PERMISSIONS.some((p) => can(actor, p)) &&
      !can(actor, 'finance.approved.edit')
    ) {
      where.push(Prisma.sql`"created_by" = ${actor.id}`);
    }
    const filter = where.length
      ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}`
      : Prisma.empty;
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<
        (FinancialOperation & { created_by_email: string })[]
      >`
        SELECT v.*, u."email" AS "created_by_email"
          FROM "financial_operations_v" v JOIN "users" u ON u."id" = v."created_by"
          ${filter}
         ORDER BY v."created_at" DESC
         LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS "total" FROM "financial_operations_v" ${filter}`,
    ]);
    return {
      items: rows.map((r) => ({
        type: r.type,
        typeLabel: APPROVABLE[r.type].label,
        id: r.id,
        currency: r.currency,
        amount: r.amount,
        date: r.operation_date,
        approvalStatus: r.approval_status,
        createdBy: { id: r.created_by, email: r.created_by_email },
        createdAt: r.created_at,
        version: r.version,
        rejectionReason: r.rejection_reason,
        // what this user may do with it now
        flow: APPROVABLE[r.type].flow,
        canAct:
          r.created_by !== actor.id &&
          !!turnOf(r.type, r.approval_status) &&
          can(actor, turnOf(r.type, r.approval_status)!),
      })),
      total: Number(total),
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  private async find(tx: Tx, table: string, id: number): Promise<DocumentRow> {
    const [doc] = await tx.$queryRaw<DocumentRow[]>`
      SELECT "id", "approval_status", "created_by", "version"
        FROM ${Prisma.raw(`"${table}"`)} WHERE "id" = ${id} FOR UPDATE`;
    if (!doc) throw new NotFoundException('الحركة غير موجودة');
    return doc;
  }
}

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: 'مستنية المراجعة',
  REVIEWED: 'اتراجعت',
  MANAGER_APPROVED: 'وافق مدير الحسابات',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
};

/**
 * Who may edit a document and what an edit does to its approval: the one who
 * recorded it edits it until it is approved (the edit sends it back to review);
 * after approval only finance.approved.edit, and it stays approved.
 */
export function assertCanEdit(
  actor: AuthUser,
  doc: { createdById: number; approvalStatus: ApprovalStatus },
): { resetApproval: boolean } {
  if (doc.approvalStatus === 'APPROVED') {
    if (!can(actor, 'finance.approved.edit')) {
      throw new ForbiddenException(
        'الحركة اتعتمدت، والتعديل بعد الاعتماد للمدير التنفيذي بس',
      );
    }
    return { resetApproval: false };
  }
  if (doc.createdById !== actor.id && !can(actor, 'finance.approved.edit')) {
    throw new ForbiddenException('التعديل لصاحب الحركة بس');
  }
  return { resetApproval: true };
}
