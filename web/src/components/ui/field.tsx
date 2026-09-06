/** Shared labeled field wrapper. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium text-secondary">
        {label}
        {hint && <span className="ms-1 text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
