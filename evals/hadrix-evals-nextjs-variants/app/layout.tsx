import "./globals.css";

export const metadata = {
  title: "Orbit Next",
  description: "Purpose-built Next.js fixture for Hadrix evals."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
