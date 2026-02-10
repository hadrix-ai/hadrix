# Partner Directory Import

A small partner directory import screen for ops to upload a CSV of vendors and preview how many records were read. The upload form posts the file to `/api/import` using the `csv` field.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/partners/import` and upload a `.csv` file.

Example import request:
```bash
curl -X POST http://localhost:3000/api/import \
  -F "csv=@./partners.csv"
```
