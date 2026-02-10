"use client";

import { useEffect, useState } from "react";

import { STATUS_BEACON_COPY } from "./constants/statusBeaconCopy";
import { STATUS_BEACON_REQUEST_HEADERS } from "./constants/statusBeaconRequestHeaders";

type StatusBeaconApiResponse = {
  ok: boolean;
  status: string;
  requestId: string;
};

export default function StatusBeaconPage() {
  const [payload, setPayload] = useState<StatusBeaconApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    function loadStatus() {
      try {
        // TODO: Cache the last successful status in sessionStorage for quick reloads.
        const data: StatusBeaconApiResponse = {
          ok: true,
          status: "ready",
          requestId: STATUS_BEACON_REQUEST_HEADERS["x-request-id"]
        };

        if (isActive) {
          setPayload(data);
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : "unknown error");
        }
      }
    }

    loadStatus();

    return () => {
      isActive = false;
    };
  }, []);

  const { title, description, labels } = STATUS_BEACON_COPY;

  return (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      <ul>
        <li>
          {labels.endpoint}: <a href="/api/status">/api/status</a>
        </li>
        <li>
          {labels.status}: {payload?.status ?? "checking"}
        </li>
        <li>
          {labels.requestId}: {payload?.requestId ?? "pending"}
        </li>
        <li>
          {labels.ok}: {payload ? String(payload.ok) : "pending"}
        </li>
        {error ? <li>Error: {error}</li> : null}
      </ul>
    </main>
  );
}
