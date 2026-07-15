-- 031 — Dev Tasks board (מרכז פיתוח): the Redirectx gap-closing campaign as a
-- managed board. Each task carries its campaign phase, an owner agent, a
-- delivery status and dependency links. Seeded once with the 29-task plan
-- (source: ~/developer-report/asset-rise-vs-redirectx-gap-analysis.md).
-- Idempotent.

create table if not exists sc_dev_tasks (
  id             uuid primary key default gen_random_uuid(),
  seq            int not null,                     -- execution order (0 = first)
  title          text not null,
  description    text,
  phase          text not null default 'quickwin', -- ops|regulation|organizer|comms|payments|collab|quickwin
  task_type      text not null default 'dev',      -- dev|dev_external|human
  agent          text not null default 'Claude',   -- owning agent (free text: Claude/Vision/Yossef/...)
  status         text not null default 'backlog',  -- backlog|spec|in_dev|review|deployed|blocked|waiting_yossef
  blocked_reason text,
  notes          text,
  depends_on     int[] not null default '{}',      -- seq numbers this task waits for
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists sc_dev_tasks_seq_uniq on sc_dev_tasks(seq);
create index if not exists sc_dev_tasks_status_idx on sc_dev_tasks(status);
create index if not exists sc_dev_tasks_phase_idx on sc_dev_tasks(phase);

alter table sc_dev_tasks enable row level security;

insert into sc_permissions (role_key, action, scope) values
  ('admin', 'admin.devtasks.view',   'all'),
  ('admin', 'admin.devtasks.manage', 'all')
on conflict (role_key, action) do nothing;

-- ---- seed: the campaign plan (order = seq). on conflict(seq) keeps re-runs safe.
insert into sc_dev_tasks (seq, title, description, phase, task_type, agent, status, depends_on) values
  (0,  'תיקון צינור ה-deploy של asset-rise', 'נחקר ונסגר: הצינור תקין — התיקונים היו באוויר; האימות הקודם בדק bundle לא נכון (code-splitting).', 'ops', 'dev', 'Claude', 'deployed', '{}'),
  (1,  '2FA-TOTP — אימות דו-שלבי', 'הרשמה + אכיפה + recovery codes (otplib, RFC 6238, סודות מוצפנים). דדליין רגולטורי: תקנה 16 — 29.7.2026.', 'regulation', 'dev', 'Claude', 'spec', '{}'),
  (2,  'ייצוא נתונים JSON', 'ייצוא עצמי של כל נתוני המשתמש (חוק הגנת הפרטיות ס'' 13) — endpoint + כפתור בהגדרות.', 'regulation', 'dev', 'Vision', 'backlog', '{}'),
  (3,  'ניהול סשנים ומכשירים', 'רשימת סשנים פעילים (דפדפן+IP+זמן) + ניתוק פרטני/כולל, על בסיס Supabase auth.', 'regulation', 'dev', 'Vision', 'backlog', '{}'),
  (4,  '"פעילות אחרונה" בהגדרות', '100 הפעולות האחרונות של המשתמש מתוך sc_audit_log — שקיפות + דרישת אמון.', 'regulation', 'dev', 'Vision', 'backlog', '{}'),
  (5,  'סטטוסי החתמה לדייר', 'enum סטטוס (ממתין/מתנגד/סרבן/נון-שופ/חתם חוזה) + פילטרים + רוסטר חתימות/ייפוי-כח פר-בניין. בעלות-% כבר קיימת (030).', 'organizer', 'dev', 'Claude', 'backlog', '{}'),
  (6,  'מנוע סיבובי חתימה', 'קמפיין החתמה: יצירת סיבוב → משפך הוזמנו→נצפו→בעיון→נחתמו → תזכורת לכולם. מרחיב את sc_signatures.', 'organizer', 'dev', 'Claude', 'backlog', '{5}'),
  (7,  'מחשבון רוב מיוחס סטטוטורי', '⅔ מהמתחם + 60% בכל בניין + 50% מהרכוש המשותף — חישוב חי מתוך סטטוסי החתמה ובעלות-%.', 'organizer', 'dev', 'Claude', 'backlog', '{5}'),
  (8,  'דשבורד מארגן', 'מפת חום בניינים (מעל/מתחת לרף) + גרף חתימות 90-יום מול יעד.', 'organizer', 'dev', 'Vision', 'backlog', '{6,7}'),
  (9,  'ריבוי פרויקטים למארגן', 'שבירת unique(building_id): מארגן מנהל כמה פרויקטים + מחליף פרויקט פעיל. השינוי הארכיטקטוני הכבד של הקמפיין.', 'organizer', 'dev', 'Claude', 'backlog', '{}'),
  (10, 'הזמנה גורפת + פג-תוקף', 'הזמנת דיירים בכמות + תוקף לקישורי הזמנה.', 'organizer', 'dev', 'Vision', 'backlog', '{}'),
  (11, 'אינטגרציית SMS', 'ספק ישראלי (019/InforU): שכבת שליחה + אישור שם-שולח. פתיחת החשבון = פעולה של יוסף; הפיתוח מתחיל מול sandbox.', 'comms', 'dev_external', 'Claude', 'backlog', '{}'),
  (12, 'מרכז Broadcast', 'שלח-עכשיו לקהלים (כולם/ועד/נציגים) + קבצים + תבניות {{משתנים}} ללקוח.', 'comms', 'dev', 'Claude', 'backlog', '{}'),
  (13, 'לוג תקשורת רב-ערוצי', 'טבלת משלוחים אחודה: ערוץ/נמען/סטטוס לכל הודעה (in-app/מייל/push/SMS).', 'comms', 'dev', 'Vision', 'backlog', '{12}'),
  (14, 'שדרוג סקרים', 'שאלות מרובות-בחירה + טקסט חופשי + בחירת קהל יעד.', 'comms', 'dev', 'Vision', 'backlog', '{}'),
  (15, 'WhatsApp Business API', 'דורש אישור Meta/BSP — תהליך ארוך; להתחיל רישום מוקדם ולשלב אחרי ה-SMS.', 'comms', 'dev_external', 'Yossef', 'waiting_yossef', '{11}'),
  (16, 'הקמת ישות סליקה', 'עוסק/חברה + חשבון סולק (zcredit או Paddle MoR) + חשבונית מס-קבלה. פעולה אנושית של יוסף בליווי שלנו. חוסם את 17-19.', 'payments', 'human', 'Yossef', 'waiting_yossef', '{}'),
  (17, 'מודול מנויים וחיוב', 'תוכניות + ניסיון + מכסות (פרויקטים/הודעות/אחסון) + חשבוניות. מחליף את ה-ledger המדומה באדמין.', 'payments', 'dev', 'Claude', 'backlog', '{16}'),
  (18, 'שערי תשלום במוצר', 'דוח יזם בתשלום + מנוי מארגן — חיבור השערים למודול החיוב.', 'payments', 'dev', 'Claude', 'backlog', '{17}'),
  (19, 'דמי-יחידה ליזם (Lock Gate כספי)', 'תשלום פר-יחידה שחוסם קידום שלב — משתלב במנוע 14 השלבים הקיים.', 'payments', 'dev', 'Vision', 'backlog', '{17}'),
  (20, 'צוותים — שיתוף בין חברות', 'שיתוף פרויקט בין ארגונים + מטריצת הרשאות פר-צוות (חתימות/מסמכים/משימות/פיננסים/תקשורת/audit).', 'collab', 'dev', 'Claude', 'backlog', '{}'),
  (21, 'דוח אפס לשמאי (תקן 21)', 'workflow שומות פר-יחידה ממולא אוטומטית מהמנוע הכלכלי והדאטה שלנו — בידול שאין למתחרה.', 'collab', 'dev', 'Claude', 'backlog', '{}'),
  (22, 'חילוץ AI מנסח טאבו', 'מילוי אוטומטי של פרויקט/בניין מנסח שהמשתמש מעלה (לעולם לא שולפים בעצמנו). pdftotext/tesseract קיימים.', 'collab', 'dev', 'Vision', 'backlog', '{}'),
  (23, 'צ''קליסט היתרים סטטוטוריים', '32 פריטים ב-6 שלבים: רשות מוסמכת + סטטוס פר-פריט (ממתין/הוגש/בבדיקה/אושר/נדחה/ערעור/פג).', 'collab', 'dev', 'Vision', 'backlog', '{}'),
  (24, 'חיבור וידג''ט ה-AI הצף', 'הוידג''ט קיים בקוד (AiAdvisorWidget) ולא מחובר לשום דף — עיגון ב-AppShell + הקשר עמוד.', 'quickwin', 'dev', 'Vision', 'backlog', '{}'),
  (25, 'חיפוש גלובלי ⌘K', 'command palette: פרויקט/דייר/מסמך.', 'quickwin', 'dev', 'Vision', 'backlog', '{}'),
  (26, 'שעות שקט + העדפות תצוגה', 'שעות שקט להתראות + theme אוטומטי + פורמטים.', 'quickwin', 'dev', 'Vision', 'backlog', '{}'),
  (27, 'ייצוא דוח-בניין ל-PDF', 'הדוח החי של הוועד כ-PDF להורדה/שיתוף.', 'quickwin', 'dev', 'Vision', 'backlog', '{}'),
  (28, 'גרסאות מסמכים + סינון לפי דייר', 'שרשרת גרסאות (v1,v2...) פר-מסמך + פילטר דייר ב-DocumentsHub.', 'quickwin', 'dev', 'Vision', 'backlog', '{}')
on conflict (seq) do nothing;
