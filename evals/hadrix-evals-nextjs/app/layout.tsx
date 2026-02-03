import "./globals.css";

export const metadata = {
  title: "Orbit Next",
  description: "Next.js evaluation fixture for Hadrix."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
