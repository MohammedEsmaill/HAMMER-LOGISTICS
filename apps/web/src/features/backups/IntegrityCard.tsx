import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api-client';
import { toastError, useAction } from '@/lib/mutations';

interface Problem {
  kind: string;
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  link: string;
}

interface Report {
  checkedAt: string;
  accounts: number;
  movements: number;
  problems: Problem[];
}

const KEY = ['integrity'] as const;

const dateTime = (v: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Cairo' })
    .format(new Date(v))
    .replace(',', '');

/** The books check: every account's balance against its ledger, every 6 hours. */
export function IntegrityCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: () => api.get<Report | null>('/integrity') });
  const run = useAction(() => api.post<Report>('/integrity'));

  return (
    <section className="card mt-6 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="size-5 text-gold" /> فحص الحسابات
          </h3>
          <p className="mt-1 text-sm text-muted">
            كل 6 ساعات: رصيد كل خزنة وحساب بنكي مع مجموع حركاته، وتسلسل الحركات، ويوميات الأيام المقفولة.
          </p>
        </div>
        <Button
          variant="ghost"
          loading={run.isPending}
          onClick={() => run.mutateAsync(undefined).then((r) => queryClient.setQueryData(KEY, r), toastError)}
        >
          افحص الآن
        </Button>
      </div>

      {data === null && <p className="text-sm text-muted">لسه ماتعملش فحص.</p>}
      {data && (
        <>
          <p className="text-sm text-muted">
            آخر فحص: <span dir="ltr">{dateTime(data.checkedAt)}</span> · {data.accounts} حساب · {data.movements} حركة
          </p>
          {data.problems.length === 0 ? (
            <p className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="size-5" /> كل الأرصدة مطابقة لحركاتها
            </p>
          ) : (
            <ul className="space-y-2">
              {data.problems.map((p, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-3 rounded-xl border p-3 ${p.severity === 'danger' ? 'border-danger/40 bg-danger/8' : 'border-gold/40 bg-gold/8'}`}
                >
                  <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${p.severity === 'danger' ? 'text-danger' : 'text-gold'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.title}</div>
                    <div className="text-sm text-muted">{p.detail}</div>
                  </div>
                  <Link to={p.link} className="shrink-0 text-sm text-gold hover:underline">
                    فتح
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
