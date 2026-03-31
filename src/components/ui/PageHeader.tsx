export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="space-y-1.5">
      {eyebrow ? (
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] tablet:text-3xl">{title}</h1>
      {description ? (
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)] text-balance">
          {description}
        </p>
      ) : null}
    </header>
  );
}
