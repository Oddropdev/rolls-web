"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type PickRow = {
  id: string;
  slug: string;
  title: string;
  promoted: boolean;
  saved: boolean;
};

type RpcOk = { ok: boolean };

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

export default function PickClient({ slug }: { slug: string }) {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<PickRow | null>(null);

  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMsg(null);

      try {
        const session = await supabase.auth.getSession();
        if (!cancelled) setIsAuthed(!!session.data.session);

        const { data, error } = await supabase.rpc("get_pick", { p_slug: slug });
        if (error) throw error;

        const row = (Array.isArray(data) && data.length > 0 ? data[0] : null) as PickRow | null;
        if (cancelled) return;

        setPick(row);
        setSaved(!!row?.saved);
      } catch (e: any) {
        console.error("get_pick failed:", e);
        if (!cancelled) {
          setPick(null);
          setMsg(e?.message ?? "Could not load this pick.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [slug, supabase]);

  async function onSignIn() {
    setMsg(null);
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      setIsAuthed(true);
      setMsg(null);
    } catch (e: any) {
      console.error("signIn failed:", e);
      setMsg("Sign in failed. Check email/password.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function onSignOut() {
    setMsg(null);
    setAuthBusy(true);
    try {
      await supabase.auth.signOut();
      setIsAuthed(false);
      setSaved(false); // UI-safe default; server state is derived anyway
    } finally {
      setAuthBusy(false);
    }
  }

  async function onToggleSave() {
    if (!pick) return;

    setMsg(null);

    if (!isAuthed) {
      setMsg("Sign in to save picks.");
      return;
    }

    const nextSaved = !saved;
    const prevSaved = saved;

    setSaved(nextSaved);
    setSaveBusy(true);

    try {
      const eventUuid = crypto.randomUUID();

      const { data, error } = await supabase.rpc("set_saved", {
        p_game_id: pick.id,
        p_saved: nextSaved,
        p_event_uuid: eventUuid,
      });

      if (error) throw error;

      const res = data as RpcOk;
      if (!res?.ok) {
        setSaved(prevSaved);
        setMsg("Could not save right now. Try again.");
      }
    } catch (e: any) {
      console.error("set_saved failed:", e);
      setSaved(prevSaved);
      setMsg("Could not save right now. Try again.");
    } finally {
      setSaveBusy(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-600">Loading…</div>;
  }

  if (!pick) {
    return (
      <div className="space-y-3">
        <div className="text-lg font-semibold">Pick not found</div>
        {msg ? <div className="text-sm text-gray-600">{msg}</div> : null}
      </div>
    );
  }

  const why = pick.promoted
    ? {
        title: "Why this pick",
        body: "Sponsored pick. We may earn a commission if you click through.",
        badge: "Sponsored",
      }
    : {
        title: "Why this pick",
        body: "Based on your recent swipes and what’s popular right now.",
        badge: null as string | null,
      };

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{pick.title}</h1>
          {pick.promoted ? <Badge>Promoted</Badge> : null}
        </div>
        <div className="text-sm text-gray-600">/{pick.slug}</div>
      </header>

      <section className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSave}
          disabled={saveBusy}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
        >
          {saved ? "Unsave" : "Save"}
        </button>

        {saveBusy ? <div className="text-sm text-gray-600">Saving…</div> : null}
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Account</div>
          {isAuthed ? <Badge>Signed in</Badge> : <Badge>Signed out</Badge>}
        </div>

        {!isAuthed ? (
          <div className="space-y-2">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={onSignIn}
              disabled={authBusy || !email || !password}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
            >
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignOut}
            disabled={authBusy}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            {authBusy ? "Signing out…" : "Sign out"}
          </button>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <div className="font-medium">{why.title}</div>
          {why.badge ? <Badge>{why.badge}</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-gray-700">{why.body}</p>

        {pick.promoted ? (
          <p className="mt-2 text-xs text-gray-600">
            Disclosure: Sponsored content is labeled. (Add a /disclosure page later.)
          </p>
        ) : null}
      </section>

      {msg ? <div className="text-sm text-red-600">{msg}</div> : null}
    </div>
  );
}
