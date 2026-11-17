import { toast } from 'sonner';
import { TUNNEL_HEADERS } from './api-client';

/**
 * Opens a stored file in a new tab. Files kept by this server (/api/files/…) are fetched
 * first, so the tunnel header goes with them; outside links open as they are.
 */
export async function openFile(url: string) {
  if (!url.startsWith('/api/')) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(url, { headers: TUNNEL_HEADERS });
    if (!res.ok) throw new Error(String(res.status));
    const link = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = link;
    else window.open(link, '_blank');
    setTimeout(() => URL.revokeObjectURL(link), 60_000);
  } catch {
    tab?.close();
    toast.error('الملف مش متاح دلوقتي، جرّب تاني');
  }
}
