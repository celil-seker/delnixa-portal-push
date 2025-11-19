import "./globals.css";

export const metadata = {
  title: "Delnixa Portal",
  description: "Delnixa Energy Intelligence",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

