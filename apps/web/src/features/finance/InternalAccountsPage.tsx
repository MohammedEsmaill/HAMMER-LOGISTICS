import { Building2, Pencil, Plus, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import type { Permission } from '@/auth/permissions';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader } from '@/components/ui/misc';
import { money } from './api';
import { PartyDrawer, PartyMovementDrawer } from './PartyDrawers';
import { balanceSide, PARTY_KINDS, useParties, type Party } from './parties-api';

function PartyCard({ party, index, onOpen, onEdit, figures }: { party: Party; index: number; onOpen: () => void; onEdit?: () => void; figures: boolean }) {
  const Icon = party.kind === 'OWNER' ? UserRound : Building2;
  const balances = party.balances.filter((b) => Number(b.balance) !== 0);
  return (
    <motion.div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ y: -3 }}
      className={`card focus-ring cursor-pointer space-y-3 p-4 ${party.isActive ? '' : 'opacity-60'}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{party.name}</div>
          <div className="text-xs text-muted">
            {PARTY_KINDS[party.kind]}
            {figures && ` · ${party._count.movements} حركة`}
          </div>
        </div>
        {!party.isActive && <Badge tone="muted">موقوفة</Badge>}
        {onEdit && (
          <IconButton label={`تعديل ${party.name}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </IconButton>
        )}
      </div>
      {!figures ? null : balances.length === 0 ? (
        <div className="text-sm text-muted">مفيش رصيد، الحساب متصفّي</div>
      ) : (
        <div className="space-y-1.5">
          {balances.map((b) => {
            const side = balanceSide(b.balance);
            return (
              <div key={b.currency} className="flex items-center justify-between gap-2">
                <b className="text-xl tracking-tight" dir="ltr">
                  {money(Math.abs(Number(b.balance)), b.currency)}
                </b>
                <Badge tone={side.tone}>{side.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
      {party.personalAccounts.length > 0 && (
        <div className="border-t border-line pt-2 text-xs text-muted">
          حسابات شخصية: {party.personalAccounts.map((a) => `${a.name} (${a.currency})`).join('، ')}
        </div>
      )}
    </motion.div>
  );
}

/**
 * The internal accounts, apart from the logistics accounts: the sister companies and
 * the owners, each with what they owe (مدين) or are owed (دائن) per currency.
 */
export default function InternalAccountsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: parties = [], isLoading, error } = useParties();
  const [editing, setEditing] = useState<Party | null>(null);
  const [partyOpen, setPartyOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const manage = can('finance.parties.manage');
  const record = can('finance.parties.record');
  // who only sets the parties up (the moderator) sees no balances and no statements
  const figures = ['finance.parties.view', 'finance.parties.record', 'finance.review', 'finance.approve'].some((p) => can(p as Permission));

  const groups = (['SISTER_COMPANY', 'OWNER'] as const).map((kind) => ({ kind, list: parties.filter((p) => p.kind === kind) }));

  return (
    <>
      <PageHeader
        title="الحسابات الداخلية"
        actions={
          <div className="flex gap-2">
            {manage && (
              <Button
                variant="ghost"
                icon={<Plus className="size-4" />}
                onClick={() => {
                  setEditing(null);
                  setPartyOpen(true);
                }}
              >
                جهة جديدة
              </Button>
            )}
            {record && (
              <Button icon={<Plus className="size-4" />} onClick={() => setRecording(true)}>
                حركة جديدة
              </Button>
            )}
          </div>
        }
      />
      <p className={`mb-4 text-sm text-muted ${figures ? '' : 'hidden'}`}>
        حساب الشركات الشقيقة والملاك، منفصل عن حسابات اللوجيستيك. <b>مدين</b> يعني الجهة عليها فلوس لينا، و<b>دائن</b> يعني ليها فلوس عندنا.
      </p>
      {error ? <ErrorBox error={error} /> : null}
      {isLoading && <div className="h-40 rounded-2xl shimmer" />}
      {!isLoading && parties.length === 0 && (
        <div className="card p-8 text-center text-muted">{manage ? 'لسه مفيش جهات. ابدأ بـ «جهة جديدة».' : 'لسه مفيش جهات.'}</div>
      )}

      <div className="space-y-6">
        {groups
          .filter((g) => g.list.length > 0)
          .map(({ kind, list }) => (
            <section key={kind} className="space-y-3">
              <h2 className="text-lg font-bold">{kind === 'OWNER' ? 'الملاك' : 'الشركات الشقيقة'}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((p, i) => (
                  <PartyCard
                    key={p.id}
                    party={p}
                    index={i}
                    figures={figures}
                    onOpen={() => figures && navigate(`/internal-accounts/${p.id}`)}
                    onEdit={
                      manage
                        ? () => {
                            setEditing(p);
                            setPartyOpen(true);
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
      </div>

      <PartyDrawer party={editing} open={partyOpen} onClose={() => setPartyOpen(false)} />
      <PartyMovementDrawer movement={null} open={recording} onClose={() => setRecording(false)} />
    </>
  );
}
