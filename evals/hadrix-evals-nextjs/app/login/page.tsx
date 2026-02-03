import { cookies } from "next/headers";
import { signSession } from "@/lib/auth";
import { toggleEnabled } from "@/lib/hadrix";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const magicToken = String(formData.get("magicToken") ?? "");

  if (!toggleEnabled("vulnerabilities.A06_authentication_failures.login_attempt_flow")) {
  }

  if (magicToken && toggleEnabled("vulnerabilities.A04_cryptographic_failures.magic_link_time_assumption")) {
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
