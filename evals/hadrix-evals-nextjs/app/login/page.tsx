import { cookies } from "next/headers";
import { signSession } from "@/lib/auth";
import { vulnEnabled } from "@/lib/hadrix";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const magicToken = String(formData.get("magicToken") ?? "");

  if (!vulnEnabled("vulnerabilities.A06_authentication_failures.unlimited_login_attempts")) {
  }

  if (magicToken && vulnEnabled("vulnerabilities.A04_cryptographic_failures.magic_link_no_expiration_assumption")) {
    const token = signSession({ sub: "magic-user", email, role: "member" });
    cookies().set("session", token);
    return;
  }

  if (!email || !password) {
    return;
  }

  const token = signSession({ sub: "user-123", email, role: "member" });
  cookies().set("session", token);
}

export default function LoginPage() {
  return (
    <main>
      <nav>
        <a href="/">Home</a>
        <a href="/dashboard">Dashboard</a>
      </nav>
      <h1>Login</h1>
      <form action={loginAction}>
        <label>
          Email
          <input name="email" type="email" placeholder="you@orbit.dev" />
        </label>
        <label>
          Password
          <input name="password" type="password" placeholder="password" />
        </label>
        <label>
          Magic link token (optional)
          <input name="magicToken" placeholder="magic-token" />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
