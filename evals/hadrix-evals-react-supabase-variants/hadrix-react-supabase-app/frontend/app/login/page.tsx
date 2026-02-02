"use client";

import { useState } from "react";
import { supabase } from "@/auth/supabaseClient";

type LoginFormState = {
  email: string;
  password: string;
};

type LoginField = {
  name: keyof LoginFormState;
  placeholder: string;
  type?: string;
};

const loginFields: LoginField[] = [
  { name: "email", placeholder: "email" },
  { name: "password", placeholder: "password", type: "password" },
];

export default function LoginPage() {
  const [form, setForm] = useState<LoginFormState>({ email: "", password: "" });
  const [status, setStatus] = useState<string>("");

  function updateField(field: keyof LoginFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function onLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Signing in...");

    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    setStatus(error ? `Error: ${error.message}` : "Signed in!");
  }

  return (
    <main style={{ maxWidth: 420 }}>
      <h2>Login</h2>
      <form onSubmit={onLogin} style={{ display: "grid", gap: 8 }}>
        {loginFields.map((field) => (
          <input
            key={field.name}
            placeholder={field.placeholder}
            type={field.type}
            value={form[field.name]}
            onChange={(event) => updateField(field.name, event.target.value)}
          />
        ))}
        <button type="submit">Sign in</button>
      </form>
      <p style={{ marginTop: 12 }}>{status}</p>
    </main>
  );
}
