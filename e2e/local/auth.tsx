import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@/components/auth/auth-provider'
import { useAuth } from '@/hooks/use-auth'

function App() {
  const { loginWithEmail, logout, isAuthenticated, user } = useAuth()
  return (
    <>
      <h1>ローカル認証検証</h1>
      <p data-testid='session'>{isAuthenticated ? 'ready' : 'idle'}</p>
      <p data-testid='user'>{user?.uid ?? 'anonymous'}</p>
      <button type='button' onClick={() => loginWithEmail('fixture@example.test', 'synthetic-password')}>
        ログイン
      </button>
      <button type='button' onClick={() => logout()}>
        ログアウト
      </button>
    </>
  )
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing auth root')
createRoot(root).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </QueryClientProvider>
)
