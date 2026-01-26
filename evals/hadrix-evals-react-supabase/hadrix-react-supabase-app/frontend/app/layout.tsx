import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Container } from "@/components/Container";

export const metadata: Metadata = {
  title: "Orbit Projects",
  description: "Multi-tenant project tracking for fast-moving teams."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <Container>{children}</Container>
      </body>
    </html>
  );
}

