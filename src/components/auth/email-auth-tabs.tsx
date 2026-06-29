import { Mail } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/use-auth'
import { AUTH_LABELS } from '@/locales/app.content'

type EmailAuthTabsProps = {
  isLoading: boolean
  onLoadingChange: (loading: boolean) => void
  onSuccess: () => void
}

/**
 * メール/パスワード認証 (ログイン + 新規登録) のタブ UI。
 * 開発環境でのみ表示される (LoginDialog 側で `import.meta.env.DEV` ガード)。
 */
export const EmailAuthTabs = ({ isLoading, onLoadingChange, onSuccess }: EmailAuthTabsProps) => {
  const { loginWithEmail, registerWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  const resetFields = () => {
    setEmail('')
    setPassword('')
    setDisplayName('')
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    onLoadingChange(true)
    try {
      await loginWithEmail(email, password)
      toast.success(AUTH_LABELS.loginSuccess)
      onSuccess()
      resetFields()
    } catch (error) {
      console.error('Login error:', error)
      toast.error(AUTH_LABELS.loginError)
      onLoadingChange(false)
    }
  }

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    onLoadingChange(true)
    try {
      await registerWithEmail(email, password, displayName)
      toast.success(AUTH_LABELS.signupSuccess)
      onSuccess()
      resetFields()
    } catch (error) {
      console.error('Registration error:', error)
      toast.error(AUTH_LABELS.signupError)
      onLoadingChange(false)
    }
  }

  return (
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
            className='w-full bg-brand hover:bg-brand/90 text-brand-foreground'
            disabled={isLoading}
          >
            <Mail className='mr-2 h-4 w-4' />
            {isLoading ? 'ログイン中...' : 'ログイン'}
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
            className='w-full bg-brand hover:bg-brand/90 text-brand-foreground'
            disabled={isLoading}
          >
            <Mail className='mr-2 h-4 w-4' />
            {isLoading ? '登録中...' : '新規登録'}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  )
}
