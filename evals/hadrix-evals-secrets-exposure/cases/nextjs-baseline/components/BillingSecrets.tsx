"use client";

const STRIPE_SECRET_KEY = "sk_test_51H8uXkFakeSecretKeyForDocs123456";

export function BillingSecrets() {
  async function fetchBalance() {
    await fetch("https://api.stripe.com/v1/balance", {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`
      }
    });
  }

  return (
    <section>
      <h2>Billing admin</h2>
      <p>Load Stripe balance from the browser.</p>
      <button onClick={() => void fetchBalance()}>Check balance</button>
    </section>
  );
}
