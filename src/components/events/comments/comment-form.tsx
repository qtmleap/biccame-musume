import { zodResolver } from '@hookform/resolvers/zod'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { client } from '@/utils/client'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA'

const FormSchema = z.object({
  nickname: z.string().min(1, 'ニックネームは必須です').max(20, 'ニックネームは 20 文字以内で入力してください'),
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

export const CommentForm = ({ eventUuid, onSuccess }: CommentFormProps) => {
  const queryClient = useQueryClient()
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<{ status: number; message: string } | null>(null)
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined)

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { nickname: '', body: '' },
    mode: 'onBlur'
  })

  const bodyValue = form.watch('body')

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!turnstileToken) {
        throw new Error('Turnstile token is missing')
      }
      return client.createEventComment(
        { nickname: values.nickname, body: values.body, turnstileToken },
        { params: { uuid: eventUuid } }
      )
    },
    onSuccess: () => {
      form.reset()
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
  const canSubmit = !isPending && !!turnstileToken

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
            name='nickname'
            render={({ field }) => (
              <FormItem>
                <FormLabel>ニックネーム</FormLabel>
                <FormControl>
                  <Input placeholder='たろう' maxLength={20} {...field} />
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
