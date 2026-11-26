import type { CompanySettings } from '../finance/account-api';
import { logoImage, SheetWriter, type Col } from '../finance/report-excel';
import type { ShipmentsReport } from './api';
import { containersText, REPORT_COLUMNS, reportDay } from './ShipmentsReportPage';

const WIDTHS = [5, 13, 30, 18, 16, 8, 16, 22, 13, 18, 12, 20, 18, 18];

/** The shipments report as an .xlsx on the company letterhead: the summary, then a row per shipment. */
export async function downloadShipmentsExcel(report: ShipmentsReport, company: CompanySettings, filters: string[]) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const logo = await logoImage(wb);
  const title = 'تقرير الشحنات';
  const ws = wb.addWorksheet(title);
  ws.views = [{ rightToLeft: true }];
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const sheet = new SheetWriter(ws, REPORT_COLUMNS.length);
  const { summary } = report;
  const boxes = Object.values(summary.containers).reduce((t, n) => t + (n ?? 0), 0);
  sheet.letterhead(
    company,
    title,
    `${summary.count} شحنة · ${boxes} حاوية${boxes ? ` (${containersText(summary.containers)})` : ''} · ${summary.packages} طرد · ${Number(summary.weight)} كجم`,
    [filters.length ? `الفلاتر: ${filters.join(' · ')}` : 'كل الشحنات (من غير فلتر)', new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })],
    logo,
  );
  const cols: Col[] = REPORT_COLUMNS.map((header, i) => ({ header, width: WIDTHS[i] }));
  sheet.table(
    cols,
    report.items.map((s, i) => [
      i + 1,
      s.fileNo,
      `${s.client.name} — ${s.factory.name}`,
      s.hblDisplay ?? '',
      containersText(s.containers),
      s.packagesCount,
      s.place?.name ?? '',
      [s.carrier?.name, s.vesselName].filter(Boolean).join(' — '),
      reportDay(s.eta),
      s.stageLabel,
      s.certificateNo ?? '',
      s.declarant?.name ?? '',
      s.operationEmployee.fullName,
      s.clearer.fullName,
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
