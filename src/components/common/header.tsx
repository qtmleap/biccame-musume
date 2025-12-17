import { Link, useLocation } from '@tanstack/react-router'
import { Calendar, MapPin, Menu, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * ナビゲーションリンクの定義
 */
const navLinks = [
  { to: '/characters', label: 'キャラクター', icon: Users },
  { to: '/calendar', label: 'カレンダー', icon: Calendar },
  { to: '/location', label: 'マップ', icon: MapPin }
] as const

type HeaderProps = {
  className?: string
}

/**
 * 共通ヘッダーコンポーネント（モバイル・デスクトップ両対応）
 */
export const Header = ({ className }: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const location = useLocation()

  /**
   * メニューを開く
   */
  const openMenu = () => {
    setMobileMenuOpen(true)
    requestAnimationFrame(() => setIsAnimating(true))
  }

  /**
   * メニューを閉じる
   */
  const closeMenu = () => {
    setIsAnimating(false)
    setTimeout(() => setMobileMenuOpen(false), 200)
  }

  /**
   * メニュートグル
   */
  const toggleMenu = () => {
    if (mobileMenuOpen) {
      closeMenu()
    } else {
      openMenu()
    }
  }

  // ルート変更時にメニューを閉じる
  // biome-ignore lint/correctness/useExhaustiveDependencies: reason
  useEffect(() => {
    if (mobileMenuOpen) {
      closeMenu()
    }
  }, [location.pathname])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b border-border',
        'pt-safe',
        className
      )}
    >
      <div className='container mx-auto px-4'>
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
          </nav>

          {/* モバイルメニューボタン */}
          <Button
            variant='ghost'
            size='icon'
            className='md:hidden h-12 w-12 flex items-center justify-center'
            onClick={toggleMenu}
            aria-label={mobileMenuOpen ? 'メニューを閉じる' : 'メニューを開く'}
          >
            <div className='relative w-6 h-6 flex items-center justify-center'>
              <Menu
                className={cn(
                  'absolute transition-all duration-200',
                  mobileMenuOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
                )}
              />
              <X
                className={cn(
                  'absolute transition-all duration-200',
                  mobileMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
                )}
              />
            </div>
          </Button>
        </div>
      </div>

      {/* モバイルナビゲーション（オーバーレイ） */}
      {mobileMenuOpen && (
        <>
          {/* 背景オーバーレイ */}
          <button
            type='button'
            className={cn(
              'fixed inset-0 bg-background/80 backdrop-blur-sm md:hidden transition-opacity duration-200',
              isAnimating ? 'opacity-100' : 'opacity-0'
            )}
            onClick={closeMenu}
            style={{ top: '3rem' }}
            aria-label='メニューを閉じる'
          />

          {/* メニュー本体 */}
          <nav
            className={cn(
              'absolute left-0 right-0 md:hidden bg-background border-b border-border shadow-lg transition-all duration-200 ease-out',
              isAnimating ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
            )}
          >
            <div className='container mx-auto px-4 py-4'>
              <div className='flex flex-col gap-1'>
                {navLinks.map((link, index) => {
                  const Icon = link.icon
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={closeMenu}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted',
                        isAnimating ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
                      )}
                      style={{ transitionDelay: isAnimating ? `${index * 50}ms` : '0ms' }}
                    >
                      <Icon className='w-6 h-6' />
                      {link.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          </nav>
        </>
      )}
    </header>
  )
}

export default Header
