import { zodResolver } from '@hookform/resolvers/zod'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { useCharacters } from '@/hooks/use-characters'
import type { StoreData } from '@/schemas/store.dto'
import { client } from '@/utils/client'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA'

const PICK_COUNT = 5

const FormSchema = z.object({
  characterId: z.string().min(1, 'アイコンを選択してください'),
  body: z.string().min(1, 'コメントは必須です').max(200, 'コメントは 200 文字以内で入力してください')
})

type FormValues = z.infer<typeof FormSchema>

type CommentFormProps = {
  eventUuid: string
  onSuccess?: () => void
}

type PostError = {
  status?: number
  message?: string
}

const sampleN = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr]
  const out: T[] = []
  const target = Math.min(n, copy.length)
  for (let i = 0; i < target; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    const picked = copy.splice(idx, 1)[0]
    if (picked !== undefined) out.push(picked)
  }
  return out
}

export const CommentForm = ({ eventUuid, onSuccess }: CommentFormProps) => {
  const queryClient = useQueryClient()
  const { data: allCharacters } = useCharacters()
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<{ status: number; message: string } | null>(null)
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined)

  const biccameMusumePool = allCharacters.filter((c) => c.character?.is_biccame_musume === true)

  const [candidates, setCandidates] = useState<StoreData[]>(() => sampleN(biccameMusumePool, PICK_COUNT))

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { characterId: '', body: '' },
    mode: 'onBlur'
  })

  const bodyValue = form.watch('body')
  const selectedCharacterId = form.watch('characterId')

  const reroll = useCallback(() => {
    const next = sampleN(biccameMusumePool, PICK_COUNT)
    setCandidates(next)
    form.setValue('characterId', '')
  }, [biccameMusumePool, form])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!turnstileToken) {
        throw new Error('Turnstile token is missing')
      }
      return client.createEventComment(
        { characterId: values.characterId, body: values.body, turnstileToken },
        { params: { uuid: eventUuid } }
      )
    },
    onSuccess: () => {
      form.reset({ characterId: '', body: '' })
      setCandidates(sampleN(biccameMusumePool, PICK_COUNT))
      setGlobalError(null)
      setTurnstileToken(null)
      turnstileRef.current?.reset()
      queryClient.invalidateQueries({ queryKey: ['events', eventUuid, 'comments'] })
      onSuccess?.()
    },
    onError: (error: PostError) => {
      turnstileRef.current?.reset()
      setTurnstileToken(null)

      const status = error?.status ?? 0
      if (status === 400) {
        const msg = error?.message ?? ''
        if (msg.toLowerCase().includes('turnstile')) {
          form.setError('body', { message: 'Turnstile 検証に失敗しました' })
        } else {
          form.setError('body', { message: '不適切な内容と判定されました' })
        }
        setGlobalError(null)
      } else if (status === 429) {
        setGlobalError({ status: 429, message: '送信が多すぎます。しばらくしてからお試しください' })
      } else {
        setGlobalError({ status, message: 'コメントの送信に失敗しました。もう一度お試しください' })
      }
    }
  })

  const onSubmit = (values: FormValues) => {
    setGlobalError(null)
    mutation.mutate(values)
  }

  const isPending = mutation.isPending
  const canSubmit = !isPending && !!turnstileToken && !!selectedCharacterId

  return (
    <div className='space-y-4'>
      {globalError && (
        <Alert variant='destructive' role='alert'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>{globalError.message}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
          <FormField
            control={form.control}
            name='characterId'
            render={({ field }) => (
              <FormItem>
                <div className='flex items-center justify-between'>
                  <FormLabel>アイコンを選ぶ</FormLabel>
                  <button
                    type='button'
                    onClick={reroll}
                    className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
                  >
                    <RefreshCw className='size-3' />
                    引き直す
                  </button>
                </div>
                <FormControl>
                  <div className='flex justify-between gap-2'>
                    {candidates.map((character) => {
                      const isSelected = field.value === character.id
                      return (
                        <button
                          key={character.id}
                          type='button'
                          onClick={() => field.onChange(character.id)}
                          aria-label={character.character?.name}
                          aria-pressed={isSelected}
                          className={`shrink-0 rounded-full transition-all ${
                            isSelected
                              ? 'ring-2 ring-[#e50012] ring-offset-2 scale-110'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                        >
                          <Avatar className='size-12 overflow-hidden'>
                            <AvatarImage
                              src={character.character?.image_url}
                              alt=''
                              className='object-cover object-top scale-[1.8] mix-blend-multiply'
                            />
                            <AvatarFallback>{character.character?.name?.[0] ?? '?'}</AvatarFallback>
                          </Avatar>
                        </button>
                      )
                    })}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='body'
            render={({ field }) => (
              <FormItem>
                <div className='flex items-center justify-between'>
                  <FormLabel>コメント</FormLabel>
                  <span className='text-xs text-muted-foreground'>{bodyValue.length} / 200</span>
                </div>
                <FormControl>
                  <Textarea placeholder='コメントを入力してください' maxLength={200} rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Turnstile
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            options={{ appearance: 'interaction-only', size: 'invisible' }}
            onSuccess={(token) => setTurnstileToken(token)}
            onError={() => setTurnstileToken(null)}
            onExpire={() => setTurnstileToken(null)}
          />

          <p className='text-xs text-muted-foreground'>投稿後は削除できません。送信前に内容を確認してください。</p>

          <Button
            type='submit'
            disabled={!canSubmit}
            aria-label='コメントを投稿する'
            className='w-full bg-[#e50012] hover:bg-[#c5000f] text-white'
          >
            {isPending ? '送信中...' : 'コメントを投稿する'}
          </Button>
        </form>
      </Form>
    </div>
  )
}
