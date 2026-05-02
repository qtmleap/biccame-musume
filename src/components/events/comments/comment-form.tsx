import { zodResolver } from '@hookform/resolvers/zod'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useCharacters } from '@/hooks/use-characters'
import type { StoreData } from '@/schemas/store.dto'
import { client } from '@/utils/client'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA'

const MAX_BODY_LENGTH = 40

const FormSchema = z.object({
  characterId: z.string().min(1, 'アイコンを選択してください'),
  body: z
    .string()
    .min(1, 'コメントは必須です')
    .max(MAX_BODY_LENGTH, `コメントは ${MAX_BODY_LENGTH} 文字以内で入力してください`)
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

const pickRandom = <T,>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)]

const pickRandomDifferent = <T extends { id: string }>(arr: T[], currentId?: string): T | undefined => {
  const candidates = currentId ? arr.filter((c) => c.id !== currentId) : arr
  return pickRandom(candidates) ?? pickRandom(arr)
}

export const CommentForm = ({ eventUuid, onSuccess }: CommentFormProps) => {
  const queryClient = useQueryClient()
  const { data: allCharacters } = useCharacters()
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<{ status: number; message: string } | null>(null)
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined)

  const biccameMusumePool = allCharacters.filter((c) => c.character?.is_biccame_musume === true)

  const [character, setCharacter] = useState<StoreData | undefined>(() => pickRandom(biccameMusumePool))

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { characterId: character?.id ?? '', body: '' },
    mode: 'onChange'
  })

  const bodyValue = form.watch('body')
  const isValid = form.formState.isValid

  const rerollCharacter = () => {
    const next = pickRandomDifferent(biccameMusumePool, character?.id)
    setCharacter(next)
    form.setValue('characterId', next?.id ?? '', { shouldValidate: true })
  }

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
      const next = pickRandom(biccameMusumePool)
      setCharacter(next)
      form.reset({ characterId: next?.id ?? '', body: '' })
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
          setGlobalError({ status: 400, message: 'Turnstile 検証に失敗しました' })
        } else {
          setGlobalError({ status: 400, message: '不適切な内容と判定されました' })
        }
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
  const canSubmit = !isPending && !!turnstileToken && isValid

  return (
    <div className='space-y-3'>
      {globalError && (
        <Alert variant='destructive' role='alert'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>{globalError.message}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className='flex items-start gap-3'>
            <button
              type='button'
              onClick={rerollCharacter}
              aria-label='アイコンを引き直す'
              title='タップで別のキャラに変える'
              className='shrink-0 rounded-full hover:opacity-80 transition-opacity'
            >
              <Avatar className='size-14 overflow-hidden border-2 border-[#e50012]'>
                <AvatarImage
                  src={character?.character?.image_url}
                  alt=''
                  className='object-cover scale-[1.8] translate-y-[18%] mix-blend-multiply'
                />
                <AvatarFallback>{character?.character?.name?.[0] ?? '?'}</AvatarFallback>
              </Avatar>
            </button>

            <FormField
              control={form.control}
              name='body'
              render={({ field }) => (
                <FormItem className='flex-1 min-w-0'>
                  <FormControl>
                    <Input
                      type='text'
                      placeholder='このイベントについてコメントを書こう'
                      maxLength={MAX_BODY_LENGTH}
                      autoComplete='off'
                      className='border-0 shadow-none focus-visible:ring-0 px-0 text-base md:text-base h-14 placeholder:text-muted-foreground'
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <Turnstile
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            options={{ appearance: 'interaction-only', size: 'invisible' }}
            onSuccess={(token) => setTurnstileToken(token)}
            onError={() => setTurnstileToken(null)}
            onExpire={() => setTurnstileToken(null)}
          />

          <p className='text-xs text-muted-foreground pt-3'>
            投稿後の編集・削除はできません。アイコンをタップで別のキャラに変えられます。
          </p>

          <div className='flex items-center justify-end gap-3 pt-3 border-t border-border'>
            {bodyValue.length > 0 && (
              <span
                className={`text-xs tabular-nums ${
                  bodyValue.length >= MAX_BODY_LENGTH
                    ? 'text-[#e50012] font-semibold'
                    : bodyValue.length >= MAX_BODY_LENGTH - 5
                      ? 'text-amber-600'
                      : 'text-muted-foreground'
                }`}
              >
                {MAX_BODY_LENGTH - bodyValue.length}
              </span>
            )}
            <Button
              type='submit'
              disabled={!canSubmit}
              aria-label='コメントを投稿する'
              size='sm'
              className='bg-[#e50012] hover:bg-[#c5000f] text-white rounded-full px-6 font-bold'
            >
              {isPending ? '送信中...' : '投稿'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
