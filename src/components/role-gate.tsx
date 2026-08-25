import { type ReactNode } from "react";
import { useIsAdmin } from "@/hooks/use-role";

/**
 * Renders `children` only when the current user is an admin.
 * Operators (role === "user") see `fallback` (default: nothing).
 */
export function AdminOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return <>{fallback}</>;
  return <>{children}</>;
}
