"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/auth-helpers-nextjs-shim";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setError(null);

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        setError(signOutError.message);
        return;
      }

      router.refresh();
      router.replace("/login");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cerrar la sesión.",
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleSignOut} disabled={isSigningOut}>
        {isSigningOut ? "Cerrando sesión…" : "Cerrar Sesión"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
