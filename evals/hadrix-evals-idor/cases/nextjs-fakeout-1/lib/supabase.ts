type ProjectRecord = {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  description_html: string | null;
};

type ProjectMembershipRecord = {
  project_id: string;
  user_id: string;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

const projectRoster: ProjectRecord[] = [
  {
    id: "proj-701",
    org_id: "org-nimbus",
    name: "Nimbus Incident Brief",
    description: "Auto-compiled outage recap for the on-call log.",
    description_html: "<p>Auto-compiled outage recap for the on-call log.</p>"
  },
  {
    id: "proj-702",
    org_id: "org-harbor",
    name: "Harbor Patch Queue",
    description: "Patch rollups and deployment notes for the release train.",
    description_html: "<p>Patch rollups and deployment notes for the release train.</p>"
  }
];

const projectMemberships: ProjectMembershipRecord[] = [
  { project_id: "proj-701", user_id: "user-triage-1" },
  { project_id: "proj-702", user_id: "user-ops-9" }
];

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function createProjectUsersQuery() {
  const filters: { projectId?: string; userId?: string } = {};
  const query = {
    eq: (column: string, value: string) => {
      if (column === "project_id") {
        filters.projectId = value;
      }
      if (column === "user_id") {
        filters.userId = value;
      }
      return query;
    },
    maybeSingle: async (): QueryResult<ProjectMembershipRecord> => ({
      data:
        projectMemberships.find((row) => {
          const projectMatch = filters.projectId ? row.project_id === filters.projectId : true;
          const userMatch = filters.userId ? row.user_id === filters.userId : true;
          return projectMatch && userMatch;
        }) ?? null,
      error: null
    })
  };

  return query;
}

function createProjectsQuery() {
  const query = {
    eq: (_column: string, value: string) => ({
      maybeSingle: async (): QueryResult<ProjectRecord> => ({
        data: projectRoster.find((row) => row.id === value) ?? null,
        error: null
      })
    })
  };

  return query;
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table === "project_users") {
        return {
          select: (_columns: string) => createProjectUsersQuery()
        };
      }

      if (table === "projects") {
        return {
          select: (_columns: string) => createProjectsQuery()
        };
      }

      return {
        select: (_columns: string) => ({
          eq: (_column: string, _value: string) => ({
            maybeSingle: async (): QueryResult<unknown> => createUnknownTableResult<unknown>()
          })
        })
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
