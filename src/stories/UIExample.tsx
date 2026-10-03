import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import * as Accordion from '@/components/ui/accordion'
import * as Alert from '@/components/ui/alert'
import * as AlertDialog from '@/components/ui/alert-dialog'
import * as Avatar from '@/components/ui/avatar'
import * as Badge from '@/components/ui/badge'
import * as Breadcrumb from '@/components/ui/breadcrumb'
import * as Button from '@/components/ui/button'
import * as Carousel from '@/components/ui/carousel'
import * as Checkbox from '@/components/ui/checkbox'
import * as Command from '@/components/ui/command'
import * as Dialog from '@/components/ui/dialog'
import * as Drawer from '@/components/ui/drawer'
import * as Form from '@/components/ui/form'
import * as Input from '@/components/ui/input'
import * as Label from '@/components/ui/label'
import * as Pagination from '@/components/ui/pagination'
import * as Popover from '@/components/ui/popover'
import * as Progress from '@/components/ui/progress'
import * as Select from '@/components/ui/select'
import * as Separator from '@/components/ui/separator'
import * as Sheet from '@/components/ui/sheet'
import * as Skeleton from '@/components/ui/skeleton'
import * as Sonner from '@/components/ui/sonner'
import * as Tabs from '@/components/ui/tabs'
import * as Textarea from '@/components/ui/textarea'
import * as Toggle from '@/components/ui/toggle'
import * as Tooltip from '@/components/ui/tooltip'
import { character } from './fixtures'
export const UIExample = ({ family, disabled = false }: { family: string; disabled?: boolean }) => {
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState('abeno')
  const [progress, setProgress] = useState(45)
  const [page, setPage] = useState(1)
  const form = useForm({ defaultValues: { name: '' } })
  const action = () => setMessage('操作を確認しました')
  useEffect(() => {
    if (family === 'sonner') toast.success('Storybookの通知', { id: 'catalogue-toast' })
    return () => {
      toast.dismiss('catalogue-toast')
    }
  }, [family])
  const content = (() => {
    switch (family) {
      case 'accordion':
        return (
          <Accordion.Accordion type='single' collapsible defaultValue='store'>
            <Accordion.AccordionItem value='store'>
              <Accordion.AccordionTrigger>店舗情報</Accordion.AccordionTrigger>
              <Accordion.AccordionContent>
                あべのキューズモール店の営業時間は10:00〜21:00です。
              </Accordion.AccordionContent>
            </Accordion.AccordionItem>
            <Accordion.AccordionItem value='access'>
              <Accordion.AccordionTrigger>アクセス</Accordion.AccordionTrigger>
              <Accordion.AccordionContent>天王寺駅から徒歩3分</Accordion.AccordionContent>
            </Accordion.AccordionItem>
          </Accordion.Accordion>
        )
      case 'alert':
        return (
          <Alert.Alert>
            <Alert.AlertTitle>参照情報の確認</Alert.AlertTitle>
            <Alert.AlertDescription>イベント情報は公式の告知もご確認ください。</Alert.AlertDescription>
          </Alert.Alert>
        )
      case 'alert-dialog':
        return (
          <AlertDialog.AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialog.AlertDialogTrigger asChild>
              <Button.Button>削除を確認</Button.Button>
            </AlertDialog.AlertDialogTrigger>
            <AlertDialog.AlertDialogContent>
              <AlertDialog.AlertDialogHeader>
                <AlertDialog.AlertDialogTitle>表示データを削除しますか？</AlertDialog.AlertDialogTitle>
                <AlertDialog.AlertDialogDescription>
                  Storybook内の表示用確認です。実データは削除しません。
                </AlertDialog.AlertDialogDescription>
                <AlertDialog.AlertDialogMedia>
                  <span aria-hidden>!</span>
                </AlertDialog.AlertDialogMedia>
              </AlertDialog.AlertDialogHeader>
              <AlertDialog.AlertDialogFooter>
                <AlertDialog.AlertDialogCancel>キャンセル</AlertDialog.AlertDialogCancel>
                <AlertDialog.AlertDialogAction onClick={action}>確認</AlertDialog.AlertDialogAction>
              </AlertDialog.AlertDialogFooter>
            </AlertDialog.AlertDialogContent>
          </AlertDialog.AlertDialog>
        )
      case 'avatar':
        return (
          <Avatar.AvatarGroup>
            <Avatar.Avatar>
              <Avatar.AvatarImage src={character.character.image_url} alt='あべのたん' />
              <Avatar.AvatarFallback>あ</Avatar.AvatarFallback>
              <Avatar.AvatarBadge>✓</Avatar.AvatarBadge>
            </Avatar.Avatar>
            <Avatar.Avatar>
              <Avatar.AvatarFallback>京</Avatar.AvatarFallback>
            </Avatar.Avatar>
            <Avatar.AvatarGroupCount>+3</Avatar.AvatarGroupCount>
          </Avatar.AvatarGroup>
        )
      case 'badge':
        return (
          <div className='flex gap-3 flex-wrap'>
            <Badge.Badge>開催中</Badge.Badge>
            <Badge.Badge variant='secondary'>予告</Badge.Badge>
            <Badge.Badge variant='outline'>参考情報</Badge.Badge>
            <Badge.Badge variant='destructive'>終了</Badge.Badge>
          </div>
        )
      case 'breadcrumb':
        return (
          <Breadcrumb.Breadcrumb>
            <Breadcrumb.BreadcrumbList>
              <Breadcrumb.BreadcrumbItem>
                <Breadcrumb.BreadcrumbLink href='#home'>ホーム</Breadcrumb.BreadcrumbLink>
              </Breadcrumb.BreadcrumbItem>
              <Breadcrumb.BreadcrumbSeparator />
              <Breadcrumb.BreadcrumbItem>
                <Breadcrumb.BreadcrumbEllipsis />
              </Breadcrumb.BreadcrumbItem>
              <Breadcrumb.BreadcrumbSeparator />
              <Breadcrumb.BreadcrumbItem>
                <Breadcrumb.BreadcrumbPage>キャラクター詳細</Breadcrumb.BreadcrumbPage>
              </Breadcrumb.BreadcrumbItem>
            </Breadcrumb.BreadcrumbList>
          </Breadcrumb.Breadcrumb>
        )
      case 'button':
        return (
          <div className='flex gap-3 flex-wrap'>
            {(['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const).map((variant) => (
              <Button.Button key={variant} variant={variant} disabled={disabled} onClick={action}>
                {variant}
              </Button.Button>
            ))}
          </div>
        )
      case 'carousel':
        return (
          <Carousel.Carousel className='mx-auto max-w-xs'>
            <Carousel.CarouselContent>
              {['あべのたん', 'きょうとたん', 'たかつきたん'].map((name) => (
                <Carousel.CarouselItem key={name}>
                  <div className='bg-card border rounded-xl p-12 text-center'>{name}</div>
                </Carousel.CarouselItem>
              ))}
            </Carousel.CarouselContent>
            <Carousel.CarouselPrevious />
            <Carousel.CarouselNext />
          </Carousel.Carousel>
        )
      case 'checkbox':
        return (
          <div className='flex items-center gap-3'>
            <Checkbox.Checkbox id='checked' defaultChecked disabled={disabled} />
            <Label.Label htmlFor='checked'>開催中のイベントを表示</Label.Label>
          </div>
        )
      case 'command':
        return (
          <Command.CommandDialog open={open} onOpenChange={setOpen}>
            <Command.CommandInput placeholder='店舗を検索' />
            <Command.CommandList>
              <Command.CommandEmpty>一致する店舗がありません</Command.CommandEmpty>
              <Command.CommandGroup heading='関西'>
                <Command.CommandItem onSelect={action}>
                  あべの店<Command.CommandShortcut>⌘A</Command.CommandShortcut>
                </Command.CommandItem>
                <Command.CommandItem onSelect={action}>京都店</Command.CommandItem>
              </Command.CommandGroup>
              <Command.CommandSeparator />
              <Command.CommandGroup heading='その他'>
                <Command.CommandItem onSelect={action}>全国の店舗</Command.CommandItem>
              </Command.CommandGroup>
            </Command.CommandList>
          </Command.CommandDialog>
        )
      case 'dialog':
        return (
          <Dialog.Dialog open={open} onOpenChange={setOpen}>
            <Dialog.DialogTrigger asChild>
              <Button.Button>詳細を開く</Button.Button>
            </Dialog.DialogTrigger>
            <Dialog.DialogContent>
              <Dialog.DialogHeader>
                <Dialog.DialogTitle>キャラクター詳細</Dialog.DialogTitle>
                <Dialog.DialogDescription>店舗とキャラクターの表示用ダイアログ</Dialog.DialogDescription>
              </Dialog.DialogHeader>
              <p>あべのたん / あべのキューズモール店</p>
              <Dialog.DialogFooter>
                <Dialog.DialogClose asChild>
                  <Button.Button>閉じる</Button.Button>
                </Dialog.DialogClose>
              </Dialog.DialogFooter>
            </Dialog.DialogContent>
          </Dialog.Dialog>
        )
      case 'drawer':
        return (
          <Drawer.Drawer open={open} onOpenChange={setOpen}>
            <Drawer.DrawerTrigger asChild>
              <Button.Button>記念日を開く</Button.Button>
            </Drawer.DrawerTrigger>
            <Drawer.DrawerContent>
              <Drawer.DrawerHeader>
                <Drawer.DrawerTitle>10月2日の記念日</Drawer.DrawerTitle>
                <Drawer.DrawerDescription>店舗の記念日を確認できます。</Drawer.DrawerDescription>
              </Drawer.DrawerHeader>
              <p className='p-4'>きょうとたんのお誕生日</p>
              <Drawer.DrawerFooter>
                <Drawer.DrawerClose asChild>
                  <Button.Button>閉じる</Button.Button>
                </Drawer.DrawerClose>
              </Drawer.DrawerFooter>
            </Drawer.DrawerContent>
          </Drawer.Drawer>
        )
      case 'form':
        return (
          <Form.Form {...form}>
            <form onSubmit={form.handleSubmit(action)}>
              <Form.FormField
                control={form.control}
                name='name'
                rules={{ required: '名前を入力してください' }}
                render={({ field }) => (
                  <Form.FormItem>
                    <Form.FormLabel>名前</Form.FormLabel>
                    <Form.FormControl>
                      <Input.Input {...field} disabled={disabled} />
                    </Form.FormControl>
                    <Form.FormDescription>表示名を入力してください。</Form.FormDescription>
                    <Form.FormMessage />
                  </Form.FormItem>
                )}
              />
              <Button.Button type='submit' className='mt-4'>
                確認
              </Button.Button>
            </form>
          </Form.Form>
        )
      case 'input':
        return (
          <div>
            <Label.Label htmlFor='search'>キャラクター検索</Label.Label>
            <Input.Input
              id='search'
              placeholder='名前を入力'
              disabled={disabled}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        )
      case 'label':
        return (
          <div>
            <Label.Label htmlFor='label-input'>店舗名</Label.Label>
            <Input.Input id='label-input' defaultValue='あべの店' />
          </div>
        )
      case 'pagination':
        return (
          <Pagination.Pagination>
            <Pagination.PaginationContent>
              <Pagination.PaginationItem>
                <Pagination.PaginationPrevious
                  href='#previous'
                  onClick={(e) => {
                    e.preventDefault()
                    setPage((p) => Math.max(1, p - 1))
                  }}
                />
              </Pagination.PaginationItem>
              {[1, 2, 3].map((n) => (
                <Pagination.PaginationItem key={n}>
                  <Pagination.PaginationLink
                    href={`#page-${n}`}
                    isActive={page === n}
                    onClick={(e) => {
                      e.preventDefault()
                      setPage(n)
                    }}
                  >
                    {n}
                  </Pagination.PaginationLink>
                </Pagination.PaginationItem>
              ))}
              <Pagination.PaginationItem>
                <Pagination.PaginationEllipsis />
              </Pagination.PaginationItem>
              <Pagination.PaginationItem>
                <Pagination.PaginationNext
                  href='#next'
                  onClick={(e) => {
                    e.preventDefault()
                    setPage((p) => Math.min(3, p + 1))
                  }}
                />
              </Pagination.PaginationItem>
            </Pagination.PaginationContent>
          </Pagination.Pagination>
        )
      case 'popover':
        return (
          <Popover.Popover open={open} onOpenChange={setOpen}>
            <Popover.PopoverAnchor>
              <span>検索条件</span>
            </Popover.PopoverAnchor>
            <Popover.PopoverTrigger asChild>
              <Button.Button>条件を開く</Button.Button>
            </Popover.PopoverTrigger>
            <Popover.PopoverContent>
              <Popover.PopoverHeader>
                <Popover.PopoverTitle>地域で絞り込み</Popover.PopoverTitle>
                <Popover.PopoverDescription>条件はこのプレビュー内で反映されます。</Popover.PopoverDescription>
              </Popover.PopoverHeader>
              <Checkbox.Checkbox id='region' defaultChecked />
              <Label.Label htmlFor='region'>関西</Label.Label>
            </Popover.PopoverContent>
          </Popover.Popover>
        )
      case 'progress':
        return (
          <div>
            <Progress.Progress value={progress} />
            <Button.Button className='mt-4' onClick={() => setProgress((p) => Math.min(100, p + 10))}>
              進捗を増やす
            </Button.Button>
            <p>{progress}%</p>
          </div>
        )
      case 'select':
        return (
          <Select.Select value={selected} onValueChange={setSelected}>
            <Select.SelectTrigger className='w-72' disabled={disabled}>
              <Select.SelectValue placeholder='店舗を選択' />
            </Select.SelectTrigger>
            <Select.SelectContent>
              <Select.SelectGroup>
                <Select.SelectLabel>関西</Select.SelectLabel>
                <Select.SelectItem value='abeno'>あべの店</Select.SelectItem>
                <Select.SelectItem value='kyoto'>京都店</Select.SelectItem>
              </Select.SelectGroup>
              <Select.SelectSeparator />
              <Select.SelectGroup>
                <Select.SelectLabel>表示確認用の店舗</Select.SelectLabel>
                {Array.from({ length: 30 }, (_, i) => ({ id: `store-${i}`, label: `合成店舗 ${i + 1}` })).map(
                  (store) => (
                    <Select.SelectItem key={store.id} value={store.id}>
                      {store.label}
                    </Select.SelectItem>
                  )
                )}
              </Select.SelectGroup>
            </Select.SelectContent>
          </Select.Select>
        )
      case 'separator':
        return (
          <div>
            <p>店舗情報</p>
            <Separator.Separator className='my-4' />
            <div className='flex h-8 items-center gap-4'>
              <p>キャラクター</p>
              <Separator.Separator orientation='vertical' />
              <p>イベント</p>
            </div>
          </div>
        )
      case 'sheet':
        return (
          <Sheet.Sheet open={open} onOpenChange={setOpen}>
            <Sheet.SheetTrigger asChild>
              <Button.Button>条件を開く</Button.Button>
            </Sheet.SheetTrigger>
            <Sheet.SheetContent>
              <Sheet.SheetHeader>
                <Sheet.SheetTitle>イベントの検索条件</Sheet.SheetTitle>
                <Sheet.SheetDescription>地域と店舗を組み合わせて選択できます。</Sheet.SheetDescription>
              </Sheet.SheetHeader>
              <div className='p-4'>
                <Checkbox.Checkbox id='sheet-region' defaultChecked />
                <Label.Label htmlFor='sheet-region'>関西</Label.Label>
              </div>
              <Sheet.SheetFooter>
                <Sheet.SheetClose asChild>
                  <Button.Button>条件を反映</Button.Button>
                </Sheet.SheetClose>
              </Sheet.SheetFooter>
            </Sheet.SheetContent>
          </Sheet.Sheet>
        )
      case 'skeleton':
        return (
          <div role='status' aria-label='読み込み中' className='flex items-center gap-4'>
            <Skeleton.Skeleton className='size-14 rounded-full' />
            <div className='space-y-3'>
              <Skeleton.Skeleton className='h-4 w-48' />
              <Skeleton.Skeleton className='h-4 w-32' />
            </div>
          </div>
        )
      case 'sonner':
        return (
          <>
            <Button.Button onClick={() => toast.success('Storybookの通知', { id: 'catalogue-toast' })}>
              通知を表示
            </Button.Button>
            <Sonner.Toaster />
          </>
        )
      case 'tabs':
        return (
          <Tabs.Tabs defaultValue='characters'>
            <Tabs.TabsList>
              <Tabs.TabsTrigger value='characters'>キャラクター</Tabs.TabsTrigger>
              <Tabs.TabsTrigger value='events'>イベント</Tabs.TabsTrigger>
            </Tabs.TabsList>
            <Tabs.TabsContent value='characters'>あべのたん・きょうとたん</Tabs.TabsContent>
            <Tabs.TabsContent value='events'>秋のお誕生日イベント</Tabs.TabsContent>
          </Tabs.Tabs>
        )
      case 'textarea':
        return (
          <div>
            <Label.Label htmlFor='description'>イベント紹介</Label.Label>
            <Textarea.Textarea
              id='description'
              defaultValue='店舗の周年イベントを確認できます。'
              disabled={disabled}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        )
      case 'toggle':
        return (
          <Toggle.Toggle aria-label='推しを表示' disabled={disabled} onPressedChange={action}>
            推し
          </Toggle.Toggle>
        )
      case 'tooltip':
        return (
          <Tooltip.TooltipProvider>
            <Tooltip.Tooltip defaultOpen>
              <Tooltip.TooltipTrigger asChild>
                <Button.Button>応援</Button.Button>
              </Tooltip.TooltipTrigger>
              <Tooltip.TooltipContent>今日の応援を送る</Tooltip.TooltipContent>
            </Tooltip.Tooltip>
          </Tooltip.TooltipProvider>
        )
      default:
        throw new Error(`Missing UI family composition: ${family}`)
    }
  })()
  return (
    <section className='mx-auto max-w-3xl p-4' data-testid='ui-family' data-ui-family={family}>
      {content}
      {message && (
        <p role='status' className='mt-4'>
          {message}
        </p>
      )}
    </section>
  )
}
