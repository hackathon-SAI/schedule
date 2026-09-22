import { z } from 'zod'

const isValidDateString = (val: string): boolean => {
  const date = new Date(val)
  return !isNaN(date.getTime())
}

export const createEventSchema = z.object({
  group_id: z.number({ message: 'グループIDは必須です' }),
  title: z.string().min(1, 'タイトルを入力してください').max(100, 'タイトルは100文字以内で入力してください'),
  description: z.string().optional(),
  start_time: z.string().refine(isValidDateString, {
    message: '正しい日時フォーマット(ISO8601)で指定してください',
  }),
  end_time: z.string().refine(isValidDateString, {
    message: '正しい日時フォーマット(ISO8601)で指定してください',
  }),
  subject: z.string().optional(),
  subject_color: z.string().optional(),
}).refine((data) => new Date(data.start_time) < new Date(data.end_time), {
  message: '終了時刻は開始時刻より後に設定してください',
  path: ['end_time'],
})

export const updateEventSchema = createEventSchema.partial().omit({ group_id: true })

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>