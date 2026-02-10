"use client";

import { useEffect, useState } from "react";
import { callEdgeFunction } from "@/utils/api";
import { supabase } from "@/auth/supabaseClient";
import {
  SIGNAL_DESK_CHANNEL,
  SIGNAL_DESK_FUNCTION,
  SIGNAL_DESK_LABELS
} from "@/constants/signalDeskConfig";
import type { SignalDeskFeedApiResponse } from "@/types/api/signalDeskApi";

export default function SignalDeskPage() {
  const [feed, setFeed] = useState<SignalDeskFeedApiResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!active) return;

      if (!session?.access_token) {
        setHasSession(false);
        return;
      }

      setHasSession(true);
      // TODO: surface the last refresh time in the header once we have a formatter.

      try {
        const payload = await callEdgeFunction<SignalDeskFeedApiResponse>(SIGNAL_DESK_FUNCTION, {
          channel: SIGNAL_DESK_CHANNEL
        });
        if (!active) return;
        // TODO: add a lightweight filter for update types once tags are available.
        setFeed(payload);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? SIGNAL_DESK_LABELS.errorFallback);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (hasSession === false) {
    return (
      <main style={{ maxWidth: 720 }}>
        <h2>{SIGNAL_DESK_LABELS.title}</h2>
        <p>{SIGNAL_DESK_LABELS.loginPrompt}</p>
        <a href="/login">{SIGNAL_DESK_LABELS.loginCta}</a>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ maxWidth: 720 }}>
        <h2>{SIGNAL_DESK_LABELS.title}</h2>
        <p style={{ color: "#a00" }}>{error}</p>
      </main>
    );
  }

  if (!feed) {
    return (
      <main style={{ maxWidth: 720 }}>
        <h2>{SIGNAL_DESK_LABELS.title}</h2>
        <p>{SIGNAL_DESK_LABELS.loading}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720 }}>
      <h2>{SIGNAL_DESK_LABELS.title}</h2>
      <p style={{ color: "#666" }}>
        Channel: {feed.channel} · Viewer: {feed.viewer.id ?? "guest"} ({feed.viewer.role})
      </p>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {feed.updates.map((update) => (
          <li key={update.id} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
            <strong>{update.title}</strong>
            <p style={{ marginTop: 6 }}>{update.detail}</p>
            <p style={{ marginTop: 8, color: "#777", fontSize: 12 }}>{update.created_at}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
