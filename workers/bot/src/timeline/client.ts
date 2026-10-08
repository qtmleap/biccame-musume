import { ClientTransaction, fetchTransactionInputs } from '@biccame/shared/x/transaction'
import { makeApi, Zodios, type ZodiosInstance, ZodiosResponseError } from '@qtmleap/zodios'
import type { Dayjs } from 'dayjs'
import { FeaturesSchema } from './schemas/feature.dto'
import { type Post, PostSchema } from './schemas/response.dto'
import { SearchVariablesSchema } from './schemas/variables.dto'
import { TimelineFailure } from './utils/failure'

const endpoints = makeApi([
  {
    method: 'get',
    path: '/i/api/graphql/rkp6b4vtR9u7v3naGoOzUQ/SearchTimeline',
    alias: 'searchTimeline',
    parameters: [
      { name: 'variables', type: 'Query', schema: SearchVariablesSchema },
      { name: 'features', type: 'Query', schema: FeaturesSchema }
    ],
    response: PostSchema
  }
])

type TwitterCredentials = {
  TWITTER_BEARER_TOKEN: string
  TWITTER_AUTH_TOKEN: string
  TWITTER_CSRF_TOKEN: string
}

type SearchTimelineParams = { since: Dayjs; until: Dayjs; cursor?: string; listId?: string }

import { DEFAULT_USER_AGENT } from '@biccame/shared/x/transaction/discovery'

type Signer = Pick<ClientTransaction, 'generateTransactionId'>
let cachedTransaction: Signer | undefined
const createTransaction = async (): Promise<Signer> => {
  if (!cachedTransaction) cachedTransaction = ClientTransaction.create(await fetchTransactionInputs())
  return cachedTransaction
}

export class Client {
  private readonly client: ZodiosInstance<typeof endpoints>
  private rawClient?: Client

  constructor(
    private readonly credentials: TwitterCredentials,
    private readonly createSigner: () => Promise<Signer> = createTransaction,
    rawResponse = false
  ) {
    if (
      ![credentials.TWITTER_BEARER_TOKEN, credentials.TWITTER_AUTH_TOKEN, credentials.TWITTER_CSRF_TOKEN].every(
        (value) => typeof value === 'string' && value.trim()
      )
    )
      throw new TimelineFailure('configuration')
    this.client = new Zodios('https://x.com', endpoints, {
      transform: rawResponse ? 'request' : true,
      validate: rawResponse ? 'request' : true,
      fetchOptions: {
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${credentials.TWITTER_BEARER_TOKEN}`,
          Cookie: `auth_token=${credentials.TWITTER_AUTH_TOKEN}; ct0=${credentials.TWITTER_CSRF_TOKEN}`,
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-client-language': 'en',
          'x-csrf-token': credentials.TWITTER_CSRF_TOKEN,
          'Content-Type': 'application/json',
          'User-Agent': DEFAULT_USER_AGENT
        }
      }
    })
    this.client.use({
      name: 'onTransaction',
      request: async (_api, config) => {
        try {
          const signer = await createSigner()
          const transactionId = await signer.generateTransactionId(
            config.method ? config.method.toUpperCase() : 'GET',
            config.url ? config.url : '/'
          )
          return { ...config, headers: { ...config.headers, 'x-client-transaction-id': transactionId } }
        } catch {
          cachedTransaction = undefined
          throw new TimelineFailure('signature')
        }
      }
    })
    this.client.use({
      name: 'onError',
      error: async (_api, _config, error) => {
        cachedTransaction = undefined
        if (error instanceof TimelineFailure) throw error
        const status = error instanceof ZodiosResponseError ? error.response.status : undefined
        throw new TimelineFailure(status === 429 ? 'rate_limited' : 'timeline', status)
      }
    })
  }

  search = async ({ since, until, cursor, listId = '2019028800869413128' }: SearchTimelineParams): Promise<Post> => {
    const query = `list:${listId} since:${since.format('YYYY-MM-DD')} until:${until.add(1, 'day').format('YYYY-MM-DD')}`
    try {
      return await this.client.searchTimeline({ queries: { variables: { rawQuery: query, cursor }, features: {} } })
    } catch (error) {
      if (error instanceof TimelineFailure) throw error
      throw new TimelineFailure('timeline')
    }
  }

  // Same signed request pipeline; archive callers validate only after saving the HTTP-200 body.
  searchRaw = async (params: SearchTimelineParams): Promise<unknown> => {
    if (!this.rawClient) this.rawClient = new Client(this.credentials, this.createSigner, true)
    return this.rawClient.search(params)
  }
}
