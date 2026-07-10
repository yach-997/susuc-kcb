import { NavLink } from 'react-router-dom'

const items: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: '课表', end: true },
  { to: '/guide', label: '导入' },
  { to: '/settings', label: '设置' },
]

export function BottomNav() {
  return (
    <nav className="safe-bottom border-t border-line bg-white/95 backdrop-blur-md">
      <div className="mx-auto grid max-w-[480px] grid-cols-3 px-2 pt-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-medium transition ${
                isActive ? 'text-brand' : 'text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`h-1 w-6 rounded-full transition ${
                    isActive ? 'bg-brand' : 'bg-transparent'
                  }`}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
