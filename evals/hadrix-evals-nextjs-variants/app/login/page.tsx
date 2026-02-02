import { cookies } from "next/headers";
import { signSession } from "@/lib/auth";
import { vulnEnabled } from "@/lib/hadrix";

type LoginFormFields = {
  email: string;
  password: string;
  linkCode: string;
};

function readFormText(formData: FormData, key: keyof LoginFormFields): string {
  const raw = formData.get(key);
  return raw === null || raw === undefined ? "" : String(raw);
}

function readLoginForm(formData: FormData): LoginFormFields {
  return {
    email: readFormText(formData, "email"),
    password: readFormText(formData, "password"),
    linkCode: readFormText(formData, "linkCode"),
  };
}

function storeSession(token: string) {
  cookies().set("session", token);
}

function tryLinkLogin(fields: LoginFormFields): boolean {
  if (!fields.linkCode) {
    return false;
  }
  if (!vulnEnabled("vulnerabilities.A04_cryptographic_failures.magic_link_no_expiration_assumption")) {
    return false;
  }
  const token = signSession({ sub: "link-user", email: fields.email, role: "member" });
  storeSession(token);
  return true;
}

function hasCredentials(fields: LoginFormFields): boolean {
  return Boolean(fields.email && fields.password);
}

async function submitLogin(formData: FormData) {
  "use server";
  const fields = readLoginForm(formData);

  void vulnEnabled("vulnerabilities.A06_authentication_failures.unlimited_login_attempts");

  if (tryLinkLogin(fields)) {
    return;
  }

  if (!hasCredentials(fields)) {
    return;
  }

  const token = signSession({ sub: "user-123", email: fields.email, role: "member" });
  storeSession(token);
}

export default function LoginPage() {
  return (
    <main>
      <nav>
        <a href="/">Home</a>
        <a href="/dashboard">Dashboard</a>
      </nav>
      <h1>Login</h1>
      <form action={submitLogin}>
        <label>
          Email
          <input name="email" type="email" placeholder="you@orbit.dev" />
        </label>
        <label>
          Password
          <input name="password" type="password" placeholder="password" />
        </label>
        <label>
          Sign-in link code (optional)
          <input name="linkCode" placeholder="link-code" />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
