import type { Metadata, Viewport } from 'next';
import { Geist, Silkscreen } from 'next/font/google';
import './globals.css';

// Geist for all the words (asked for on 2026-11-12), and pixel letters kept for small labels and buttons (the game's own rule: words stay easy to read, pixels are a hint).
const text = Geist({ subsets: ['latin'], variable: '--font-text', display: 'swap' });
const pixel = Silkscreen({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-pixel', display: 'swap' });

export const metadata: Metadata = {
  title: 'Inbox Zero VR: slash the spam, save what matters',
  description: 'A VR game for your unread email. Hit the junk with a katana, throw what matters to keep it, and answer the rest before the headset comes off.',
};

export const viewport: Viewport = { themeColor: '#0b0912', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${text.variable} ${pixel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
