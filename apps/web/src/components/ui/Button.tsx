import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

const baseCls =
  'inline-flex items-center gap-2 font-semibold rounded-sc-btn transition-opacity disabled:opacity-50 disabled:cursor-not-allowed'

const variantCls: Record<Variant, string> = {
  primary: 'bg-sc-primary text-white shadow-[0_2px_8px_rgba(59,107,156,0.20)] hover:opacity-90',
  gold: 'bg-sc-gold text-white shadow-[0_2px_8px_rgba(139,111,71,0.20)] hover:opacity-90',
  secondary: 'bg-transparent text-sc-primary border border-sc-primary hover:bg-sc-light-blue',
  ghost: 'bg-transparent text-sc-text-secondary border border-transparent hover:bg-sc-bg hover:text-sc-text',
  danger: 'bg-white text-sc-danger border border-sc-danger hover:bg-sc-danger-bg',
}

const sizeCls: Record<Size, string> = {
  sm: 'text-[12px] px-3 py-1.5',
  md: 'text-[13px] px-4 py-2.5',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={`${baseCls} ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
