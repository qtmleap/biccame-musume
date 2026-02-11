import { LogIn, Mail, Twitter } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/useAuth'
import { AUTH_LABELS } from '@/locales/app.content'

type LoginDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * ログインダイアログ
 * Twitter認証とメール/パスワード認証をサポート
 */
export const LoginDialog = ({ open, onOpenChange }: LoginDialogProps) => {
  const { loginWithTwitter, loginWithEmail, registerWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const isEmulator = import.meta.env.DEV

  /**
   * Twitter認証
   */
  const handleTwitterLogin = async () => {
    setIsLoading(true)
    try {
      const result = await loginWithTwitter()
      if (result) {
        toast.success(AUTH_LABELS.loginSuccess)
        onOpenChange(false)
      }
    } catch (error) {
      const errorMessage = (error as Error).message
      toast.error(errorMessage || AUTH_LABELS.loginError)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * メール/パスワードログイン
   */
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await loginWithEmail(email, password)
      toast.success(AUTH_LABELS.loginSuccess)
      onOpenChange(false)
      setEmail('')
      setPassword('')
    } catch (error) {
      console.error('Login error:', error)
      toast.error(AUTH_LABELS.loginError)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * メール/パスワード新規登録
   */
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await registerWithEmail(email, password, displayName)
      toast.success(AUTH_LABELS.signupSuccess)
      onOpenChange(false)
      setEmail('')
      setPassword('')
      setDisplayName('')
    } catch (error) {
      console.error('Registration error:', error)
      toast.error(AUTH_LABELS.signupError)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <LogIn className='w-5 h-5' />
            ログイン
          </DialogTitle>
          <DialogDescription>{isEmulator ? AUTH_LABELS.emulatorMessage : AUTH_LABELS.loginMessage}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {/* Twitter認証（本番環境のみ） */}
          {!isEmulator && (
            <>
              <Button
                type='button'
                variant='outline'
                className='w-full'
                onClick={handleTwitterLogin}
                disabled={isLoading}
              >
                <Twitter className='mr-2 h-4 w-4' />
                Twitterでログイン
              </Button>
              <div className='relative'>
                <div className='absolute inset-0 flex items-center'>
                  <Separator />
                </div>
                <div className='relative flex justify-center text-xs uppercase'>
                  <span className='bg-background px-2 text-muted-foreground'>または</span>
                </div>
              </div>
            </>
          )}

          {/* メール/パスワード認証 */}
          <Tabs defaultValue='login' className='w-full'>
            <TabsList className='grid w-full grid-cols-2'>
              <TabsTrigger value='login'>ログイン</TabsTrigger>
              <TabsTrigger value='register'>新規登録</TabsTrigger>
            </TabsList>

            <TabsContent value='login'>
              <form onSubmit={handleEmailLogin} className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='login-email'>メールアドレス</Label>
                  <Input
                    id='login-email'
                    type='email'
                    placeholder='example@email.com'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='login-password'>パスワード</Label>
                  <Input
                    id='login-password'
                    type='password'
                    placeholder={AUTH_LABELS.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type='submit' className='w-full bg-pink-500 hover:bg-pink-600 text-white' disabled={isLoading}>
                  <Mail className='mr-2 h-4 w-4' />
                  ログイン
                </Button>
              </form>
            </TabsContent>

            <TabsContent value='register'>
              <form onSubmit={handleEmailRegister} className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='register-name'>表示名</Label>
                  <Input
                    id='register-name'
                    type='text'
                    placeholder={AUTH_LABELS.displayNamePlaceholder}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='register-email'>メールアドレス</Label>
                  <Input
                    id='register-email'
                    type='email'
                    placeholder='example@email.com'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='register-password'>パスワード</Label>
                  <Input
                    id='register-password'
                    type='password'
                    placeholder='パスワード（6文字以上）'
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={isLoading}
                  />
                </div>
                <Button type='submit' className='w-full bg-pink-500 hover:bg-pink-600 text-white' disabled={isLoading}>
                  <Mail className='mr-2 h-4 w-4' />
                  新規登録
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
