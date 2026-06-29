import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { AUTH_LABELS } from '@/locales/app.content'
import { EmailAuthTabs } from './email-auth-tabs'
import { SocialLoginButtons } from './social-login-buttons'

type LoginDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * ログインダイアログ
 * Google / Apple / GitHub / X 認証 (本番)、 メール/パスワード認証 (開発のみ)
 */
export const LoginDialog = ({ open, onOpenChange }: LoginDialogProps) => {
  const [isLoading, setIsLoading] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>{AUTH_LABELS.login}</DialogTitle>
          <DialogDescription className='whitespace-pre-line'>{AUTH_LABELS.loginMessage}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <SocialLoginButtons isLoading={isLoading} onLoadingChange={setIsLoading} />

          {/* メール/パスワード認証（開発環境のみ） */}
          {import.meta.env.DEV && (
            <>
              <div className='relative'>
                <div className='absolute inset-0 flex items-center'>
                  <Separator className='bg-separator' />
                </div>
                <div className='relative flex justify-center text-xs uppercase'>
                  <span className='bg-background px-2 text-muted-foreground'>または</span>
                </div>
              </div>

              <EmailAuthTabs
                isLoading={isLoading}
                onLoadingChange={setIsLoading}
                onSuccess={() => onOpenChange(false)}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
