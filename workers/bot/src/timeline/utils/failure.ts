export type TimelineFailureKind =
  | 'configuration'
  | 'signature'
  | 'timeline'
  | 'analysis'
  | 'discord_rejected'
  | 'rate_limited'
  | 'delivery_unknown'

export class TimelineFailure extends Error {
  constructor(
    readonly kind: TimelineFailureKind,
    readonly status?: number
  ) {
    super(`Bot timeline failure: ${kind}`)
    this.name = 'TimelineFailure'
  }
}
