# Billing Console

A small Billing Console page that lets support teams check a Stripe balance from the browser. The `/billing` route renders `BillingConsoleClient`, which stubs the balance response and displays the `BillingSecrets` widget.

**Run**
1. Register the App Router page at `app/billing/page.tsx`.
2. Visit `/billing` and click "Check balance" to trigger the balance request.

Example usage:
```tsx
import BillingConsolePage from "./app/billing/page";

export default function Page() {
  return <BillingConsolePage />;
}
```
