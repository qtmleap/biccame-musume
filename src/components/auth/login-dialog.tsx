import { Apple, Github, LogIn, Mail } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/use-auth'
import { AUTH_LABELS } from '@/locales/app.content'

type LoginDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * ログインダイアログ
 * Google、Apple、GitHub、Twitter、メール/パスワード認証をサポート
 */
export const LoginDialog = ({ open, onOpenChange }: LoginDialogProps) => {
  const { loginWithTwitter, loginWithGoogle, loginWithGithub, loginWithApple, loginWithEmail, registerWithEmail } =
    useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  /**
   * ソーシャルログインの共通ハンドラー
   */
  const handleSocialLogin = async (loginFn: () => Promise<any>) => {
    setIsLoading(true)
    try {
      const result = await loginFn()
      if (result) {
        toast.success(AUTH_LABELS.loginSuccess)
        onOpenChange(false)
      }
    } catch (error) {
      const errorMessage = (error as Error).message
      toast.error(errorMessage || AUTH_LABELS.loginError)
      setIsLoading(false)
    }
  }

  /**
   * Twitter認証
   */
  const handleTwitterLogin = () => handleSocialLogin(loginWithTwitter)

  /**
   * Google認証
   */
  const handleGoogleLogin = () => handleSocialLogin(loginWithGoogle)

  /**
   * GitHub認証
   */
  const handleGithubLogin = () => handleSocialLogin(loginWithGithub)

  /**
   * Apple認証
   */
  const handleAppleLogin = () => handleSocialLogin(loginWithApple)

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
          <DialogDescription>{AUTH_LABELS.loginMessage}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {/* ソーシャルログインボタン */}
          <div className='grid grid-cols-2 gap-3'>
            <Button type='button' variant='outline' className='w-full' onClick={handleGoogleLogin} disabled={isLoading}>
              <svg className='mr-2 h-4 w-4' viewBox='0 0 24 24'>
                <path
                  fill='currentColor'
                  d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
                />
                <path
                  fill='currentColor'
                  d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
                />
                <path
                  fill='currentColor'
                  d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
                />
                <path
                  fill='currentColor'
                  d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
                />
              </svg>
              Google
            </Button>

            <Button type='button' variant='outline' className='w-full' onClick={handleAppleLogin} disabled={isLoading}>
              <Apple className='mr-2 h-4 w-4' />
              Apple
            </Button>

            <Button type='button' variant='outline' className='w-full' onClick={handleGithubLogin} disabled={isLoading}>
              <Github className='mr-2 h-4 w-4' />
              GitHub
            </Button>

            <Button
              type='button'
              variant='outline'
              className='w-full'
              onClick={handleTwitterLogin}
              disabled={isLoading}
            >
              <svg className='mr-2 h-4 w-4' viewBox='0 0 24 24' fill='currentColor'>
                <path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
              </svg>
              X
            </Button>
          </div>

          {/* メール/パスワード認証（開発環境のみ） */}
          {import.meta.env.DEV && (
            <>
              <div className='relative'>
                <div className='absolute inset-0 flex items-center'>
                  <Separator />
                </div>
                <div className='relative flex justify-center text-xs uppercase'>
                  <span className='bg-background px-2 text-muted-foreground'>または</span>
                </div>
              </div>

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
                    <Button
                      type='submit'
                      className='w-full bg-pink-500 hover:bg-pink-600 text-white'
                      disabled={isLoading}
                    >
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
                    <Button
                      type='submit'
                      className='w-full bg-pink-500 hover:bg-pink-600 text-white'
                      disabled={isLoading}
                    >
                      <Mail className='mr-2 h-4 w-4' />
                      新規登録
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
