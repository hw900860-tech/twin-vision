import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("aeris_admin_logged_in")) {
      localStorage.setItem("aeris_admin_logged_in", "true");
    }
  }, []);

  const isDemoAdmin = typeof window !== "undefined" && localStorage.getItem("aeris_admin_logged_in") === "true";

  if (isPending && !isDemoAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="label-xs animate-pulse text-cyan">VERIFYING MAINTENANCE CLEARANCE…</div>
      </div>
    );
  }

  return <>{children}</>;
}
