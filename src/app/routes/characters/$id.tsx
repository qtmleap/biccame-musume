import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CharacterCard } from '@/components/character-card'
import { type Character, CharactersSchema } from '@/schemas/character.dto'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

const RouteComponent = () => {
  const { id } = Route.useParams()
  const [character, setCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCharacter = async () => {
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

        const found = result.data.find((c) => c.key === id)
        if (!found) {
          throw new Error('Character not found')
        }

        setCharacter(found)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchCharacter()
  }, [id])

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

  if (error || !character) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <p className='text-destructive mb-4'>
            {error || 'キャラクターが見つかりませんでした'}
          </p>
          <Link to='/'>
            <Button variant='outline'>
              <ArrowLeft className='h-4 w-4 mr-2' />
              一覧に戻る
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-linear-to-b from-background to-muted/20'>
      <div className='container mx-auto px-4 py-8'>
        <div className='mb-6'>
          <Link to='/'>
            <Button variant='ghost' size='sm'>
              <ArrowLeft className='h-4 w-4 mr-2' />
              一覧に戻る
            </Button>
          </Link>
        </div>

        <div className='max-w-2xl mx-auto'>
          <CharacterCard character={character} />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/characters/$id')({
  component: RouteComponent
})
