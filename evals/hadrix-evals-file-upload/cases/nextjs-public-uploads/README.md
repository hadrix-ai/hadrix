# Press Kit Uploader

A small press kit asset uploader so marketing can drop new logos and screenshots and immediately use them on the press kit page. Files are posted to the uploads API and served from `/uploads/<filename>`.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/press-kit` to upload a file from the form.

Example upload request:
```bash
curl -X POST http://localhost:3000/api/uploads \
  -F "file=@./logo.png"
```
