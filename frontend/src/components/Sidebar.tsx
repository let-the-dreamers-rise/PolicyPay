import { NavLink } from 'react-router-dom'
import './Sidebar.css'

type IconName = 'dashboard' | 'policies' | 'payments' | 'audit'

const navItems: Array<{
  path: string
  label: string
  description: string
  icon: IconName
}> = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    description: 'Operations picture',
    icon: 'dashboard',
  },
  {
    path: '/policies',
    label: 'Policies',
    description: 'Rule registry',
    icon: 'policies',
  },
  {
    path: '/payments',
    label: 'Payments',
    description: 'Validation and settlement',
    icon: 'payments',
  },
  {
    path: '/audit',
    label: 'Audit trail',
    description: 'Evidence and recovery',
    icon: 'audit',
  },
]

function NavIcon({ name }: { name: IconName }) {
  switch (name) {
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 13h6V5H4v8Zm10 6h6V5h-6v14ZM4 19h6v-4H4v4Zm10 0h6v-8h-6v8Z" />
        </svg>
      )
    case 'policies':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 2 7 4v6c0 5-3.5 8.4-7 10-3.5-1.6-7-5-7-10V6l7-4Zm0 4.2-3 1.7v4.1c0 2.8 1.7 5.1 3 6.4 1.3-1.3 3-3.6 3-6.4V7.9l-3-1.7Z" />
        </svg>
      )
    case 'payments':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16v10H4V7Zm2 2v6h12V9H6Zm7 9h7v2h-7v-2ZM4 18h7v2H4v-2Z" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 4 7v5c0 5.1 3.4 8.8 8 10 4.6-1.2 8-4.9 8-10V7l-8-4Zm0 4 4 2v3c0 2.9-1.6 5.3-4 6.6-2.4-1.3-4-3.7-4-6.6V9l4-2Zm-1 3v5l4-2.5L11 10Z" />
        </svg>
      )
  }
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">PX</div>
        <div>
          <p className="sidebar-brand-name">PolicyPay X</p>
          <p className="sidebar-brand-copy">Programmable compliance settlement</p>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-link${isActive ? ' sidebar-link-active' : ''}`
            }
          >
            <span className="sidebar-link-icon">
              <NavIcon name={item.icon} />
            </span>
            <span className="sidebar-link-copy">
              <span className="sidebar-link-label">{item.label}</span>
              <span className="sidebar-link-description">{item.description}</span>
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="status-chip status-chip-muted">Institutional stablecoin ops</span>
        <p>
          Settlement is the enforcement point. Every screen in this workspace
          supports define, validate, decide, and execute.
        </p>
      </div>
    </aside>
  )
}
