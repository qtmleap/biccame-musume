import { Link } from '@tanstack/react-router'
import { Award, Cake, Gift, MapPin, Menu, Trophy, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LoginButton } from '@/components/auth/login-button'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { NAVIGATION_LABELS } from '@/locales/app.content'

/**
 * ナビゲーションリンクの定義
 */
const navLinks = [
  { to: '/characters', label: NAVIGATION_LABELS.characters, icon: Users, requiresAuth: false },
  { to: '/events', label: NAVIGATION_LABELS.events, icon: Gift, requiresAuth: false },
  { to: '/calendar', label: NAVIGATION_LABELS.calendar, icon: Cake, requiresAuth: false },
  { to: '/location', label: NAVIGATION_LABELS.location, icon: MapPin, requiresAuth: false },
  { to: '/ranking', label: NAVIGATION_LABELS.ranking, icon: Trophy, requiresAuth: false },
  { to: '/badges', label: NAVIGATION_LABELS.badges, icon: Award, requiresAuth: true }
] as const

type HeaderProps = {
  className?: string
}

/**
 * 共通ヘッダーコンポーネント(モバイル・デスクトップ両対応)
 */
export const Header = ({ className }: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isAuthenticated } = useAuth()

  const visibleLinks = navLinks.filter((link) => !link.requiresAuth || isAuthenticated)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileMenuOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  const closeMenu = () => setMobileMenuOpen(false)

  return (
    <header
      className={cn(
        'sticky top-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b border-border',
        className
      )}
    >
      <div className='mx-auto px-4 md:px-8 max-w-6xl'>
        <div className='flex items-center justify-between h-12 md:h-14'>
          {/* ロゴ */}
          <Link
            to='/'
            className='flex items-center font-bold text-lg md:text-xl tracking-tight hover:text-primary transition-colors'
          >
            ビッカメ娘
          </Link>

          {/* デスクトップナビゲーション */}
          <nav className='hidden md:flex items-center gap-6'>
            {visibleLinks.map((link) => {
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className='text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:underline decoration-2 decoration-primary underline-offset-4'
                >
                  {link.label}
                </Link>
              )
            })}
            <LoginButton />
          </nav>

          {/* モバイル: メニュー */}
          <div className='md:hidden flex items-center'>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-12 w-12 flex items-center justify-center border border-transparent'
                  aria-label={NAVIGATION_LABELS.openMenu}
                >
                  <Menu aria-hidden='true' />
                </Button>
              </SheetTrigger>
              <SheetContent
                aria-describedby={undefined}
                side='top'
                showCloseButton={false}
                className='max-h-[100dvh] overflow-y-auto'
              >
                <SheetTitle className='sr-only'>メニュー</SheetTitle>
                <SheetClose asChild>
                  <Button variant='ghost' size='icon' className='self-end m-2' aria-label={NAVIGATION_LABELS.closeMenu}>
                    <X aria-hidden='true' />
                  </Button>
                </SheetClose>
                <nav aria-label='メインナビゲーション' className='px-4 pb-4'>
                  <div className='flex flex-col gap-1'>
                    {visibleLinks.map((link) => {
                      const Icon = link.icon
                      return (
                        <Link
                          key={link.to}
                          to={link.to}
                          onClick={closeMenu}
                          className='flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-200 text-muted-foreground hover:text-foreground hover:bg-muted'
                        >
                          <Icon className='w-6 h-6' aria-hidden='true' />
                          {link.label}
                        </Link>
                      )
                    })}
                    <LoginButton variant='menu' onClose={closeMenu} />
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}
