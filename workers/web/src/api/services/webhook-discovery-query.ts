import type { WebhookDiscoveryFilter } from '@biccame/shared/schemas/webhook.dto'

const recordedRelevance = (alias: 'j' | 'c') => {
  const json = `(CASE WHEN json_valid(${alias}.result_json) THEN ${alias}.result_json ELSE '{}' END)`
  const validArrays = ['evidence', 'missingFields', 'reasons']
    .map(
      (field) =>
        `(json_type(${json},'$.discovery.${field}')='array' AND NOT EXISTS
      (SELECT 1 FROM json_each(${json},'$.discovery.${field}') d WHERE d.type<>'text' OR length(d.value)=0))`
    )
    .join(' AND ')
  return `(CASE WHEN json_type(${json},'$.discovery')='object'
    AND (json_type(${json},'$.discovery.confidence')='null' OR
      (json_type(${json},'$.discovery.confidence') IN ('integer','real')
       AND json_extract(${json},'$.discovery.confidence') BETWEEN 0 AND 1))
    AND ${validArrays}
    AND json_extract(${json},'$.discovery.action') IN ('create','update','end','review','none')
    AND json_extract(${json},'$.discovery.relevance') IN ('detected','uncertain','not_detected')
    THEN json_extract(${json},'$.discovery.relevance') ELSE NULL END)`
}

/**
 * 保存された discovery は AI が判定した時点の記録で、人が連携して登録済みにしても書き換わらない。
 * 表示の優先順位と同じく、登録済み（status='registered'）は AI の未確定・対象外より優先して 'detected' として数える。
 */
const effectiveRelevance = (alias: 'j' | 'c') =>
  `(CASE WHEN ${alias}.status='registered' THEN 'detected' ELSE ${recordedRelevance(alias)} END)`

/** 親の一覧表示と同じく、保存された子候補を優先して発見状態を集約する。 */
export const webhookDiscoveryFilterClause = (value: WebhookDiscoveryFilter) => {
  const child = effectiveRelevance('c')
  const parent = effectiveRelevance('j')
  const children = 'FROM webhook_event_candidates c WHERE c.post_id=j.post_id'
  const known = `(SELECT count(*) ${children} AND ${child} IS NOT NULL)`
  const relevance = `(CASE
    WHEN EXISTS (SELECT 1 ${children} AND ${child}='detected') THEN 'detected'
    WHEN ${known}>0 THEN CASE
      WHEN EXISTS (SELECT 1 ${children} AND ${child}='uncertain')
        OR ${known}<(SELECT count(*) ${children}) THEN 'uncertain'
      ELSE 'not_detected' END
    ELSE COALESCE(${parent},'unrecorded') END)`
  return { where: `${relevance}=?`, values: [value] }
}
