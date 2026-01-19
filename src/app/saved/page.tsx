"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type SavedRow = {
  id: string;
  slug: string;
  title: string;
  promoted: boolean;
  saved_at: string | null;
};

function formatSavedAt(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export default function SavedPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [items, setItems] = useState<SavedRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMsg(null);

      try {
        const session = await supabase.auth.getSession();
        const authed = !!session.data.session;
        if (!cancelled) setIsAuthed(authed);

        if (!authed) {
          if (!cancelled) setItems([]);
          return;
        }

        const { data, error } = await supabase.rpc("get_saved", { p_limit: 50 });
        if (error) throw error;

        const rows = (Array.isArray(data) ? data : []) as SavedRow[];
        if (!cancelled) setItems(rows);
      } catch (e: any) {
        console.error("get_saved failed:", e);
        if (!cancelled) {
          setItems([]);
          setMsg("Could not load Saved. Check console for details.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <main className="mx-auto max-w-xl p-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Saved</h1>
        <div className="text-sm text-gray-600">Your saved picks.</div>
      </header>

      {loading ? <div className="text-sm text-gray-600">Loading…</div> : null}

      {!loading && !isAuthed ? (
        <div className="rounded-lg border p-4 text-sm text-gray-700">
          You’re not signed in. Go to{" "}
          <a className="underline" href="/pick/test-game">
            /pick/test-game
          </a>{" "}
          and sign in to see Saved.
        </div>
      ) : null}

      {!loading && isAuthed && items.length === 0 ? (
        <div className="rounded-lg border p-4 text-sm text-gray-700">
          No saved picks yet.
        </div>
      ) : null}

      {!loading && isAuthed && items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((x) => (
            <li key={x.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{x.title}</div>
                  <div className="text-sm text-gray-600">/{x.slug}</div>
                </div>
                {x.saved_at ? (
                  <div className="text-xs text-gray-600">{formatSavedAt(x.saved_at)}</div>
                ) : null}
              </div>

              <div className="mt-3">
                <a
                  className="text-sm underline"
                  href={`/pick/${encodeURIComponent(x.slug)}`}
                >
                  Open
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {msg ? <div className="text-sm text-red-600">{msg}</div> : null}
    </main>
  );
}
