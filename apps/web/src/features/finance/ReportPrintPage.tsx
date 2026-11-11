import { ArrowRight, FileSpreadsheet, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/lib/mutations';
import { useCompany } from './account-api';
import { useAccounts } from './api';
import { describeFilters, readReportSearch, REPORT_KINDS, useReport, type ReportKind } from './report-api';
import { ReportDocument } from './ReportDocument';
import { downloadReportExcel } from './report-excel';

/** A report on its own page, to print or save as PDF; what prints is what shows. */
export default function ReportPrintPage() {
  const kind = useParams().kind as ReportKind;
  const [params] = useSearchParams();
  const q = readReportSearch(params);
  const valid = kind in REPORT_KINDS && !!q;
  const { user } = useAuth();
  const { data: report, error } = useReport(kind, valid ? q : null);
  const { data: company } = useCompany();
  const { data: accounts = [] } = useAccounts();
  const [exporting, setExporting] = useState(false);
  const generatedBy = user?.name || user?.email || '';
  const filters = q ? describeFilters(q, accounts) : [];

  useEffect(() => {
    if (report) document.title = `${REPORT_KINDS[report.kind].title} ${report.from.slice(0, 10)} - ${report.to.slice(0, 10)}`;
    return () => {
      document.title = 'HAMMER LINE';
    };
  }, [report]);

  if (!valid) return <div className="p-6 text-muted">رابط التقرير ناقص. ارجع لصفحة التقارير واختار الفترة.</div>;
  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  if (!report || !company) {
    return (
      <div className="grid min-h-screen place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  }

  const excel = async () => {
    setExporting(true);
    try {
      await downloadReportExcel(report, company, filters, generatedBy);
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="report-print min-h-screen bg-neutral-300 pb-10 print:bg-white print:pb-0">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 print:hidden">
        <Link to="/reports" className="flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ArrowRight className="size-4" /> التقارير
        </Link>
        <div className="flex-1" />
        <Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} loading={exporting} onClick={excel}>
          Excel
        </Button>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
          طباعة / PDF
        </Button>
      </div>
      <div className="py-6 print:py-0">
        <div className="mx-auto w-fit shadow-2xl print:shadow-none">
          <ReportDocument report={report} company={company} filters={filters} generatedBy={generatedBy} />
        </div>
      </div>
    </div>
  );
}
