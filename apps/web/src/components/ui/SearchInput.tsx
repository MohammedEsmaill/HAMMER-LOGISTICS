import { Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

/**
 * Searches only when asked: Enter or the search button sends one request. Typing sends
 * nothing; clearing the box shows everything again at once.
 */
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

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = text.trim();
    if (q !== value) onChange(q);
  };
  const clear = () => {
    setText('');
    if (value) onChange('');
  };
  const pending = text.trim() !== value;

  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex h-11 w-full max-w-sm items-center gap-1 rounded-xl border border-line bg-surface ps-3 pe-1 focus-within:border-gold"
    >
      <input
        type="text"
        enterKeyHint="search"
        value={text}
        onChange={(e) => (e.target.value === '' ? clear() : setText(e.target.value))}
        onKeyDown={(e) => e.key === 'Escape' && clear()}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full w-full bg-transparent outline-none placeholder:text-muted/70"
      />
      {text && (
        <button type="button" onClick={clear} className="focus-ring grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:text-ink" aria-label="مسح البحث" title="مسح البحث">
          <X className="size-4" />
        </button>
      )}
      <button
        type="submit"
        className={`focus-ring grid size-9 shrink-0 place-items-center rounded-lg transition-colors ${pending ? 'gold-fill' : 'text-muted hover:text-gold'}`}
        aria-label="بحث"
        title="بحث (Enter)"
      >
        <Search className="size-4" />
      </button>
    </form>
  );
}
