import { useState } from 'react'

// Local preview state only: never import the application API client.
export const useVote = (_characterId: string) => {
  const [isSuccess, setSuccess] = useState(false)
  return {
    mutate: () => setSuccess(true),
    isPending: false,
    isSuccess,
    data: isSuccess ? { message: 'モックの応援を記録しました（サーバー送信なし）' } : undefined,
    error: null
  }
}
