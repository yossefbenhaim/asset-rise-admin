// Tailwind reads --sc-* CSS vars from src/styles/tokens.css.
// Components can use either approach — utility classes or pre-baked .sc-btn classes.
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'sc-navy':          'var(--sc-navy)',
        'sc-primary':       'var(--sc-primary)',
        'sc-primary-light': 'var(--sc-primary-light)',
        'sc-light-blue':    'var(--sc-light-blue)',
        'sc-teal':          'var(--sc-teal)',
        'sc-gold':          'var(--sc-gold)',
        'sc-gold-light':    'var(--sc-gold-light)',
        'sc-cream':         'var(--sc-cream)',
        'sc-bg':            'var(--sc-bg)',
        'sc-card':          'var(--sc-card)',
        'sc-border':        'var(--sc-border)',
        'sc-border-strong': 'var(--sc-border-strong)',
        'sc-text':          'var(--sc-text)',
        'sc-text-secondary':'var(--sc-text-secondary)',
        'sc-text-muted':    'var(--sc-text-muted)',
        'sc-success':       'var(--sc-success)',
        'sc-success-bg':    'var(--sc-success-bg)',
        'sc-warning':       'var(--sc-warning)',
        'sc-warning-bg':    'var(--sc-warning-bg)',
        'sc-danger':        'var(--sc-danger)',
        'sc-danger-bg':     'var(--sc-danger-bg)',
      },
      fontFamily: {
        heebo: ['Heebo', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'sc-btn': '8px',
        'sc-input': '10px',
        'sc-card': '14px',
        'sc-pill': '999px',
      },
      boxShadow: {
        'sc-sm':   '0 2px 8px rgba(0,0,0,0.04)',
        'sc-card': '0 2px 12px rgba(0,0,0,0.06)',
        'sc-lg':   '0 8px 32px rgba(0,0,0,0.10)',
        'sc-xl':   '0 16px 48px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
