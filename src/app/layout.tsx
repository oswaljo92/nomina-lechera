import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Nómina Lechera | Dashboard',
  description: 'Sistema web de gestión de recepción lechera',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="antialiased">
      <body className={`${inter.className} min-h-screen bg-slate-50 text-slate-900`}>
        {children}
      </body>
    </html>
  )
}
