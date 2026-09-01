import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { signIn } from "@/lib/auth-client";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "AERIS-TWIN — Maintenance Access" },
      { name: "description", content: "Secure maintenance engineer access for AERIS-TWIN operations." },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result = await signIn.email({ email, password, callbackURL: "/gcs" });
      if (result.error) {
        setError("Access denied. Verify your maintenance credentials.");
        setPending(false);
        return;
      }

      window.location.assign("/gcs");
    } catch {
      setError("Access denied. Verify your maintenance credentials.");
      setPending(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07090b] text-foreground">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
      <div className="pointer-events-none absolute -right-40 top-1/2 h-[38rem] w-[38rem] -translate-y-1/2 rounded-full border border-cyan/10 shadow-[0_0_120px_rgba(65,211,224,0.06)]" />
      <div className="pointer-events-none absolute right-0 top-1/2 h-[24rem] w-[24rem] -translate-y-1/2 rounded-full border border-amber/10" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1fr_480px]">
        <section className="hidden flex-col justify-between border-r border-border/70 p-10 lg:flex">
          <div className="flex items-center gap-3 label-xs text-cyan">
            <span className="grid h-8 w-8 place-items-center border border-cyan/60">A</span>
            AERIS-TWIN / SECURE ACCESS
          </div>
          <div className="max-w-xl">
            <div className="label-xs text-amber">MAINTENANCE OPERATIONS</div>
            <h1 className="mt-5 max-w-2xl font-display text-6xl font-light leading-[0.95] tracking-[-0.06em] text-white xl:text-8xl">
              Keep the fleet ahead of failure.
            </h1>
            <p className="mt-8 max-w-md text-base leading-relaxed text-muted-foreground">
              Access the ground control station, predictive diagnostics, mission replay, and flight simulation tools.
            </p>
          </div>
          <div className="flex items-center justify-between label-xs text-muted-foreground">
            <span>AE-P4 · MAINTENANCE NETWORK</span>
            <span className="flex items-center gap-2 text-nominal"><span className="h-1.5 w-1.5 rounded-full bg-nominal" /> ENCRYPTED</span>
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-10">
          <div className="w-full max-w-sm">
            <Link to="/" className="mb-12 inline-flex min-h-11 items-center gap-2 label-xs text-muted-foreground transition-colors hover:text-cyan">
              <ArrowLeft className="h-3.5 w-3.5" /> RETURN TO PUBLIC SITE
            </Link>

            <div className="mb-8 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center border border-cyan/60 bg-cyan/5 text-cyan"><LockKeyhole className="h-5 w-5" /></div>
              <div>
                <div className="label-xs text-cyan">RESTRICTED SYSTEM</div>
                <div className="mt-1 text-sm text-muted-foreground">Admin / maintenance engineer</div>
              </div>
            </div>

            <h2 className="font-display text-3xl font-light tracking-[-0.04em] text-white">Sign in to GCS</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Use your provisioned maintenance account to continue.</p>

            <div className="mt-5 border border-amber/30 bg-amber/5 px-3 py-3 text-xs">
              <div className="label-xs text-amber">DEMO ACCESS</div>
              <div className="mt-2 grid gap-1 font-mono text-muted-foreground">
                <span>EMAIL: <strong className="text-foreground">demo@aeris-twin.local</strong></span>
                <span>PASSWORD: <strong className="text-foreground">AerisDemo-2026!</strong></span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block">
                <span className="label-xs">WORK EMAIL</span>
                <input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full border border-border bg-panel/70 px-3 text-sm outline-none transition-colors focus:border-cyan" placeholder="engineer@operations.example" />
              </label>
              <label className="block">
                <span className="label-xs">PASSWORD</span>
                <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full border border-border bg-panel/70 px-3 text-sm outline-none transition-colors focus:border-cyan" placeholder="************" />
              </label>
              {error && <div role="alert" className="border border-critical/60 bg-critical/10 px-3 py-3 text-xs text-critical">{error}</div>}
              <button disabled={pending} type="submit" className="flex h-12 w-full items-center justify-center gap-2 bg-cyan px-4 label-xs text-background transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
                <ShieldCheck className="h-4 w-4" /> {pending ? "VERIFYING CREDENTIALS…" : "ENTER GROUND CONTROL"}
              </button>
            </form>

            <div className="mt-8 border-t border-border/70 pt-4 label-xs leading-relaxed text-muted-foreground">
              No public registration. Contact the system administrator for account provisioning.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
