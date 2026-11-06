import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Arabic messages for the CHECK constraints in the migrations, by constraint name. */
const CHECK_MESSAGES: Record<string, string> = {
  employees_national_id_format: 'الرقم القومي لازم يكون 14 رقم',
  clearers_national_id_format: 'الرقم القومي لازم يكون 14 رقم',
  users_email_domain: 'الإيميل لازم ينتهي بـ @hammerline.com',
  users_account_owner: 'الحساب لازم يكون لموظف أو لمستخلص واحد بس',
  clients_mobile_format: 'رقم الموبايل غير صحيح',
  factories_tax_number_format: 'الرقم الضريبي لازم يكون 9 أرقام',
};

/**
 * Arabic messages for unique violations. Prisma reports them as model + fields
 * (for the partial indexes too), so they are keyed "Model.field".
 */
const UNIQUE_MESSAGES: Record<string, string> = {
  'Employee.code': 'كود الموظف (رقم البصمة) متسجل لموظف تاني',
  'Employee.national_id': 'الرقم القومي متسجل لموظف تاني',
  'Clearer.national_id': 'الرقم القومي متسجل لمستخلص تاني',
  'User.email': 'الإيميل متسجل لمستخدم تاني',
  'User.employee_id': 'الموظف ده عنده حساب بالفعل',
  'User.clearer_id': 'المستخلص ده عنده حساب بالفعل',
  'Client.name': 'اسم العميل متسجل قبل كده',
  'Factory.tax_number': 'الرقم الضريبي متسجل لمصنع تاني',
  'Role.name': 'اسم الدور متسجل قبل كده',
};

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientUnknownRequestError,
    host: ArgumentsHost,
  ) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, message } = this.map(exception);
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception.message);
    }
    res.status(status).json({ statusCode: status, message });
  }

  private map(
    e:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientUnknownRequestError,
  ): { status: HttpStatus; message: string } {
    const constraint = /constraint "([^"]+)"/.exec(e.message)?.[1];
    const known = constraint ? CHECK_MESSAGES[constraint] : undefined;

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      switch (e.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            message: this.uniqueMessage(e) ?? 'القيمة دي متسجلة قبل كده',
          };
        case 'P2003':
          return {
            status: HttpStatus.CONFLICT,
            message: 'العملية مرفوضة: البيان مرتبط ببيانات تانية',
          };
        case 'P2025':
          return { status: HttpStatus.NOT_FOUND, message: 'غير موجود' };
      }
    }
    if (constraint && /check constraint|unique/i.test(e.message)) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: known ?? `البيانات مخالفة لقواعد النظام (${constraint})`,
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'حصل خطأ غير متوقع',
    };
  }

  private uniqueMessage(
    e: Prisma.PrismaClientKnownRequestError,
  ): string | undefined {
    const meta = e.meta as { modelName?: string; target?: unknown } | undefined;
    const fields = Array.isArray(meta?.target) ? meta.target : [];
    for (const field of fields) {
      const message = UNIQUE_MESSAGES[`${meta?.modelName}.${String(field)}`];
      if (message) return message;
    }
    return undefined;
  }
}
