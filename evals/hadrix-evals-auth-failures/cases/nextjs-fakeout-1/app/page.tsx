"use client";

import { useEffect, useState } from "react";

import {
  SESSION_PULSE_COPY,
  SESSION_PULSE_DEFAULT_ROLE,
  SESSION_PULSE_QUICK_LINKS
} from "../constants/sessionPulseCopy";
import { SessionPulseApiResponse } from "../types/api/sessionPulseApiResponse";

type SessionStatus = "idle" | "loading" | "ready" | "error";

type SessionPulseSession = Omit<SessionPulseApiResponse, "error">;

const STATUS: Record<SessionStatus, SessionStatus> = {
  idle: "idle",
  loading: "loading",
  ready: "ready",
  error: "error"
};

export default function SessionPulseHome() {
  const [status, setStatus] = useState<SessionStatus>(STATUS.idle);
  const [message, setMessage] = useState(SESSION_PULSE_COPY.messages.idle);
  const [session, setSession] = useState<SessionPulseSession | null>(null);

  const loadSession = async () => {
    // TODO: capture the last refresh timestamp for the pulse header.
    setStatus(STATUS.loading);
    setMessage(SESSION_PULSE_COPY.messages.loading);

    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include"
      });
      const data = (await response.json()) as SessionPulseApiResponse;

      if (!response.ok) {
        setSession(null);
        setStatus(STATUS.error);
        setMessage(data.error ?? SESSION_PULSE_COPY.messages.missing);
        return;
      }

      setSession({
        userId: data.userId,
        email: data.email ?? null,
        role: data.role ?? SESSION_PULSE_DEFAULT_ROLE
      });
      setStatus(STATUS.ready);
      setMessage(SESSION_PULSE_COPY.messages.ready);
    } catch {
      setSession(null);
      setStatus(STATUS.error);
      setMessage(SESSION_PULSE_COPY.messages.error);
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  return (
    <main className="pulse">
      <header className="pulse__bar">
        <div>
          <p className="pulse__eyebrow">{SESSION_PULSE_COPY.headerEyebrow}</p>
          <h1 className="pulse__title">{SESSION_PULSE_COPY.headerTitle}</h1>
        </div>
        <div className="pulse__status">
          <p className="pulse__label">{SESSION_PULSE_COPY.statusLabel}</p>
          <p className="pulse__value">
            {status} · {message}
          </p>
        </div>
        <div className="pulse__session">
          <p className="pulse__label">{SESSION_PULSE_COPY.sessionLabel}</p>
          <p className="pulse__value">
            {session?.userId ?? SESSION_PULSE_COPY.fallbacks.guestUser}
          </p>
          <p className="pulse__meta">
            {session?.email ?? SESSION_PULSE_COPY.fallbacks.noEmail} ·{" "}
            {session?.role ?? SESSION_PULSE_DEFAULT_ROLE}
          </p>
        </div>
        <button type="button" onClick={loadSession} className="pulse__button">
          {SESSION_PULSE_COPY.refreshLabel}
        </button>
      </header>

      <section className="pulse__links">
        <h2 className="pulse__section-title">{SESSION_PULSE_COPY.quickLinksTitle}</h2>
        {/* TODO: highlight recently used links for returning sessions. */}
        <ul>
          {SESSION_PULSE_QUICK_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href}>{link.label}</a>
            </li>
          ))}
        </ul>
      </section>

      <section className="pulse__body">
        <h2 className="pulse__section-title">{SESSION_PULSE_COPY.overviewTitle}</h2>
        <p>{SESSION_PULSE_COPY.overviewBody}</p>
      </section>

      <style jsx>{`
        .pulse {
          min-height: 100vh;
          padding: 2.5rem 2.75rem 4rem;
          display: grid;
          gap: 2rem;
          font-family: "Georgia", "Times New Roman", serif;
          color: #2b2520;
          background: radial-gradient(circle at top, #fbf6ef, #f2ede4);
        }

        .pulse__bar {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.25fr) auto;
          gap: 1.5rem;
          align-items: center;
          background: #ffffff;
          border: 1px solid #e6d8c7;
          border-radius: 18px;
          padding: 1.5rem 1.75rem;
          box-shadow: 0 12px 28px rgba(43, 37, 32, 0.1);
        }

        .pulse__eyebrow {
          margin: 0 0 0.4rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 0.65rem;
          color: #9b623f;
        }

        .pulse__title {
          margin: 0;
          font-size: 1.65rem;
        }

        .pulse__label {
          margin: 0;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: #8a6c52;
        }

        .pulse__value {
          margin: 0.2rem 0 0;
          font-weight: 600;
        }

        .pulse__meta {
          margin: 0.35rem 0 0;
          font-size: 0.85rem;
          color: #6d5a48;
        }

        .pulse__button {
          border: none;
          border-radius: 999px;
          padding: 0.55rem 1.2rem;
          background: #c2743e;
          color: #fff7ee;
          cursor: pointer;
          font-weight: 600;
        }

        .pulse__links,
        .pulse__body {
          background: #ffffff;
          border-radius: 16px;
          padding: 1.5rem;
          border: 1px solid #e6d8c7;
        }

        .pulse__section-title {
          margin: 0 0 0.75rem;
          font-size: 1.15rem;
        }

        ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 0.5rem;
        }

        a {
          color: #8c4f2b;
          text-decoration: none;
          font-weight: 600;
        }
      `}</style>
    </main>
  );
}
