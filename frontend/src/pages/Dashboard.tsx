import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuditLogs, usePolicies } from '../api/hooks'
import { PARTNER_RAILS, getCountryLabel, normalizeBlockedCountries } from '../lib/referenceData'
import { formatCurrency, formatDateTime, formatRelativeTime, shortenAddress } from '../lib/format'
import './Dashboard.css'

function StatusPill({ status }: { status: 'confirmed' | 'failed' | 'pending' | 'submitted' }) {
  const label = status === 'submitted' ? 'submitted' : status
  return <span className={`data-badge data-badge-${status}`}>{label}</span>
}

export default function Dashboard() {
  const { policies, loading: loadingPolicies, isLive: policiesLive, error: policyError } = usePolicies()
  const { audits, loading: loadingAudits, isLive: auditsLive, error: auditError } = useAuditLogs(1, 8)

  const metrics = useMemo(() => {
    const policyCapacity = policies.reduce((sum, policy) => sum + policy.maxAmount, 0)
    const institutionCount = new Set(policies.map((policy) => policy.institutionId)).size
    const blockedCountries = policies.flatMap((policy) =>
      normalizeBlockedCountries(policy.blockedCountries),
    )

    const confirmed = audits.filter((audit) => audit.status === 'confirmed').length
    const failed = audits.filter((audit) => audit.status === 'failed').length
    const pending = audits.filter(
      (audit) => audit.status === 'pending' || audit.status === 'submitted',
    ).length
    const completed = confirmed + failed
    const passRate = completed > 0 ? Math.round((confirmed / completed) * 100) : 0
    const settledVolume = audits.reduce((sum, audit) => {
      const amount = Number(audit.inputSnapshot.amount ?? 0)
      return sum + amount
    }, 0)

    return {
      policyCapacity,
      institutionCount,
      blockedCount: new Set(blockedCountries).size,
      confirmed,
      failed,
      pending,
      passRate,
      settledVolume,
    }
  }, [audits, policies])

  const policyPressure = useMemo(
    () =>
      [...policies]
        .sort((left, right) => right.maxAmount - left.maxAmount)
        .slice(0, 4),
    [policies],
  )

  const blockedCorridors = useMemo(() => {
    const counts = new Map<number, number>()

    policies.forEach((policy) => {
      normalizeBlockedCountries(policy.blockedCountries).forEach((country) => {
        counts.set(country, (counts.get(country) ?? 0) + 1)
      })
    })

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
  }, [policies])

  const liveState = policiesLive || auditsLive ? 'Live data' : 'Demo data'
  const showPolicyEmpty = !loadingPolicies && policies.length === 0
  const showAuditEmpty = !loadingAudits && audits.length === 0

  return (
    <div className="page-shell dashboard-page">
      <section className="hero-panel dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="eyebrow">Operations snapshot</span>
          <h2>Policy, risk, and settlement now read as one system.</h2>
          <p>
            This workspace keeps the protocol story grounded in live controls:
            define policy, validate a corridor, decide against the rule set, then
            settle on Solana.
          </p>
          <div className="panel-actions">
            <Link className="button button-primary" to="/payments">
              Open settlement terminal
            </Link>
            <Link className="button button-ghost" to="/policies">
              Review policies
            </Link>
          </div>
        </div>

        <div className="protocol-lane">
          {[
            {
              step: 'Define',
              title: `${policies.length || 0} policy sets in force`,
              detail: 'Registry-backed limits, blocked jurisdictions, and travel-rule thresholds.',
            },
            {
              step: 'Validate',
              title: `${metrics.blockedCount} restricted jurisdictions watched`,
              detail: 'Attestation inputs and corridor rules are checked before money moves.',
            },
            {
              step: 'Decide',
              title: `${metrics.passRate}% pass rate on completed flows`,
              detail: 'Decision output explains why a quote clears or stops.',
            },
            {
              step: 'Settle',
              title: `${metrics.confirmed} confirmed transfers on record`,
              detail: 'Every successful execution is tied back to audit evidence.',
            },
          ].map((item) => (
            <article key={item.step} className="protocol-step">
              <span className="protocol-step-label">{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="metric-band">
        <article className="metric-band-item">
          <span className="metric-band-label">Total policy capacity</span>
          <strong>{formatCurrency(metrics.policyCapacity, true)}</strong>
          <p>{liveState}</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Decision pass rate</span>
          <strong>{metrics.passRate}%</strong>
          <p>{metrics.confirmed} confirmed | {metrics.failed} rejected</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Pending settlement queue</span>
          <strong>{metrics.pending}</strong>
          <p>{formatCurrency(metrics.settledVolume, true)} scanned in current feed</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Institutions covered</span>
          <strong>{metrics.institutionCount}</strong>
          <p>Operational nodes visible in the workspace</p>
        </article>
      </section>

      {(policyError || auditError) && (
        <div className="notice-banner">
          <span className="notice-banner-title">Frontend fallback active</span>
          <span>{policyError ?? auditError}</span>
        </div>
      )}

      <div className="dashboard-grid">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Recent decisions</span>
              <h3>Latest settlement outcomes</h3>
            </div>
            <Link className="button button-ghost button-small" to="/audit">
              View audit trail
            </Link>
          </div>

          {showAuditEmpty ? (
            <div className="empty-panel">
              <h4>No audit entries yet</h4>
              <p>
                Execute a payment or run a quote from the settlement terminal to
                populate the live audit stream.
              </p>
            </div>
          ) : (
            <div className="data-stack">
              {audits.map((audit) => {
                const amount = Number(audit.inputSnapshot.amount ?? 0)
                return (
                  <article key={audit.auditId} className="data-row">
                    <div className="data-row-main">
                      <div>
                        <p className="data-row-title">{audit.auditId}</p>
                        <p className="data-row-subtitle">{audit.decisionId}</p>
                      </div>
                      <div className="data-row-copy">
                        <span>{formatCurrency(amount)}</span>
                        <span>{formatRelativeTime(audit.createdAt)}</span>
                      </div>
                    </div>
                    <div className="data-row-meta">
                      <StatusPill status={audit.status} />
                      <span className="mono subtle-text">
                        {audit.onChainTxSig ? shortenAddress(audit.onChainTxSig, 8, 6) : 'No tx yet'}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="surface-panel dashboard-side-column">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Partner fabric</span>
              <h3>Mapped to the product brief</h3>
            </div>
          </div>

          <div className="partner-stack">
            {PARTNER_RAILS.map((partner) => (
              <article key={partner.name} className="partner-row">
                <div>
                  <p className="partner-name">{partner.name}</p>
                  <p className="partner-role">{partner.role}</p>
                </div>
                <p className="partner-detail">{partner.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-secondary">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Policy posture</span>
              <h3>Largest rule sets in force</h3>
            </div>
            <Link className="button button-ghost button-small" to="/policies">
              Open registry
            </Link>
          </div>

          {showPolicyEmpty ? (
            <div className="empty-panel">
              <h4>No live policies found</h4>
              <p>Create the first policy set from the registry page to start enforcing flows.</p>
            </div>
          ) : (
            <div className="data-stack">
              {policyPressure.map((policy) => (
                <article key={policy._id} className="policy-strip">
                  <div className="policy-strip-head">
                    <div>
                      <p className="data-row-title">
                        POL-{String(policy.policyId).padStart(3, '0')}
                      </p>
                      <p className="data-row-subtitle">{policy.institutionId}</p>
                    </div>
                    <span className="data-badge data-badge-neutral">
                      AML {policy.amlThreshold}
                    </span>
                  </div>
                  <div className="policy-strip-grid">
                    <div>
                      <span className="data-label">Ceiling</span>
                      <strong>{formatCurrency(policy.maxAmount)}</strong>
                    </div>
                    <div>
                      <span className="data-label">Travel rule</span>
                      <strong>
                        {policy.travelRuleRequired
                          ? formatCurrency(policy.travelRuleRequiredAmount)
                          : 'Not required'}
                      </strong>
                    </div>
                    <div>
                      <span className="data-label">Address</span>
                      <strong className="mono">
                        {shortenAddress(policy.onChainPolicyAddress)}
                      </strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Corridor blocks</span>
              <h3>Jurisdictions most frequently denied</h3>
            </div>
          </div>

          {blockedCorridors.length === 0 ? (
            <div className="empty-panel compact-empty">
              <h4>No blocked corridors configured</h4>
              <p>Policies will list restricted countries here once they are added.</p>
            </div>
          ) : (
            <div className="corridor-stack">
              {blockedCorridors.map(([country, count]) => (
                <article key={country} className="corridor-row">
                  <div>
                    <p className="data-row-title">{getCountryLabel(country)}</p>
                    <p className="data-row-subtitle">{count} policy sets reference this block</p>
                  </div>
                  <span className="corridor-count">{count}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="surface-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Activity timestamps</span>
            <h3>Latest feed with raw timing context</h3>
          </div>
        </div>

        <div className="timeline-grid">
          {audits.slice(0, 4).map((audit) => (
            <article key={audit.auditId} className="timeline-card">
              <span className="timeline-card-label">{audit.auditId}</span>
              <strong>{formatDateTime(audit.createdAt)}</strong>
              <p>
                {audit.onChainTxSig
                  ? `On-chain signature ${shortenAddress(audit.onChainTxSig, 8, 6)}`
                  : 'Awaiting transaction signature'}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
