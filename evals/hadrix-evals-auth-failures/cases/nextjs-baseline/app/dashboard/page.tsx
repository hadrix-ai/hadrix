import { cookies, headers } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { dashboardCopy } from "./dashboardCopy";
import { quickstartTools } from "./quickstartTools";

function buildRequestFromRuntimeHeaders() {
  const headerList = headers();
  const session = cookies().get("session")?.value ?? "";
  const requestHeaders = new Headers(headerList);

  if (session && !requestHeaders.get("authorization")) {
    requestHeaders.set("authorization", `Bearer ${session}`);
  }

  return new Request("http://launchpad.local/dashboard", { headers: requestHeaders });
}

export default function DashboardPage() {
  const auth = getAuthContext(buildRequestFromRuntimeHeaders());
  const displayName = auth.userId ?? "guest";

  return (
    <main>
      {/* TODO: collapse nav into a dropdown on small screens once we confirm the final link set. */}
      <nav>
        {dashboardCopy.navLinks.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <h1>{dashboardCopy.title}</h1>
      <p>
        {dashboardCopy.welcomePrefix}
        {displayName}
        {dashboardCopy.welcomeSuffix}
      </p>
      <p>
        {dashboardCopy.rolePrefix}
        {auth.role}
      </p>
      <section>
        <h2>{dashboardCopy.quickstartHeading}</h2>
        <ul>
          {quickstartTools.map((tool) => (
            <li key={tool.id}>
              <strong>{tool.label}</strong>
              {/* TODO: add a "last used" hint once we track tool usage in the session. */}
              <p>{tool.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
