import config from './workers/web/intlayer.config'

// Intlayer の設定ローダーは cwd 基準。ルートコマンドでは app の探索先だけを補正する。
export default {
  ...config,
  content: {
    ...config.content,
    contentDir: ['workers/web/src']
  }
}
