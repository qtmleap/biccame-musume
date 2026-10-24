import { resolve } from 'node:path'
import {
  d1AnchoredCorpusIssues,
  expandedCorpusIssues,
  EXPANDED_CORPUS_DIRECTORY
} from './lib/event-detect/goal-pipeline-expanded-corpus'

// 新イベント判定コーパスの機械検証を全件列挙する。AI・ネットワーク・D1は使わず、問題があればexit 1。
// 第2引数にd1-anchored-v1を渡すと、D1登録イベント起点セットをexpanded-v2も含めた比較対象で検査する。
const directory = process.argv[2] === undefined ? EXPANDED_CORPUS_DIRECTORY : resolve(process.argv[2])
const issues =
  process.argv[3] === 'd1-anchored-v1' ? await d1AnchoredCorpusIssues(directory) : await expandedCorpusIssues(directory)
console.log(JSON.stringify({ directory, issues: issues.length, details: issues }, null, 2))
process.exit(issues.length === 0 ? 0 : 1)
