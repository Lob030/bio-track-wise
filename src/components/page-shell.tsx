import { ReactNode } from "react";

export function PageShell({
  title,
  subtitle,
  icon,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="premium-page p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="premium-page-header flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-3">
            {icon && <div className="premium-page-icon">{icon}</div>}
            <h1 className="text-2xl font-bold truncate">{title}</h1>
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
      <div className="premium-content">{children}</div>
    </div>
  );
}
