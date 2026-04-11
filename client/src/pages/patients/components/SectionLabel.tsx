export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest pt-1 pb-0.5 border-b select-none">
      {children}
    </p>
  );
}
