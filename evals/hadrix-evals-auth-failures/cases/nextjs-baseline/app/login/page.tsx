import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession } from "@/lib/auth";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return;
  }

  const token = signSession({ sub: "user-123", email, role: "member" });
  cookies().set("session", token);
  redirect("/dashboard");
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
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
