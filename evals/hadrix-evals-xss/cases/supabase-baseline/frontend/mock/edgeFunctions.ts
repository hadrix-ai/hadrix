type ProjectRecord = {
  id: string;
  name: string;
  org_id: string;
  description: string | null;
  description_html: string | null;
};

type EdgeFunctionResponse = {
  project: ProjectRecord;
};

const projectRecords: ProjectRecord[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Launch Checklist",
    org_id: "00000000-0000-0000-0000-000000000001",
    description: "Internal launch tasks for Orbit Demo Org.",
    description_html: '<b>Internal</b> launch tasks. <img src=x onerror=alert("preview") />'
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Acme Integration",
    org_id: "00000000-0000-0000-0000-000000000002",
    description: "Partner integration workstream.",
    description_html: "<p>Partner integration</p>"
  }
];

function readProjectId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const maybeId = (body as { id?: unknown }).id;
  return typeof maybeId === "string" ? maybeId : null;
}

function handleGetProject(body: unknown): EdgeFunctionResponse {
  const projectId = readProjectId(body);
  const project = projectId ? projectRecords.find((record) => record.id === projectId) : null;

  if (!project) {
    throw new Error("Function get-project failed: 404 project not found");
  }

  return { project };
}

type EdgeFunctionHandler = (body: unknown, bearer: string) => unknown;

const edgeFunctionHandlers: Record<string, EdgeFunctionHandler> = {
  "get-project": (body) => handleGetProject(body)
};

export function callLocalEdgeFunction(functionName: string, body: unknown, _bearer: string): unknown {
  const handler = edgeFunctionHandlers[functionName];
  if (!handler) {
    throw new Error(`Function ${functionName} failed: 404 handler not found`);
  }
  return handler(body, _bearer);
}
