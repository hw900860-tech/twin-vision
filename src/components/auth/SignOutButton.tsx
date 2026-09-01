import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const navigate = useNavigate();

  async function handleSignOut() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("aeris_admin_logged_in");
    }
    try {
      await signOut();
    } catch {}
    await navigate({ to: "/admin/login", replace: true });
  }

  return (
    <button type="button" onClick={handleSignOut} className="flex min-h-10 items-center gap-2 label-xs text-muted-foreground transition-colors hover:text-cyan">
      <LogOut className="h-3.5 w-3.5" /> SIGN OUT
    </button>
  );
}
