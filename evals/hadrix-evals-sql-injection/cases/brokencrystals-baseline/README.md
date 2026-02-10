# BrokenCrystals Testimonial Pulse

A tiny Express app that powers a marketing "Testimonial Pulse" widget. Staff can fetch a quick count of testimonials that match a keyword to gauge current messaging themes.

**Run**
1. Create a small runner that imports `buildTestimonialPulseApp` from `server/app.ts` and listens on a local port.
2. Send a GET request to `/marketing/testimonials/pulse?search=glow` (or any keyword) to fetch the count.

Example runner:
```ts
import { buildTestimonialPulseApp } from "./server/app.js";

const app = buildTestimonialPulseApp();
app.listen(3000, () => console.log("Testimonial Pulse on :3000"));
```

Example request:
```bash
curl "http://localhost:3000/marketing/testimonials/pulse?search=glow"
```
