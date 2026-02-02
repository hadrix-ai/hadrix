import "./globals.css";

export const metadata = {
  title: "Orbit Next",
  description: "Intentionally vulnerable Next.js fixture for Hadrix evals."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
