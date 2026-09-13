import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InventoMatch — Inventory Reconciliation',
  description: 'Import two Excel files, detect the required columns automatically, reconcile inventory against reader scans, and export the final Excel file.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
