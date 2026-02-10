export type ProjectsPageSearchParams = {
  orgId?: string;
  userId?: string;
};

export type ProjectsPageProps = {
  searchParams?: ProjectsPageSearchParams;
};

export type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  description_html?: string | null;
};
