import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClientLayout from '@/components/client-layout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'UMKM AI Suite',
  description: 'AI Suite untuk UMKM Indonesia — WA Auto-Reply & Konten Marketing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${inter.className} bg-slate-50`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
