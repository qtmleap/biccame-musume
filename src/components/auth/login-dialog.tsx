import { Mail } from 'lucide-react'
import { useState } from 'react'
import { FaApple, FaGithub, FaGoogle, FaXTwitter } from 'react-icons/fa6'
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

  // biome-ignore lint/suspicious/noExplicitAny: reason
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
          <DialogTitle className='flex items-center gap-2'>{AUTH_LABELS.login}</DialogTitle>
          <DialogDescription>{AUTH_LABELS.loginMessage}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {/* ソーシャルログインボタン */}
          <div className='grid grid-cols-2 gap-3'>
            <Button type='button' variant='outline' className='w-full' onClick={handleGoogleLogin} disabled={isLoading}>
              <FaGoogle className='mr-2 h-4 w-4' />
              Google
            </Button>

            <Button type='button' variant='outline' className='w-full' onClick={handleAppleLogin} disabled={isLoading}>
              <FaApple className='mr-2 h-4 w-4' />
              Apple
            </Button>

            <Button type='button' variant='outline' className='w-full' onClick={handleGithubLogin} disabled={isLoading}>
              <FaGithub className='mr-2 h-4 w-4' />
              GitHub
            </Button>

            <Button
              type='button'
              variant='outline'
              className='w-full'
              onClick={handleTwitterLogin}
              disabled={isLoading}
            >
              <FaXTwitter className='mr-2 h-4 w-4' />X
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
