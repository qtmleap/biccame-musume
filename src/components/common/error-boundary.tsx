import { AlertCircle, RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
}

/**
 * エラーバウンダリコンポーネント
 * 子コンポーネントでエラーが発生した場合にフォールバックUIを表示
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className='flex flex-col items-center justify-center min-h-100 px-4'>
          <div className='text-center max-w-md'>
            <AlertCircle className='h-16 w-16 text-red-500 mx-auto mb-4' />
            <h2 className='text-2xl font-bold text-gray-900 mb-2'>エラーが発生しました</h2>
            <p className='text-gray-600 mb-6'>予期しないエラーが発生しました。ページを再読み込みしてください。</p>
            {this.state.error && (
              <details className='text-left mb-6 p-4 bg-gray-50 rounded-lg'>
                <summary className='cursor-pointer text-sm font-medium text-gray-700 mb-2'>エラー詳細</summary>
                <pre className='text-xs text-gray-600 overflow-auto'>{this.state.error.message}</pre>
              </details>
            )}
            <Button onClick={() => window.location.reload()} className='bg-pink-600 hover:bg-pink-700'>
              <RefreshCw className='h-4 w-4 mr-2' />
              ページを再読み込み
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
