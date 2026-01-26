import Link from "next/link";

export function Nav() {
  return (
    <nav style={{ display: "flex", gap: 12, padding: 12, borderBottom: "1px solid #eee" }}>
      <Link href="/">Orbit</Link>
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/admin">Admin</Link>
      <Link href="/login">Login</Link>
    </nav>
  );
}

