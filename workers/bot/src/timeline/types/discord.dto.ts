type DiscordEmbedField = {
  name: string
  value: string
  inline?: boolean
}

type DiscordEmbed = {
  title?: string
  description?: string
  url?: string
  color?: number
  timestamp?: string
  fields?: DiscordEmbedField[]
}

type DiscordButton = {
  type: 2 // Button
  style: 5 // Link
  label: string
  url: string
}

type DiscordActionRow = {
  type: 1 // Action Row
  components: DiscordButton[]
}

export type DiscordWebhookPayload = {
  content?: string
  embeds?: DiscordEmbed[]
  components?: DiscordActionRow[]
}
