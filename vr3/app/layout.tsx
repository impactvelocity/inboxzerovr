import type { Metadata, Viewport } from 'next';
import { Geist, Silkscreen } from 'next/font/google';
import { Analytics } from './_site/Analytics';
import './globals.css';

// Geist for all the words (asked for on 2026-11-12), and pixel letters kept for small labels and buttons (the game's own rule: words stay easy to read, pixels are a hint).
const text = Geist({ subsets: ['latin'], variable: '--font-text', display: 'swap' });
const pixel = Silkscreen({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-pixel', display: 'swap' });

// The words are the Devpost page's own. The favicon (icon.svg, favicon.ico, apple-icon.png) and the link preview
// (opengraph-image.jpg, twitter-image.jpg) sit beside this file, and Next writes their tags; they are drawn by
// devpost-images/make-icons.mjs and devpost-images/og.html (render-og.mjs).
const title = 'Inbox Zero VR: Slash, Burn and Smash Your Way to Inbox Zero';
const description = 'Your unread email as a short VR game on Meta Quest. Grab an email to read it, throw it to keep it, or smash it into tiny little pieces. Nothing to install.';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.inboxzerovr.com'),
  title,
  description,
  applicationName: 'Inbox Zero VR',
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: '/', siteName: 'Inbox Zero VR', title, description, locale: 'en_US' },
  twitter: { card: 'summary_large_image', title, description },
};

export const viewport: Viewport = { themeColor: '#0b0912', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${text.variable} ${pixel.variable}`}>
      <body>{children}<Analytics /></body>
    </html>
  );
}
