import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const s = await getSettings();
    return { title: { default: `${s.shop_name} – Book a barber`, template: `%s · ${s.shop_name}` }, description: s.tagline || s.about };
  } catch {
    return { title: "Barbershop" };
  }
}

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,500..800&family=Manrope:wght@400..800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
