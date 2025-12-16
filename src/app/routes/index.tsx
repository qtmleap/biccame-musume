import { createFileRoute } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import { CharacterListCard } from '@/components/character-list-card'
import { Input } from '@/components/ui/input'
import { type Character, CharactersSchema } from '@/schemas/character.dto'

/**
 * ビッカメ娘一覧ページ
 */
const RouteComponent = () => {
  const [characters, setCharacters] = useState<Character[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        const response = await fetch('/characters.json')
        if (!response.ok) {
          throw new Error('Failed to fetch characters')
        }
        const data = await response.json()
        const result = CharactersSchema.safeParse(data)

        if (!result.success) {
          console.error('Validation error:', result.error)
          throw new Error('Invalid characters data format')
        }

        setCharacters(result.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchCharacters()
  }, [])

  const filteredCharacters = characters.filter((character) => {
    const query = searchQuery.toLowerCase()
    return (
      character.character_name.toLowerCase().includes(query) ||
      character.store_name.toLowerCase().includes(query) ||
      character.description.toLowerCase().includes(query) ||
      character.address?.toLowerCase().includes(query) ||
      false
    )
  })

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4'></div>
          <p className='text-muted-foreground'>読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <p className='text-destructive mb-2'>エラーが発生しました</p>
          <p className='text-sm text-muted-foreground'>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-linear-to-b from-background to-muted/20'>
      <div className='container mx-auto px-4 py-8'>
        <header className='mb-8 text-center'>
          <h1 className='text-4xl font-bold mb-2 bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent'>
            ビッカメ娘
          </h1>
          <p className='text-muted-foreground'>ビックカメラの店舗擬人化キャラクター一覧</p>
          <p className='text-sm text-muted-foreground mt-1'>全{characters.length}キャラクター</p>
        </header>

        <div className='max-w-md mx-auto mb-8'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              type='text'
              placeholder='キャラクター名、店舗名、説明文で検索...'
              value={searchQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className='pl-10'
            />
          </div>
          {searchQuery && (
            <p className='text-sm text-muted-foreground mt-2 text-center'>{filteredCharacters.length}件の結果</p>
          )}
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
          {filteredCharacters.map((character) => (
            <CharacterListCard key={character.key} character={character} />
          ))}
        </div>

        {filteredCharacters.length === 0 && searchQuery && (
          <div className='text-center py-12'>
            <p className='text-muted-foreground'>検索条件に一致するキャラクターが見つかりませんでした</p>
          </div>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: RouteComponent
})
