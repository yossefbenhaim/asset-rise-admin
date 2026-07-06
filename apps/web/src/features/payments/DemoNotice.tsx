// Small banner clarifying that sc_payments is currently mock/demo data,
// structured for a future Stripe/PayPal webhook ingest. Keeps the page honest
// for stakeholders viewing the admin before real billing is wired.
import { Info } from 'lucide-react'

export function DemoNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-sc-card border border-sc-border bg-sc-gold/8 px-4 py-3 mb-4">
      <Info size={16} className="text-sc-gold mt-0.5 shrink-0" />
      <p className="text-[12.5px] leading-relaxed text-sc-text-secondary">
        <span className="font-bold text-sc-text">נתוני הדגמה.</span> טבלת התשלומים מוזנת כעת בנתוני
        דמו בלבד. המבנה כבר תואם ל-Webhook עתידי של Stripe / PayPal (ספק, מזהה עסקה וחותמות זמן), כך
        שברגע שהחיוב יחובר הנתונים האמיתיים יזרמו לכאן ללא שינוי במסך.
      </p>
    </div>
  )
}
