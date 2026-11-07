import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Waits until typing pauses (300 ms) before searching, so each key press is not a request. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'بحث...',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);

  return (
    <label className="flex h-11 w-full max-w-sm items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-gold">
      <Search className="size-4 text-muted" />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full w-full bg-transparent outline-none placeholder:text-muted/70"
      />
    </label>
  );
}
