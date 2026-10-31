import { OAuth2Client } from 'google-auth-library'
import { Context } from 'hono'
import { UserModel } from '../models/userModel'
import { Env } from '../types/hono'

async function getAccessToken(userId: string | number): Promise<string> {
  const savedTokens = await UserModel.findGoogleTokens(userId)
  if (!savedTokens) {
    throw new Error('Googleアカウント情報が見つかりません。再ログインしてください。')
  }

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  client.setCredentials({
    access_token: savedTokens.google_access_token || undefined,
    refresh_token: savedTokens.google_refresh_token || undefined,
    expiry_date: savedTokens.google_token_expires_at || undefined,
  })

  if (
    !savedTokens.google_refresh_token &&
    (!savedTokens.google_access_token ||
      (savedTokens.google_token_expires_at !== null &&
        savedTokens.google_token_expires_at <= Date.now()))
  ) {
    throw new Error('Google連携の有効期限が切れています。Googleアカウントで再ログインしてください。')
  }

  const accessToken = await client.getAccessToken()
  const refreshed = client.credentials
  if (!accessToken.token) {
    throw new Error('Google APIのアクセストークンを取得できませんでした。再ログインしてください。')
  }

  if (
    refreshed.access_token &&
    (refreshed.access_token !== savedTokens.google_access_token ||
      refreshed.expiry_date !== savedTokens.google_token_expires_at)
  ) {
    await UserModel.updateGoogleTokens(Number(userId), {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || null,
      expiryDate: refreshed.expiry_date || null,
    })
  }

  return accessToken.token
}

async function googleGet<T>(accessToken: string, url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await response.json().catch(() => ({})) as {
    error?: { message?: string }
  }
  if (!response.ok) {
    const detail = body.error?.message
    if (response.status === 401) {
      throw new Error(
        detail
          ? `Google連携の有効期限が切れています。Googleアカウントで再認証してください: ${detail}`
          : 'Google連携の有効期限が切れています。Googleアカウントで再認証してください。'
      )
    }
    if (response.status === 403) {
      throw new Error(
        detail
          ? `Google APIへのアクセスが拒否されました。Cloud ConsoleでAPIの有効化とOAuth権限を確認してください: ${detail}`
          : 'Google APIへのアクセスが拒否されました。Cloud ConsoleでAPIの有効化とOAuth権限を確認してください。'
      )
    }
    throw new Error(detail || `Google APIエラー (${response.status})`)
  }
  return body as T
}

async function withGoogleData<T>(
  c: Context<Env>,
  load: (accessToken: string) => Promise<T>
) {
  try {
    const accessToken = await getAccessToken(c.get('jwtPayload').id)
    return c.json(await load(accessToken))
  } catch (error) {
    console.error('Google APIデータ取得エラー:', error)
    const message = error instanceof Error ? error.message : 'Google APIデータを取得できませんでした。'
    const status = /再ログイン|再認証/.test(message) ? 409 : 502
    return c.json({ error: message }, status)
  }
}

interface GoogleCourse {
  id: string
  name: string
  courseState?: string
}

interface GoogleCoursework {
  id: string
  title: string
  description?: string
  alternateLink?: string
  state?: string
  creationTime?: string
  dueDate?: { year: number; month: number; day: number }
  dueTime?: { hours?: number; minutes?: number }
}

interface GoogleCalendarEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  htmlLink?: string
  created?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

function getAcademicYearRange(now = new Date()) {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now)
  const year = Number(dateParts.find((part) => part.type === 'year')?.value)
  const month = Number(dateParts.find((part) => part.type === 'month')?.value)
  const startYear = month >= 4 ? year : year - 1

  return {
    start: new Date(`${startYear}-04-01T00:00:00+09:00`),
    end: new Date(`${startYear + 1}-04-01T00:00:00+09:00`),
    label: `${startYear}年度`,
  }
}

function createdThisAcademicYear(created: string | undefined, start: Date, end: Date) {
  if (!created) return false
  const createdAt = Date.parse(created)
  return Number.isFinite(createdAt) && createdAt >= start.getTime() && createdAt < end.getTime()
}

export const GoogleDataController = {
  async classroomCoursework(c: Context<Env>) {
    return withGoogleData(c, async (accessToken) => {
      const academicYear = getAcademicYearRange()
      const coursesUrl = new URL('https://classroom.googleapis.com/v1/courses')
      coursesUrl.searchParams.set('courseStates', 'ACTIVE')
      coursesUrl.searchParams.set('pageSize', '100')
      const coursesResult = await googleGet<{ courses?: GoogleCourse[] }>(
        accessToken,
        coursesUrl
      )
      const courses = coursesResult.courses || []
      const coursework: Array<GoogleCoursework & { courseId: string; courseName: string }> = []

      for (const course of courses) {
        const courseworkUrl = new URL(
          `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(course.id)}/courseWork`
        )
        courseworkUrl.searchParams.set('courseWorkStates', 'PUBLISHED')
        courseworkUrl.searchParams.set('pageSize', '100')
        const result = await googleGet<{ courseWork?: GoogleCoursework[] }>(
          accessToken,
          courseworkUrl
        )
        for (const item of result.courseWork || []) {
          coursework.push({
            ...item,
            courseId: course.id,
            courseName: course.name,
          })
        }
      }

      return {
        coursework: coursework.filter((item) =>
          createdThisAcademicYear(item.creationTime, academicYear.start, academicYear.end)
        ),
        academicYear: academicYear.label,
      }
    })
  },

  async calendarEvents(c: Context<Env>) {
    const academicYear = getAcademicYearRange()
    const timeMin = c.req.query('timeMin') || academicYear.start.toISOString()
    const timeMax = c.req.query('timeMax') || academicYear.end.toISOString()
    if (
      !Number.isFinite(Date.parse(timeMin)) ||
      !Number.isFinite(Date.parse(timeMax)) ||
      Date.parse(timeMax) <= Date.parse(timeMin)
    ) {
      return c.json({ error: 'カレンダーの取得期間が正しくありません。' }, 400)
    }

    return withGoogleData(c, async (accessToken) => {
      const events: GoogleCalendarEvent[] = []
      let pageToken: string | undefined
      do {
        const url = new URL(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events'
        )
        url.searchParams.set('timeMin', timeMin)
        url.searchParams.set('timeMax', timeMax)
        url.searchParams.set('singleEvents', 'true')
        url.searchParams.set('orderBy', 'startTime')
        url.searchParams.set('maxResults', '250')
        url.searchParams.set(
          'fields',
          'nextPageToken,items(id,summary,description,htmlLink,created,start,end,status)'
        )
        if (pageToken) url.searchParams.set('pageToken', pageToken)
        const result = await googleGet<{
          items?: GoogleCalendarEvent[]
          nextPageToken?: string
        }>(accessToken, url)
        events.push(...(result.items || []).filter((event) => event.status !== 'cancelled'))
        pageToken = result.nextPageToken
      } while (pageToken && events.length < 1000)

      return {
        events: events.filter((event) =>
          createdThisAcademicYear(event.created, academicYear.start, academicYear.end)
        ),
        academicYear: academicYear.label,
      }
    })
  },
}
