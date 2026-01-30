
insert into orgs (id, name) values
  ('org-001', 'Orbit Labs');

insert into users (id, email, role, org_id) values
  ('user-001', 'admin@orbit.dev', 'admin', 'org-001');

insert into projects (id, org_id, name, description, description_html, created_by) values
  ('proj-001', 'org-001', 'Redshift', 'Normal description', '<img src=x onerror="alert(1)" />', 'user-001');
