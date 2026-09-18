import { z } from 'zod'

export const signupSchema = z.object({
  name: z.string().min(1, '名前を入力してください'),
  email: z.email({ message: '正しいメールアドレス形式で入力してください' }),
  password: z.string().min(8, 'パスワードは8文字以上で指定してください')
})

export const loginSchema = z.object({
  email: z.email({ message: '正しいメールアドレス形式で入力してください' }),
  password: z.string().min(1, 'パスワードを入力してください')
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>