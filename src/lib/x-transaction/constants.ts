export const ADDITIONAL_RANDOM_NUMBER = 3
export const DEFAULT_KEYWORD = 'obfiowerehiring'

export const ON_DEMAND_FILE_URL_TEMPLATE = 'https://abs.twimg.com/responsive-web/client-web/ondemand.s.{filename}a.js'

export const ON_DEMAND_FILE_REGEX = /,(\d+):["']ondemand\.s["']/m
export const onDemandHashRegex = (index: string) => new RegExp(`,${index}:"([0-9a-f]+)"`)

export const INDICES_REGEX = /\(\w\[(\d{1,2})\],\s*16\)/g
