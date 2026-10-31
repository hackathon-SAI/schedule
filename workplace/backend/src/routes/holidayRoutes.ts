import { Hono } from 'hono'
import { Env } from '../types/hono'
import { authCheck } from '../middleware/authMiddleware'

const holidayRoutes = new Hono<Env>()
const HOLIDAY_CSV_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv'
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000

type Holiday = {
  date: string
  name: string
}

let cachedHolidays: { holidays: Holiday[]; expiresAt: number } | null = null
let holidaysRequest: Promise<Holiday[]> | null = null

holidayRoutes.use('*', authCheck)

holidayRoutes.get('/', async (c) => {
  const start = c.req.query('start')
  const end = c.req.query('end')
  if (!isDate(start) || !isDate(end) || start >= end) {
    return c.json({ error: '有効な開始日と終了日を指定してください。' }, 400)
  }

  try {
    const holidays = await loadHolidays()
    return c.json({
      holidays: holidays.filter((holiday) => holiday.date >= start && holiday.date < end),
    })
  } catch (error) {
    console.error('祝日CSVの取得に失敗しました:', error)
    return c.json({ error: '祝日情報を取得できませんでした。' }, 502)
  }
})

function isDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

async function loadHolidays(): Promise<Holiday[]> {
  if (cachedHolidays && cachedHolidays.expiresAt > Date.now()) {
    return cachedHolidays.holidays
  }
  if (holidaysRequest) return holidaysRequest

  holidaysRequest = (async () => {
    const response = await fetch(HOLIDAY_CSV_URL, {
      headers: { Accept: 'text/csv' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      throw new Error(`内閣府の祝日CSV取得に失敗しました (${response.status})`)
    }

    const csv = new TextDecoder('shift_jis').decode(await response.arrayBuffer())
    const holidays = csv
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .slice(1)
      .map(parseHolidayRow)
      .filter((holiday): holiday is Holiday => holiday !== null)

    if (holidays.length === 0) {
      throw new Error('内閣府の祝日CSVに有効なデータがありません。')
    }

    cachedHolidays = { holidays, expiresAt: Date.now() + CACHE_DURATION_MS }
    return holidays
  })()

  try {
    return await holidaysRequest
  } finally {
    holidaysRequest = null
  }
}

function parseHolidayRow(line: string): Holiday | null {
  if (!line.trim()) return null

  const [rawDate, ...nameParts] = parseCsvLine(line)
  const match = rawDate?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  const name = nameParts.join(',').trim()
  if (!match || !name) return null

  const [, year, month, day] = match
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return isDate(date) ? { date, name } : null
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      fields.push(field)
      field = ''
    } else {
      field += character
    }
  }

  fields.push(field)
  return fields
}

export default holidayRoutes
