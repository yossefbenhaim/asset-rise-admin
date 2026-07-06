// Global Cmd+K command palette (cmdk). Phase-0: fast navigation to any screen
// the current admin can see. Global entity search (address/user/report/gush-helka)
// is wired in a later phase by adding async result groups here.
import { useEffect } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { ADMIN_NAV } from '@/lib/nav/config'
import { useRoleKeys } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { useUi } from '@/lib/store'

export function CommandPalette() {
  const open = useUi(s => s.cmdkOpen)
  const setOpen = useUi(s => s.setCmdkOpen)
  const roleKeys = useRoleKeys()
  const nav = useNavigate()

  // Global Cmd/Ctrl+K toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useUi.getState().cmdkOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const groups = ADMIN_NAV.map(g => ({
    ...g,
    items: g.items.filter(it => !it.requires || it.requires.every(r => can(roleKeys, r))),
  })).filter(g => g.items.length > 0)

  const go = (to: string) => {
    setOpen(false)
    nav(to)
  }

  return (
    <>
      <Command.Dialog open={open} onOpenChange={setOpen} label="חיפוש ופקודות" dir="rtl">
        <Command.Input placeholder="חיפוש מסך, פעולה…" />
        <Command.List>
          <Command.Empty>לא נמצאו תוצאות.</Command.Empty>
          {groups.map(g => (
            <Command.Group key={g.group} heading={g.group}>
              {g.items.map(it => (
                <Command.Item key={it.id} value={`${it.label} ${it.to}`} onSelect={() => go(it.to)}>
                  {it.label}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
      <style>{`
        [cmdk-overlay]{ position:fixed; inset:0; background:rgba(8,14,24,.55); backdrop-filter:blur(2px); z-index:60; }
        [cmdk-dialog]{ position:fixed; z-index:61; top:14vh; left:50%; transform:translateX(-50%); width:min(560px,92vw);
          background:var(--sc-card); border:1px solid var(--sc-border); border-radius:16px; box-shadow:var(--sc-shadow-xl); overflow:hidden; }
        [cmdk-input]{ width:100%; border:0; outline:0; background:transparent; color:var(--sc-text);
          font-family:var(--sc-font); font-size:15px; padding:16px 18px; border-bottom:1px solid var(--sc-border); }
        [cmdk-list]{ max-height:50vh; overflow:auto; padding:8px; }
        [cmdk-group-heading]{ font-size:11px; font-weight:700; color:var(--sc-text-muted); padding:8px 10px 4px; }
        [cmdk-item]{ display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; cursor:pointer;
          color:var(--sc-text); font-size:14px; }
        [cmdk-item][data-selected="true"]{ background:var(--sc-light-blue); color:var(--sc-primary); }
        [cmdk-empty]{ padding:24px; text-align:center; color:var(--sc-text-muted); font-size:13px; }
      `}</style>
    </>
  )
}
