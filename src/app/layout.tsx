import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Komy — Biblioteca de Mangas y Libros",
  description:
    "Plataforma web y móvil para subir, organizar por tomos, personalizar portadas y leer mangas y libros en PDF.",
  manifest: "/manifest.json",
  icons: {
    icon: "/komy-logo.png",
    apple: "/komy-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0A26",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
