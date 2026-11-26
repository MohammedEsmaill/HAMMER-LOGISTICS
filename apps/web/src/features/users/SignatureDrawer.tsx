import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { api } from '@/lib/api-client';
import { toastError } from '@/lib/mutations';
import { ownerName, userKeys, type User } from './api';

const MAX_W = 600;
const MAX_H = 200;
const MAX_BYTES = 60 * 1024;

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('الملف مش صورة سليمة'));
    img.src = src;
  });

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('مقدرتش أقرا الملف'));
    r.readAsDataURL(file);
  });

/**
 * A scanned or photographed signature made print-ready: the paper behind it turns
 * transparent, the ink becomes a clean dark tone, the empty margins are cut, and it is
 * scaled to fit the signature box, as a small PNG.
 */
async function cleanSignature(file: File): Promise<string> {
  const img = await load(await readFile(file));
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  let top = h;
  let left = w;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      // how much ink: none on the light paper, full on the dark strokes, soft in between
      const ink = px[i + 3] === 0 ? 0 : Math.max(0, Math.min(1, (215 - lum) / 120));
      if (ink <= 0.04) {
        px[i + 3] = 0;
        continue;
      }
      // a deep blue-black, like a good pen, whatever the photo's colour cast
      px[i] = 18;
      px[i + 1] = 28;
      px[i + 2] = 62;
      px[i + 3] = Math.round(255 * ink);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) throw new Error('مفيش توقيع واضح في الصورة: جرّب صورة أوضح على ورقة بيضا');
  ctx.putImageData(data, 0, 0);
  const pad = 6;
  const cw = right - left + 1 + pad * 2;
  const ch = bottom - top + 1 + pad * 2;
  for (let fit = 1; fit > 0.2; fit -= 0.15) {
    const k = Math.min(1, MAX_W / cw, MAX_H / ch) * fit;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cw * k));
    out.height = Math.max(1, Math.round(ch * k));
    const o = out.getContext('2d')!;
    o.imageSmoothingQuality = 'high';
    o.drawImage(canvas, left - pad, top - pad, cw, ch, 0, 0, out.width, out.height);
    const url = out.toDataURL('image/png');
    if ((url.length * 3) / 4 <= MAX_BYTES) return url;
  }
  throw new Error('صورة التوقيع كبيرة: جرّب صورة أصغر');
}

/** How the signature sits in its box on an invoice. */
export function SignaturePreview({ image, name, title }: { image: string | null; name: string; title: string }) {
  return (
    <div className="mx-auto w-64 overflow-hidden rounded-lg border-2 border-black bg-white text-center text-black">
      <div className="border-b-2 border-black py-1 text-sm font-bold">{title}</div>
      <div className="grid h-20 place-items-center px-2">{image ? <img src={image} alt={`توقيع ${name}`} className="max-h-[72px] max-w-full object-contain" /> : null}</div>
      <div className="border-t border-black/40 py-1 text-xs font-semibold">{name}</div>
    </div>
  );
}

/** The CEO and the moderator set a user's signature for the invoices. */
export function SignatureDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const current = useQuery({
    queryKey: ['users', 'signature', user?.id],
    queryFn: () => api.get<{ image: string | null; updatedAt: string | null }>(`/users/${user!.id}/signature`),
    enabled: !!user,
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setDraft(null);
    setError(null);
  }, [user]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      setDraft(await cleanSignature(f));
    } catch (e) {
      setError(e);
    }
  };
  const done = async (message: string) => {
    toast.success(message);
    await Promise.all([queryClient.invalidateQueries({ queryKey: userKeys.all }), current.refetch()]);
    onClose();
  };
  const save = async () => {
    if (!user || !draft) return;
    setBusy(true);
    try {
      await api.put(`/users/${user.id}/signature`, { image: draft });
      await done('اتحفظ التوقيع');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await api.delete(`/users/${user.id}/signature`);
      await done('اتشال التوقيع');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const shown = draft ?? current.data?.image ?? null;
  const name = user ? ownerName(user) : '';
  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      title={`توقيع ${name}`}
      subtitle="بيظهر على الفواتير في خانة الخطوة اللي عملها (إصدار، مراجعة، اعتماد). من غير توقيع بيتكتب الاسم بس."
      footer={
        <div className="flex justify-between gap-2">
          {current.data?.image && !draft ? (
            <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} loading={busy} onClick={remove}>
              شيل التوقيع
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button disabled={!draft} loading={busy} onClick={save}>
              حفظ التوقيع
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="focus-ring flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line p-6 text-sm text-muted hover:border-gold/60 hover:text-gold"
        >
          <ImageUp className="size-6" />
          اختار صورة التوقيع (PNG أو JPG)
          <span className="text-xs">الأفضل توقيع بقلم غامق على ورقة بيضا. الخلفية بتتشال لوحدها والتوقيع بيتظبط على مقاس الخانة.</span>
        </button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {error ? <ErrorBox error={error} /> : null}
        <div className="space-y-2">
          <div className="text-sm font-semibold">{draft ? 'هيظهر كده على الفاتورة' : 'التوقيع الحالي على الفاتورة'}</div>
          {current.isLoading ? <div className="h-32 rounded-xl shimmer" /> : <SignaturePreview image={shown} name={name} title="اعتماد" />}
          {!shown && !current.isLoading && <p className="text-center text-xs text-muted">مفيش توقيع: الاسم بس بيظهر في الخانة.</p>}
        </div>
      </div>
    </Drawer>
  );
}
