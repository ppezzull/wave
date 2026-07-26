import { AppWrapper } from '@/components/app-wrapper'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppWrapper>{children}</AppWrapper>
}
