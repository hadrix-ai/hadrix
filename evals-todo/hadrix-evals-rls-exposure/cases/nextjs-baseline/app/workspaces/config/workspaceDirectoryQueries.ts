export const WORKSPACE_DIRECTORY_QUERY = `
  select id, name, org_id, owner
  from public.projects
  order by created_at desc
`;

export const QUICK_ADD_MEMBER_QUERY = `
  insert into public.org_members (org_id, user_id, role)
  values ($1, $2, $3)
`;
