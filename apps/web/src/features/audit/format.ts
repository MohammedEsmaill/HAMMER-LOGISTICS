import type { AuditRow } from './api';
import { ENTITIES, FIELDS, NOISE } from './labels';

export const when = (v: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Cairo' })
    .format(new Date(v))
    .replace(',', '');

export const who = (r: AuditRow) => (r.user ? (r.user.name ?? r.user.email.split('@')[0]) : 'السيستم');
export const subject = (r: AuditRow) => `${ENTITIES[r.entity] ?? r.entity} ${r.ref ?? `#${r.entityId}`}`;


export type Data = Record<string, unknown> | null;

const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (typeof v === 'string') return DATE.test(v) ? (v.endsWith('T00:00:00.000Z') ? v.slice(0, 10) : v.slice(0, 16).replace('T', ' ')) : v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.length ? `${v.length} عنصر` : '—';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.name ?? o.fullName ?? o.email ?? o.fileNo ?? JSON.stringify(v));
  }
  return String(v);
}

/** The fields a record changed: before and after, the bookkeeping left out. */
export function changedFields(before: Data, after: Data) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !NOISE.has(k));
  return keys
    .map((k) => ({ key: k, label: FIELDS[k] ?? k, before: before?.[k], after: after?.[k] }))
    .filter((r) => !before || !after || JSON.stringify(r.before) !== JSON.stringify(r.after));
}

