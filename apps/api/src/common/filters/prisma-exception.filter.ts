import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Arabic messages for the CHECK constraints and partial indexes in the init migration. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  employees_code_active_key: 'كود الموظف (رقم البصمة) متسجل لموظف تاني',
  employees_national_id_active_key: 'الرقم القومي متسجل لموظف تاني',
  clearers_national_id_active_key: 'الرقم القومي متسجل لمستخلص تاني',
  users_email_active_key: 'الإيميل متسجل لمستخدم تاني',
  users_employee_id_active_key: 'الموظف ده عنده حساب بالفعل',
  users_clearer_id_active_key: 'المستخلص ده عنده حساب بالفعل',
  clients_name_active_key: 'اسم العميل متسجل قبل كده',
  factories_tax_number_active_key: 'الرقم الضريبي متسجل لمصنع تاني',
  employees_national_id_format: 'الرقم القومي لازم يكون 14 رقم',
  clearers_national_id_format: 'الرقم القومي لازم يكون 14 رقم',
  users_email_domain: 'الإيميل لازم ينتهي بـ @hammerline.com',
  users_account_owner: 'الحساب لازم يكون لموظف أو لمستخلص واحد بس',
  clients_mobile_format: 'رقم الموبايل غير صحيح',
  factories_tax_number_format: 'الرقم الضريبي لازم يكون 9 أرقام',
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
    const known = constraint ? CONSTRAINT_MESSAGES[constraint] : undefined;

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      switch (e.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            message: known ?? 'القيمة دي متسجلة قبل كده',
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
}
