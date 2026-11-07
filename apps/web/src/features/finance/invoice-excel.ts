import { amountInWords } from '@/lib/words';
import type { CompanySettings } from './account-api';
import { containersText, lineWithVat, plain, printDate, stampOf, type PrintableInvoice } from './invoice-format';

/**
 * The invoice as an Excel sheet laid out like the office's current .xls files:
 * company block, the shipment box, the lines, totals, the signature row.
 * exceljs is loaded only when someone exports.
 */
export async function downloadInvoiceExcel(invoice: PrintableInvoice, company: CompanySettings) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(invoice.invoiceNo.replace(/[\\/*?:[\]]/g, '-').slice(0, 31), {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [{ width: 18 }, { width: 26 }, { width: 18 }, { width: 22 }, { width: 14 }, { width: 14 }];
  const s = invoice.shipment;
  const clearance = invoice.type === 'CLEARANCE';
  const border = { style: 'thin' as const };
  const box = { top: border, left: border, bottom: border, right: border };
  const bold = { bold: true };

  try {
    const blob = await (await fetch('/logo-full.png')).blob();
    const base64 = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.readAsDataURL(blob);
    });
    const id = wb.addImage({ base64, extension: 'png' });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 230, height: 110 } });
  } catch {
    // the sheet is still useful without the logo
  }

  ws.getCell('C2').value = company.address;
  ws.getCell('C3').value = `Tax Number.:${company.taxNumber}`;
  ws.getCell('C4').value = `CR Number: ${company.crNumber}`;
  ws.getCell('C5').value = company.emails.length ? `E-mail: ${company.emails.map((e) => e.toUpperCase()).join('-')}` : '';
  ws.mergeCells('C2:F2');
  ws.mergeCells('C5:F5');

  ws.mergeCells('A8:F8');
  const title = ws.getCell('A8');
  title.value = clearance ? 'INVOICE' : `STATEMENT ${invoice.invoiceNo}`;
  title.font = { size: 18, underline: true };
  title.alignment = { horizontal: 'center' };
  ws.getCell('A9').value = stampOf(invoice).text;
  ws.getCell('A9').font = { bold: true, color: { argb: 'FF9CA3AF' } };

  const [c40, c20, lcl] = containersText(s.containers);
  const left: [string, string][] = clearance
    ? [
        ['Invoice Number:', invoice.invoiceNo],
        ['Invoice Date:', printDate(invoice.invoiceDate)],
        ['Value Date', printDate(invoice.valueDate)],
      ]
    : [['Custmoer name :', s.client.name], ['Date', printDate(invoice.invoiceDate)]];
  left.push(
    ['Currency :', invoice.currency],
    ['HB/L NO. :', s.hblNumber ?? ''],
    ['POD :', s.pod ?? ''],
    ['Container Numbers :', s.containerNumbers.join(' - ')],
    ['Shipper :', s.client.name],
    ['Notify :', ''],
    ['Certificate No:', s.certificateNo ?? ''],
    ['RELEASE DATE :', printDate(s.releaseDate)],
  );
  if (clearance) left.push(['Customer Ref :', invoice.customerRef ?? '']);
  const right: [string, string][] = [
    ...(clearance ? ([['Bill To :', s.client.name], ['Address :', ''], ['', '']] as [string, string][]) : ([['Address :', ''], ['', '']] as [string, string][])),
    ['Operation :', s.fileNo],
    ['MB/L NO. :', s.mblNumber ?? ''],
    ['POL :', s.pol ?? ''],
    ['Vessel :', s.vessel ?? ''],
    ['Containers :', `${c40} | ${c20} | ${lcl}`],
    ['Commodity :', s.commodity],
    ['Consignee :', s.consignee],
    ['Weight :', plain(s.weight)],
  ];
  let row = 11;
  for (let i = 0; i < Math.max(left.length, right.length); i++, row++) {
    const [l1, l2] = left[i] ?? ['', ''];
    const [r1, r2] = right[i] ?? ['', ''];
    ws.getCell(row, 1).value = l1;
    ws.getCell(row, 1).font = bold;
    ws.getCell(row, 2).value = l2;
    ws.getCell(row, 3).value = r1;
    ws.getCell(row, 3).font = bold;
    ws.getCell(row, 4).value = r2;
  }
  row++;

  const head = (cells: string[], color: string) => {
    cells.forEach((h, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = h;
      c.font = bold;
      c.border = box;
      c.alignment = { horizontal: 'center' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    });
    row++;
  };
  const put = (col: number, value: string | number, opts: { bold?: boolean } = {}) => {
    const c = ws.getCell(row, col);
    c.value = value;
    c.border = box;
    c.alignment = { horizontal: 'center', wrapText: true };
    if (opts.bold) c.font = bold;
  };

  if (clearance) {
    head(['No', 'Product Description', 'Quantity', 'Unit price', 'Total'], 'FFEFE6A3');
    for (const l of invoice.lines) {
      put(1, l.lineNo, bold);
      put(2, l.description, bold);
      put(3, Number(l.quantity), bold);
      put(4, Number(l.unitPrice), bold);
      put(5, lineWithVat(invoice, l.total), bold);
      row++;
    }
    const totals: [string, string | number][] = [
      ['SubTotal', Number(invoice.subtotal)],
      [`VAT ${plain(invoice.vatRate)}%`, Number(invoice.vatAmount)],
      ['W.H.T', Number(invoice.wht)],
      ['Invoice Total (Currency)', `${plain(invoice.total)} (${invoice.currency})`],
      [`Currency: ${invoice.currency}`, ''],
      ['Total In words:', amountInWords(invoice.total, invoice.currency)],
      ['Note:', ''],
    ];
    for (const [label, value] of totals) {
      put(4, label, { bold: true });
      put(5, value);
      ws.mergeCells(row, 5, row, 6);
      row++;
    }
  } else {
    head(['Description', '', '', 'Amount'], 'FF9DB7D5');
    ws.mergeCells(row - 1, 1, row - 1, 3);
    for (const l of invoice.lines) {
      put(1, l.description, bold);
      ws.mergeCells(row, 1, row, 3);
      put(4, Number(l.total), bold);
      row++;
    }
    put(3, 'SubTotal', bold);
    put(4, Number(invoice.total));
    row++;
    put(3, 'Total In words:', bold);
    ws.mergeCells(row, 3, row, 4);
    row++;
    put(3, amountInWords(invoice.total, invoice.currency));
    ws.mergeCells(row, 3, row, 4);
    row++;
  }

  row += 2;
  ['الاعتماد', 'مدير الحسابات', 'مراجعة'].forEach((h, i) => {
    put(i * 2 + 1, h, bold);
    ws.mergeCells(row, i * 2 + 1, row, i * 2 + 2);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${clearance ? 'INVOICE' : 'STATEMENT'} ${invoice.invoiceNo.replace(/\//g, '-')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
