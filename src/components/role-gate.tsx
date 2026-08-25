import { type ReactNode } from "react";
import { useRole } from "@/hooks/use-role";

/**
 * Renders `children` only when the current user is an admin.
 * Operators (role === "operator") see `fallback` (default: nothing).
 */
export function AdminOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { data: role, isLoading } = useRole();
  if (isLoading) return null;
  if (role !== "admin") return <>{fallback}</>;
  return <>{children}</>;
}

export function AdminPageOnly({ children }: { children: ReactNode }) {
  return (
    <AdminOnly
      fallback={
        <div className="mx-auto max-w-xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Acceso administrativo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu cuenta puede operar el bioterio, pero no consultar ni modificar este módulo.
          </p>
        </div>
      }
    >
      {children}
    </AdminOnly>
  );
}
