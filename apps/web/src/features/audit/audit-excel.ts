import type { CompanySettings } from '../finance/account-api';
import { logoImage, SheetWriter } from '../finance/report-excel';
import type { AuditRow } from './api';
import { changedFields } from './format';
import { ACTIONS, ENTITIES } from './labels';

const who = (r: AuditRow) => (r.user ? (r.user.name ?? r.user.email) : 'السيستم');

/** The filtered audit log as an .xlsx on the company letterhead. */
export async function downloadAuditExcel(rows: AuditRow[], company: CompanySettings, logins: boolean) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const logo = await logoImage(wb);
  const title = logins ? 'سجل الدخول' : 'سجل العمليات';
  const ws = wb.addWorksheet(title);
  ws.views = [{ rightToLeft: true }];
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const sheet = new SheetWriter(ws, 6);
  sheet.letterhead(company, title, `${rows.length} سجل`, [new Date().toLocaleString('en-GB')], logo);
  sheet.table(
    [
      { header: 'الوقت', width: 18 },
      { header: 'المستخدم', width: 22 },
      { header: 'العملية', width: 20 },
      { header: logins ? 'الجهاز (IP)' : 'على', width: 28 },
      { header: 'التغييرات', width: 60 },
      { header: 'IP', width: 16 },
    ],
    rows.map((r) => [
      new Date(r.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Cairo' }),
      who(r),
      ACTIONS[r.action] ?? r.action,
      logins ? (r.ip ?? '') : `${ENTITIES[r.entity] ?? r.entity} ${r.ref ?? `#${r.entityId}`}`,
      changedFields(r.before, r.after)
        .slice(0, 12)
        .map((c) => `${c.label}: ${r.before && r.after ? `${String(c.before ?? '—')} ← ${String(c.after ?? '—')}` : String(c.after ?? c.before ?? '—')}`)
        .join('\n'),
      r.ip ?? '',
    ]),
  );
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
