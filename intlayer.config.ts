import config from './workers/app/intlayer.config'

// Intlayer の設定ローダーは cwd 基準。ルートコマンドでは app の探索先だけを補正する。
export default {
  ...config,
  content: {
    ...config.content,
    contentDir: ['workers/app/src']
  }
}
