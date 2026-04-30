import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Green Dii Sales',
  description: 'Green Dii Sales Workflow System',
  icons: {
    icon: '/logo.ico',
    shortcut: '/logo.ico',
    apple: '/logo.jpg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={inter.className}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            success: { duration: 3000 },
            error: { duration: 5000 },
          }}
        />
      </body>
    </html>
  )
}
