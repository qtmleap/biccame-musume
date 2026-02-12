import { Link } from '@tanstack/react-router'
import { Cake, Gift, MapPin, Menu, Trophy, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { LoginButton } from '@/components/auth/login-button'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NAVIGATION_LABELS } from '@/locales/app.content'

/**
 * ナビゲーションリンクの定義
 */
const navLinks = [
  { to: '/characters', label: NAVIGATION_LABELS.characters, icon: Users },
  { to: '/events', label: NAVIGATION_LABELS.events, icon: Gift },
  { to: '/calendar', label: NAVIGATION_LABELS.calendar, icon: Cake },
  { to: '/location', label: NAVIGATION_LABELS.location, icon: MapPin },
  { to: '/ranking', label: NAVIGATION_LABELS.ranking, icon: Trophy }
] as const

type HeaderProps = {
  className?: string
}

/**
 * 共通ヘッダーコンポーネント(モバイル・デスクトップ両対応)
 */
export const Header = ({ className }: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  /**
   * メニュートグル
   */
  const toggleMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  /**
   * メニューを閉じる
   */
  const closeMenu = () => {
    setMobileMenuOpen(false)
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b border-border',
        'pt-safe',
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
            {navLinks.map((link) => {
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className='text-sm font-medium transition-all text-muted-foreground hover:text-foreground hover:underline decoration-2 decoration-primary underline-offset-4'
                >
                  {link.label}
                </Link>
              )
            })}
            <LoginButton />
          </nav>

          {/* モバイルメニューボタン */}
          <Button
            variant='ghost'
            size='icon'
            className='md:hidden h-12 w-12 flex items-center justify-center'
            onClick={toggleMenu}
            aria-label={mobileMenuOpen ? NAVIGATION_LABELS.closeMenu : NAVIGATION_LABELS.openMenu}
          >
            <div className='relative w-6 h-6 flex items-center justify-center'>
              <motion.div
                initial={false}
                animate={{
                  opacity: mobileMenuOpen ? 0 : 1,
                  rotate: mobileMenuOpen ? 90 : 0,
                  scale: mobileMenuOpen ? 0.5 : 1
                }}
                transition={{ duration: 0.2 }}
                className='absolute'
              >
                <Menu />
              </motion.div>
              <motion.div
                initial={false}
                animate={{
                  opacity: mobileMenuOpen ? 1 : 0,
                  rotate: mobileMenuOpen ? 0 : -90,
                  scale: mobileMenuOpen ? 1 : 0.5
                }}
                transition={{ duration: 0.2 }}
                className='absolute'
              >
                <X />
              </motion.div>
            </div>
          </Button>
        </div>
      </div>

      {/* モバイルナビゲーション(オーバーレイ) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* 背景オーバーレイ */}
            <motion.button
              type='button'
              className='fixed inset-0 bg-background/80 backdrop-blur-sm md:hidden'
              onClick={closeMenu}
              style={{ top: '3rem' }}
              aria-label={NAVIGATION_LABELS.closeMenu}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />

            {/* メニュー本体 */}
            <motion.nav
              className='absolute left-0 right-0 md:hidden bg-background border-b border-border shadow-lg'
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className='mx-auto px-4 py-4'>
                <div className='flex flex-col gap-1'>
                  {navLinks.map((link, index) => {
                    const Icon = link.icon
                    return (
                      <motion.div
                        key={link.to}
                        initial={{ x: -16, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -16, opacity: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.05, ease: 'easeOut' }}
                      >
                        <Link
                          to={link.to}
                          onClick={closeMenu}
                          className='flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted'
                        >
                          <Icon className='w-6 h-6' />
                          {link.label}
                        </Link>
                      </motion.div>
                    )
                  })}
                  <motion.div
                    initial={{ x: -16, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -16, opacity: 0 }}
                    transition={{ duration: 0.2, delay: navLinks.length * 0.05, ease: 'easeOut' }}
                  >
                    <LoginButton variant='menu' />
                  </motion.div>
                </div>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </header>
  )
}

export default Header
