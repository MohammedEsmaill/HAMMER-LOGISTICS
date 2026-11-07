export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="جاري التحميل"
      className={`inline-block animate-spin rounded-full border-2 border-current border-e-transparent ${className}`}
    />
  );
}
