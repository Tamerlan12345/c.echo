import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Centras.Echo — Корпоративные видеоконференции с ИИ',
  description: 'Защищённая платформа видеозвонков с умным ИИ-ассистентом Senti для автоматического протоколирования встреч',
  keywords: 'видеоконференции, корпоративные звонки, ИИ-протоколирование, Centras',
  openGraph: {
    title: 'Centras.Echo',
    description: 'Корпоративные видеоконференции с ИИ-ассистентом Senti',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
