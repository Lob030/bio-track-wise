import { ReactNode } from "react";

export function PageShell({
  title, subtitle, icon, actions, children,
}: { title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {icon}{title}
          </h1>
          {subtitle && <p className="text-sm text-muted-foreground max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
