import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: "/admin/login", replace: true });
    }
  }, [isPending, navigate, session]);

  if (isPending || !session) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="label-xs animate-pulse text-cyan">VERIFYING MAINTENANCE CLEARANCE…</div>
      </div>
    );
  }

  return <>{children}</>;
}
