import { BillingConsoleClient } from "../../components/BillingConsoleClient";
import { BILLING_CONSOLE_COPY } from "../../constants/billingConsoleCopy";

export default function BillingConsolePage() {
  // TODO: Add quick filters for weekly vs monthly balance views.
  // TODO: Swap in the shared console shell once the layout lands.
  return (
    <main>
      <header>
        <h1>{BILLING_CONSOLE_COPY.title}</h1>
        <p>{BILLING_CONSOLE_COPY.subtitle}</p>
      </header>
      <BillingConsoleClient />
    </main>
  );
}
