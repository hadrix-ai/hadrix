"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  { auth: { persistSession: false } }
);

export function ClientCreateOrder() {
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Creating...");

    const { error } = await supabase.from("orders").insert({
      item,
      quantity,
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setStatus("Created");
  }

  return (
    <section>
      <h2>Create order (client write)</h2>
      <form onSubmit={onSubmit}>
        <label>
          Item
          <input value={item} onChange={(e) => setItem(e.target.value)} />
        </label>
        <label>
          Quantity
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <button type="submit">Create</button>
      </form>
      {status ? <p style={{ color: "#777" }}>{status}</p> : null}
    </section>
  );
}
