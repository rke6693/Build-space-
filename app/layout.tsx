import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Space Runner — endless 3D runner, in your browser',
  description: 'A buttery-smooth 3D endless runner. Play free, subscribe for unlimited runs, cosmetics, and the global leaderboard.',
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
