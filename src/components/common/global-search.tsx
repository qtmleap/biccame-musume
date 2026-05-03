import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Gift, MapPin, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCharacters } from '@/hooks/use-characters'
import { CHARACTER_NAME_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { StoreKey } from '@/schemas/store.dto'
import { client } from '@/utils/client'

type GlobalSearchProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const useDebounce = (value: string, delay: number): string => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export const GlobalSearch = ({ open, onOpenChange }: GlobalSearchProps) => {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const navigate = useNavigate()
  const { data: characters } = useCharacters()

  const { data: searchResult } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => client.searchEvents({ queries: { q: debouncedQuery } }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 30
  })

  const filteredCharacters = useMemo(() => {
    if (!characters || debouncedQuery.length < 2) return []
    const q = debouncedQuery.toLowerCase()
    return characters.filter((c) => {
      const name = c.character.name.toLowerCase()
      const aliases = c.character.aliases?.map((a) => a.toLowerCase()) ?? []
      return name.includes(q) || aliases.some((a) => a.includes(q))
    })
  }, [characters, debouncedQuery])

  const filteredStores = useMemo(() => {
    if (!characters || debouncedQuery.length < 2) return []
    const q = debouncedQuery.toLowerCase()
    return characters.filter((c) => {
      const storeName = (STORE_NAME_LABELS[c.id as StoreKey] || '').toLowerCase()
      return storeName.includes(q)
    })
  }, [characters, debouncedQuery])

  const handleSelect = (action: () => void) => {
    action()
    onOpenChange(false)
    setQuery('')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) setQuery('')
      }}
    >
      <DialogContent className='overflow-hidden p-0'>
        <DialogHeader className='sr-only'>
          <DialogTitle>グローバル検索</DialogTitle>
          <DialogDescription>イベント・キャラクター・店舗を検索</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput placeholder='イベント・キャラクター・店舗を検索...' value={query} onValueChange={setQuery} />
          <CommandList>
            {debouncedQuery.length < 2 && <CommandEmpty>2文字以上入力して検索</CommandEmpty>}
            {debouncedQuery.length >= 2 &&
              !searchResult?.events?.length &&
              !filteredCharacters.length &&
              !filteredStores.length && <CommandEmpty>検索結果がありません</CommandEmpty>}

            {searchResult?.events && searchResult.events.length > 0 && (
              <CommandGroup heading='イベント'>
                {searchResult.events.slice(0, 5).map((event) => {
                  const storeLabel = event.stores.map((s) => STORE_NAME_LABELS[s as StoreKey] || s).join(' / ')
                  const isOngoing = event.status === 'ongoing' || event.status === 'last_day'
                  return (
                    <CommandItem
                      key={event.uuid}
                      value={event.uuid}
                      onSelect={() =>
                        handleSelect(() => navigate({ to: '/events/$uuid', params: { uuid: event.uuid } }))
                      }
                    >
                      <Gift className='size-4' />
                      <div className='flex min-w-0 flex-1 items-center gap-2'>
                        <span className='truncate'>{event.title}</span>
                        {storeLabel && <span className='shrink-0 text-xs text-muted-foreground'>{storeLabel}</span>}
                        {isOngoing && (
                          <span className='shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand'>
                            {event.status === 'last_day' ? '本日最終日' : '開催中'}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {filteredCharacters.length > 0 && (
              <CommandGroup heading='キャラクター'>
                {filteredCharacters.slice(0, 5).map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`character-${c.id}`}
                    onSelect={() => handleSelect(() => navigate({ to: '/characters/$id', params: { id: c.id } }))}
                  >
                    <Users className='size-4' />
                    <span className='truncate'>{CHARACTER_NAME_LABELS[c.id as StoreKey] || c.character.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {filteredStores.length > 0 && (
              <CommandGroup heading='店舗'>
                {filteredStores.slice(0, 5).map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`store-${c.id}`}
                    onSelect={() => handleSelect(() => navigate({ to: '/characters/$id', params: { id: c.id } }))}
                  >
                    <MapPin className='size-4' />
                    <span className='truncate'>{STORE_NAME_LABELS[c.id as StoreKey] || c.id}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
