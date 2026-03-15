import { z } from 'zod'

export const TelegramChatSchema = z.object({
  id: z.number(),
  type: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  title: z.string().optional(),
})

export const TelegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
})

export const TelegramMessageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: TelegramChatSchema,
  from: TelegramUserSchema.optional(),
  text: z.string().optional(),
})

export const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: TelegramMessageSchema.optional(),
})

export type TelegramChat = z.infer<typeof TelegramChatSchema>
export type TelegramUser = z.infer<typeof TelegramUserSchema>
export type TelegramMessage = z.infer<typeof TelegramMessageSchema>
export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>
