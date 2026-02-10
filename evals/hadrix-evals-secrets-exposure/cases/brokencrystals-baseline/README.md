# Pickup Desk Map Preview

A small BrokenCrystals Pickup Desk page that shows a static map preview for the pickup address. The `StorefrontPage` component renders pickup info and embeds `MapsPreview` for the map snapshot.

**Run**
1. Render `StorefrontPage` from `client/StorefrontPage.tsx` inside a React/Next.js page.
2. Load the page to view the pickup info panel and map preview.

Example usage:
```tsx
import { StorefrontPage } from "./client/StorefrontPage";

export default function Page() {
  return <StorefrontPage />;
}
```
