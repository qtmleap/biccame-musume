import dayjs from 'dayjs'
import charactersData from '../../public/characters.json'

type StoreData = {
  id: string
  character: {
    name: string
    description: string
    twitter_id: string
    images: string[]
    birthday?: string
    is_biccame_musume?: boolean
  }
  store?: {
    name?: string
    address?: string
    prefecture?: string
    birthday?: string
  }
}

type Quiz = {
  id: number
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
}

const characters = charactersData as StoreData[]
const biccameMusume = characters.filter((c) => c.character.is_biccame_musume)

const quizList: Quiz[] = []
let quizId = 1

const shuffleArray = <T>(array: T[]): void => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
}

const getRandomCharacters = (excludeKey: string, count: number): Character[] => {
  const filtered = biccameMusume.filter((c) => c.key !== excludeKey)
  const shuffled = [...filtered]
  shuffleArray(shuffled)
  return shuffled.slice(0, count)
}

// 1. ◯◯に当てはまるビッカメ娘は？（特徴からキャラクター名を当てる）
const generateFeatureQuizzes = () => {
  biccameMusume.forEach((char) => {
    if (quizId > 200) return

    const { character_name, description } = char
    const features: string[] = []

    // 髪型の特徴を抽出
    if (description.includes('ツインテール')) {
      const match = description.match(/([^。]*ツインテール[^。]*)/)
      if (match) features.push(match[1])
    }

    // 髪飾り・ヘアピンの特徴を抽出
    const hairAccessoryMatch = description.match(/([^。]*(?:髪飾り|ヘアピン)[^。]*)/)
    if (hairAccessoryMatch) features.push(hairAccessoryMatch[1])

    // リボンの特徴を抽出
    const ribbonMatch = description.match(/([^。]*リボン[^。]*)/)
    if (ribbonMatch) features.push(ribbonMatch[1])

    // 好物の特徴を抽出
    const favoriteMatch = description.match(/([^。]*(?:大好物|が好き)[^。]*)/)
    if (favoriteMatch) features.push(favoriteMatch[1])

    // 性格の特徴を抽出
    const personalityMatch = description.match(/([^。]*性格[^。]*)/)
    if (personalityMatch) features.push(personalityMatch[1])

    // 口調の特徴を抽出
    const speechMatch = description.match(/([^。]*口調[^。]*)/)
    if (speechMatch) features.push(speechMatch[1])

    // 服装の特徴を抽出
    const clothingMatch = description.match(/([^。]*(?:制服|法被|ハッピ|袴)[^。]*)/)
    if (clothingMatch) features.push(clothingMatch[1])

    // ユニークな特徴を抽出
    const uniqueMatches = description.match(/([^。]*(?:特徴|噂)[^。]*)/g)
    if (uniqueMatches) features.push(...uniqueMatches)

    // 各特徴からクイズを生成
    features.forEach((feature) => {
      if (quizId > 200) return
      const otherChars = getRandomCharacters(char.key, 3)
      const options = [character_name, ...otherChars.map((c) => c.character_name)]
      shuffleArray(options)

      quizList.push({
        id: quizId++,
        question: `「${feature}」という特徴を持つビッカメ娘は？`,
        options,
        correctAnswer: options.indexOf(character_name),
        explanation: `${character_name}の特徴です。`
      })
    })
  })
}

// 2. ◯◯たんの胸にある花の種類は？
const generateFlowerQuizzes = () => {
  biccameMusume.forEach((char) => {
    if (quizId > 200) return

    const { character_name, description } = char

    // 花の種類を抽出
    const flowerPatterns = [
      /(?:胸|リボン|髪飾り|ヘアピン|モチーフ)[^。]*?([ぁ-ん]{2,5}(?:の花|花))/,
      /市の花[・は]([ぁ-ん]{2,5})/,
      /県の花[・は]([ぁ-ん]{2,5})/,
      /([ァ-ヴ]{2,6})(?:の花|をモチーフ|を?髪飾り)/
    ]

    let flowerName = ''
    for (const pattern of flowerPatterns) {
      const match = description.match(pattern)
      if (match) {
        flowerName = match[1].replace('の花', '').replace('花', '')
        break
      }
    }

    if (flowerName) {
      // 他のキャラクターから花の名前を取得（選択肢用）
      const otherFlowers: string[] = []
      biccameMusume.forEach((c) => {
        if (c.key === char.key) return
        for (const pattern of flowerPatterns) {
          const match = c.description.match(pattern)
          if (match) {
            const flower = match[1].replace('の花', '').replace('花', '')
            if (flower !== flowerName && !otherFlowers.includes(flower)) {
              otherFlowers.push(flower)
            }
          }
        }
      })

      if (otherFlowers.length >= 3) {
        const options = [flowerName, ...otherFlowers.slice(0, 3)]
        shuffleArray(options)

        quizList.push({
          id: quizId++,
          question: `${character_name}の胸やリボンにある花の種類は？`,
          options,
          correctAnswer: options.indexOf(flowerName),
          explanation: `${character_name}のモチーフは${flowerName}です。`
        })
      }
    }
  })
}

// 3. ◯◯たんの誕生日は？
const generateBirthdayQuizzes = () => {
  biccameMusume.forEach((char) => {
    if (quizId > 200) return
    if (!char.character_birthday) return

    const { character_name, character_birthday } = char
    const date = new Date(character_birthday)
    const month = date.getMonth() + 1
    const day = date.getDate()

    // 他のキャラクターの誕生日を取得
    const otherBirthdays = biccameMusume
      .filter((c) => c.key !== char.key && c.character_birthday)
      .map((c) => {
        const d = dayjs(c.character_birthday!)
        return `${d.month() + 1}月${d.date()}日`
      })

    if (otherBirthdays.length >= 3) {
      const correctAnswer = `${month}月${day}日`
      const options = [correctAnswer, ...otherBirthdays.slice(0, 3)]
      shuffleArray(options)

      quizList.push({
        id: quizId++,
        question: `${character_name}の誕生日は？`,
        options,
        correctAnswer: options.indexOf(correctAnswer),
        explanation: `${character_name}の誕生日は${correctAnswer}です。`
      })
    }
  })
}

// 4. ◯◯日が誕生日のビッカメ娘は？
const generateReverseBirthdayQuizzes = () => {
  biccameMusume.forEach((char) => {
    if (quizId > 200) return
    if (!char.character_birthday) return

    const { character_name, character_birthday } = char
    const date = dayjs(character_birthday)
    const month = date.month() + 1
    const day = date.date()

    const otherChars = getRandomCharacters(char.key, 3)
    const options = [character_name, ...otherChars.map((c) => c.character_name)]
    shuffleArray(options)

    quizList.push({
      id: quizId++,
      question: `${month}月${day}日が誕生日のビッカメ娘は？`,
      options,
      correctAnswer: options.indexOf(character_name),
      explanation: `${character_name}の誕生日は${month}月${day}日です。`
    })
  })
}

// クイズを生成
generateFeatureQuizzes()
generateFlowerQuizzes()
generateBirthdayQuizzes()
generateReverseBirthdayQuizzes()

// JSON出力（200問まで）
console.log(JSON.stringify(quizList.slice(0, 200), null, 2))
