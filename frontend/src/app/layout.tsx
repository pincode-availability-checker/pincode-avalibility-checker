import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PIN Check — Regional Availability Manifest',
  description: 'Reverse-search engine for Indian e-commerce delivery by PIN code.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
