import { FaApple, FaGithub, FaGoogle, FaXTwitter } from 'react-icons/fa6'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

type SocialLoginButtonsProps = {
  isLoading: boolean
  onLoadingChange: (loading: boolean) => void
}

/**
 * ソーシャル認証 (Google / Apple / GitHub / X) のボタングリッド。
 * リダイレクト方式のため、 ボタンを押すとページ遷移する (トースト等は AuthProvider 側)。
 */
export const SocialLoginButtons = ({ isLoading, onLoadingChange }: SocialLoginButtonsProps) => {
  const { loginWithTwitter, loginWithGoogle, loginWithGithub, loginWithApple } = useAuth()

  const handleSocialLogin = async (loginFn: () => Promise<void>) => {
    onLoadingChange(true)
    await loginFn()
  }

  return (
    <div className='grid grid-cols-2 gap-3'>
      <Button
        type='button'
        variant='outline'
        className='w-full border-card'
        onClick={() => handleSocialLogin(loginWithGoogle)}
        disabled={isLoading}
      >
        <FaGoogle className='mr-2 h-4 w-4' />
        Google
      </Button>

      <Button
        type='button'
        variant='outline'
        className='w-full border-card'
        onClick={() => handleSocialLogin(loginWithApple)}
        disabled={isLoading}
      >
        <FaApple className='mr-2 h-4 w-4' />
        Apple
      </Button>

      <Button
        type='button'
        variant='outline'
        className='w-full border-card'
        onClick={() => handleSocialLogin(loginWithGithub)}
        disabled={isLoading}
      >
        <FaGithub className='mr-2 h-4 w-4' />
        GitHub
      </Button>

      <Button
        type='button'
        variant='outline'
        className='w-full border-card'
        onClick={() => handleSocialLogin(loginWithTwitter)}
        disabled={isLoading}
      >
        <FaXTwitter className='mr-2 h-4 w-4' />X
      </Button>
    </div>
  )
}
