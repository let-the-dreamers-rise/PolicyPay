import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useBackendStatus } from '../api/hooks'
import './TopBar.css'

const PAGE_META: Record<string, { title: string; summary: string }> = {
  '/dashboard': {
    title: 'Command deck',
    summary: 'Track policy posture, current settlement activity, and protocol readiness.',
  },
  '/policies': {
    title: 'Policy registry',
    summary: 'Review deployed controls or prepare a new rule set for submission.',
  },
  '/payments': {
    title: 'Settlement terminal',
    summary: 'Validate a payment path, review the decision, and execute the transaction.',
  },
  '/audit': {
    title: 'Audit evidence',
    summary: 'Inspect proof of compliance, replay metadata, and export the trail.',
  },
}

export default function TopBar() {
  const [time, setTime] = useState(new Date())
  const { pathname } = useLocation()
  const backendStatus = useBackendStatus()

  useEffect(() => {
    const interval = window.setInterval(() => setTime(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const meta = PAGE_META[pathname] ?? PAGE_META['/dashboard']

  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      }).format(time),
    [time],
  )

  return (
    <header className="topbar">
      <div className="topbar-copy">
        <span className="eyebrow">PolicyPay X workspace</span>
        <h1>{meta.title}</h1>
        <p>{meta.summary}</p>
      </div>

      <div className="topbar-meta">
        <div
          className={`status-chip ${
            backendStatus === 'connected'
              ? 'status-chip-live'
              : backendStatus === 'checking'
                ? 'status-chip-pending'
                : 'status-chip-muted'
          }`}
        >
          <span className="status-dot" />
          {backendStatus === 'connected'
            ? 'API live'
            : backendStatus === 'checking'
              ? 'Checking backend'
              : 'Demo fallback'}
        </div>
        <div className="status-chip status-chip-muted">Solana devnet</div>
        <time className="topbar-time" dateTime={time.toISOString()}>
          {timeLabel}
        </time>
      </div>
    </header>
  )
}
