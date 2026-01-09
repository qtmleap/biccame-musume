import { type IntlayerConfig, Locales } from 'intlayer'

const config: IntlayerConfig = {
  internationalization: {
    locales: [Locales.ENGLISH, Locales.JAPANESE],
    defaultLocale: Locales.JAPANESE
  }
}

export default config
