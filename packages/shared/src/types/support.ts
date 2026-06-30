// Admin↔user "system chat" (god.support) — two-way support/guidance thread.
import { z } from 'zod'

export interface GodSupportMessage {
  id: string
  sender_kind: 'admin' | 'user'
  sender_id: string | null
  sender_name: string | null
  body: string
  created_at: string
  read_at: string | null
}

export interface GodSupportThread {
  thread_id: string
  user: { id: string; full_name: string | null; email: string | null; role: string | null }
  messages: GodSupportMessage[]
}

// Pre-set message templates the admin can drop into the composer. {{name}} is
// substituted with the recipient's name client-side.
export interface MessageTemplate {
  id: string
  label: string
  body: string
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'stuck_week',
    label: 'נתקע מעל שבוע',
    body: 'היי {{name}}, ראינו שאתם תקועים בשלב הנוכחי כבר מעל שבוע. נשמח לעזור — מה חסר לכם כדי להתקדם?',
  },
  {
    id: 'missing_doc',
    label: 'חסר מסמך',
    body: 'היי {{name}}, כדי להמשיך בתהליך חסר לנו מסמך שביקשנו. אפשר להעלות אותו דרך המערכת? נשמח לעזור אם משהו לא ברור.',
  },
  {
    id: 'how_help',
    label: 'הצעת עזרה כללית',
    body: 'היי {{name}}, רצינו לבדוק איך מתקדם אצלכם בתהליך ואם יש משהו שנוכל לעזור בו.',
  },
  {
    id: 'next_step',
    label: 'הכוונה לצעד הבא',
    body: 'היי {{name}}, הצעד הבא בתהליך הוא להשלים את המשימות הפתוחות בשלב הנוכחי. אנחנו כאן לכל שאלה.',
  },
  {
    id: 'reminder',
    label: 'תזכורת עדינה',
    body: 'היי {{name}}, רק תזכורת קטנה שממתינות לכם משימות במערכת. נשמח לראות אתכם מתקדמים בתהליך.',
  },
]

// ── Inputs ──────────────────────────────────────────────────────────────
export const GodSupportThreadInput = z.object({ user_id: z.string().uuid() })
export type GodSupportThreadInput = z.infer<typeof GodSupportThreadInput>

export const GodSupportSendInput = z.object({
  user_id: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  template_id: z.string().max(60).optional(),
})
export type GodSupportSendInput = z.infer<typeof GodSupportSendInput>
