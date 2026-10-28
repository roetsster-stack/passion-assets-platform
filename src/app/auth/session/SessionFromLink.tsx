"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Some of Supabase's emailed links — an invitation with the default template, in particular —
 * arrive with the session in the address's fragment (`#access_token=…`), which only the browser
 * can see. This turns that into a proper session, scrubs the address, and moves on to the second
 * factor. If there is nothing in the fragment, the link was used or has expired.
 */
export function SessionFromLink() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      // never leave tokens in the address bar or history
      window.history.replaceState(null, "", window.location.pathname);
      if (!access_token || !refresh_token) {
        router.replace("/sign-in?link=expired");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        console.warn(`sign-in link: ${error.code ?? error.name}`);
        router.replace("/sign-in?link=expired");
        return;
      }
      router.replace("/mfa");
      router.refresh();
    })();
  }, [router]);

  return <p className="text-ink-muted">one moment</p>;
}
