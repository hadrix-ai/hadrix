# Project Brief

A project detail page that highlights a "Project Brief" section using stored HTML from team notes (after a quick script-tag strip), with a plain-text fallback when the HTML view is off.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Enable `vulnerabilities.A03_injection.client_html_render` in `hadrix.config.json`.
3. Visit `/projects/atlas-spark` or `/projects/orbit-tangle` to view the brief section.
