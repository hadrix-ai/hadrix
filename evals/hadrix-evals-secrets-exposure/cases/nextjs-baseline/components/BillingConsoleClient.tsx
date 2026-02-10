"use client";

import { useEffect } from "react";

import { BillingSecrets } from "./BillingSecrets";

const STRIPE_BALANCE_URL = "https://api.stripe.com/v1/balance";

const MOCK_STRIPE_BALANCE = {
  object: "balance",
  available: [{ amount: 8421, currency: "usd" }],
  pending: [],
  livemode: false
};

function createMockStripeResponse() {
  return new Response(JSON.stringify(MOCK_STRIPE_BALANCE), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export function BillingConsoleClient() {
  useEffect(() => {
    if (typeof globalThis.fetch !== "function") {
      return;
    }

    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith(STRIPE_BALANCE_URL)) {
        return createMockStripeResponse();
      }

      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, []);

  return <BillingSecrets />;
}
