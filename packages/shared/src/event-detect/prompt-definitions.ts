import { z } from 'zod'
import definitions from '../generated/webhook-prompt-definitions.json'
import { WebhookPromptDefinitionSchema } from '../schemas/webhook.dto'

// 生成済みの宣言的定義だけを使い、保存されたコードを実行しない。
const parsed = z.array(WebhookPromptDefinitionSchema).safeParse(definitions)
if (!parsed.success) throw new Error('Invalid versioned webhook prompt definitions')
export const webhookPromptDefinitions = parsed.data
export const webhookPromptDefinition = (version: string) =>
  webhookPromptDefinitions.find((definition) => definition.questionVersion === version)
