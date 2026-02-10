type ProjectRecord = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

type QueryBuilder<T> = {
  eq: (column: string, value: string) => QueryBuilder<T>;
  or: (filter: string) => QueryBuilder<T>;
  limit: (max: number) => QueryResult<T[]>;
};

const PROJECTS_TABLE = "projects";

const localProjects: ProjectRecord[] = [
  {
    id: "proj-atlas-core",
    org_id: "org-atlas",
    name: "Atlas Core",
    description: "Baseline reporting for the Atlas dashboard.",
    description_html: "<p>Baseline reporting for the Atlas dashboard.</p>"
  },
  {
    id: "proj-spark-bridge",
    org_id: "org-atlas",
    name: "Spark Bridge",
    description: "Partnership integration for team workflows.",
    description_html: "<p>Partnership integration for team workflows.</p>"
  },
  {
    id: "proj-echo-labs",
    org_id: "org-echo",
    name: "Echo Labs",
    description: "Exploratory product signals and feedback loops.",
    description_html: "<p>Exploratory product signals and feedback loops.</p>"
  }
];

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function createUnknownQueryBuilder<T>(): QueryBuilder<T> {
  const builder: QueryBuilder<T> = {
    eq: () => builder,
    or: () => builder,
    limit: async () => createUnknownTableResult<T[]>()
  };

  return builder;
}

function createProjectsQueryBuilder(): QueryBuilder<ProjectRecord> {
  let orgIdFilter: string | null = null;
  let orFilter: string | null = null;

  const builder: QueryBuilder<ProjectRecord> = {
    eq: (column: string, value: string) => {
      if (column === "org_id") {
        orgIdFilter = value;
      }
      return builder;
    },
    or: (filter: string) => {
      orFilter = filter;
      return builder;
    },
    limit: async (max: number) => {
      let rows = localProjects.slice();

      if (orgIdFilter) {
        rows = rows.filter((row) => row.org_id === orgIdFilter);
      }

      if (orFilter && orFilter.trim()) {
        rows = localProjects.slice();
      }

      return { data: rows.slice(0, max), error: null };
    }
  };

  return builder;
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table !== PROJECTS_TABLE) {
        return {
          select: (_columns: string) => createUnknownQueryBuilder<never>()
        };
      }

      return {
        select: (_columns: string) => createProjectsQueryBuilder()
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
