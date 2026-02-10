import React from "react";
import axios, { type AxiosAdapter } from "axios";
import kebabCase from "lodash/kebabCase";
import jwt from "jsonwebtoken";
import { LAUNCHPAD_STATUS_DEFAULT_DRAFT } from "./constants/launchpadStatusDefaults";
import type { LaunchpadDraftDomainModel } from "./types/domain/launchpadDraftDomainModel";

const inMemoryAdapter: AxiosAdapter = async (config) => ({
  data: {
    ok: true,
    path: config.url ?? "",
    method: config.method ?? "get",
  },
  status: 200,
  statusText: "OK",
  headers: {},
  config,
});

const api = axios.create({
  baseURL: "https://example.com",
  adapter: inMemoryAdapter,
});

const launchpadDraft = LAUNCHPAD_STATUS_DEFAULT_DRAFT;

function LaunchpadStatusCard({ draft }: { draft: LaunchpadDraftDomainModel }) {
  const slug = kebabCase(draft.projectLabel);
  const decoded = jwt.decode(draft.previewToken);
  const [pingPath, setPingPath] = React.useState(draft.defaultPingPath);
  // TODO: Persist the last ping path between sessions once we finalize the UX.
  // TODO: Replace the raw token dump with a compact badge list in the card header.

  return (
    <section>
      <header>
        <h1>{draft.projectLabel}</h1>
        <p>Slug: {slug}</p>
      </header>
      <section>
        <h2>Preview Token</h2>
        <pre>{JSON.stringify(decoded, null, 2)}</pre>
      </section>
      <section>
        <h2>Service Health</h2>
        <label>
          Ping path
          <input
            value={pingPath}
            onChange={(event) => setPingPath(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => void api.get(pingPath)}>
          Ping
        </button>
      </section>
    </section>
  );
}

export function App() {
  return (
    <main>
      <LaunchpadStatusCard draft={launchpadDraft} />
    </main>
  );
}
