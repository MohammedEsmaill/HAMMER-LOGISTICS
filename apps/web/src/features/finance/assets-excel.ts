import type { CompanySettings } from './account-api';
import { ASSET_CATEGORIES, ASSET_STATUS, type AssetsPage } from './assets-api';
import { logoImage, SheetWriter, type Col } from './report-excel';

/** The fixed assets register as an .xlsx on the company letterhead. */
export async function downloadAssetsExcel(page: AssetsPage, company: CompanySettings) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const logo = await logoImage(wb);
  const title = 'سجل الأصول الثابتة';
  const ws = wb.addWorksheet(title);
  ws.views = [{ rightToLeft: true }];
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const cols: Col[] = [
    { header: 'رقم الأصل', width: 12 },
    { header: 'الجهاز', width: 28 },
    { header: 'النوع', width: 10 },
    { header: 'الموديل', width: 16 },
    { header: 'Serial', width: 16 },
    { header: 'مع مين', width: 20 },
    { header: 'المكان', width: 16 },
    { header: 'تاريخ الشراء', width: 12, date: true },
    { header: 'العمر (شهر)', width: 10 },
    { header: 'التكلفة', width: 14, money: true },
    { header: 'الإهلاك المتراكم', width: 15, money: true },
    { header: 'صافي القيمة', width: 14, money: true },
    { header: 'الحالة', width: 10 },
  ];
  const sheet = new SheetWriter(ws, cols.length);
  const t = page.totals;
  sheet.letterhead(
    company,
    title,
    `${t.count} جهاز شغّال · التكلفة ${Number(t.cost).toLocaleString('en-US')} · صافي القيمة ${Number(t.netBookValue).toLocaleString('en-US')}`,
    [new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })],
    logo,
  );
  sheet.table(
    cols,
    page.items.map((a) => [
      a.assetNo,
      a.name,
      ASSET_CATEGORIES[a.category],
      a.model ?? '',
      a.serialNo ?? '',
      a.custodian?.fullName ?? '',
      a.location ?? '',
      new Date(`${a.acquiredOn.slice(0, 10)}T00:00:00`),
      a.usefulLifeMonths,
      Number(a.cost),
      Number(a.depreciation.accumulated),
      Number(a.depreciation.netBookValue),
      ASSET_STATUS[a.status].label,
    ]),
    [['', 'الإجمالي (الشغّال)', '', '', '', '', '', null, null, Number(t.cost), Number(t.accumulated), Number(t.netBookValue), '']],
  );
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
