import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api/client'
import type { CreatePolicyRequest, PolicyDoc } from '../api/client'
import { useBackendStatus, usePolicies } from '../api/hooks'
import {
  COUNTRY_OPTIONS,
  getCountryLabel,
  normalizeBlockedCountries,
} from '../lib/referenceData'
import { formatCurrency, formatDateTime, shortenAddress } from '../lib/format'
import './Policies.css'

type PanelMode = 'detail' | 'create'

function emptyDraft(nextPolicyId: number): CreatePolicyRequest {
  return {
    institutionId: '',
    institutionSecretKey: '',
    policyId: nextPolicyId,
    maxAmount: 250000,
    requireKyc: true,
    amlThreshold: 45,
    blockedCountries: [7, 8],
    travelRuleRequired: true,
    travelRuleRequiredAmount: 1000,
  }
}

function PolicyRow({
  policy,
  selected,
  onSelect,
}: {
  policy: PolicyDoc
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`policy-row${selected ? ' policy-row-selected' : ''}`}
      onClick={onSelect}
    >
      <div className="policy-row-main">
        <div>
          <p className="policy-row-title">
            POL-{String(policy.policyId).padStart(3, '0')}
          </p>
          <p className="policy-row-subtitle">{policy.institutionId}</p>
        </div>
        <span className="data-badge data-badge-neutral">AML {policy.amlThreshold}</span>
      </div>

      <div className="policy-row-grid">
        <div>
          <span className="data-label">Max amount</span>
          <strong>{formatCurrency(policy.maxAmount)}</strong>
        </div>
        <div>
          <span className="data-label">Travel rule</span>
          <strong>
            {policy.travelRuleRequired
              ? formatCurrency(policy.travelRuleRequiredAmount)
              : 'Off'}
          </strong>
        </div>
        <div>
          <span className="data-label">Blocked</span>
          <strong>{normalizeBlockedCountries(policy.blockedCountries).length}</strong>
        </div>
      </div>
    </button>
  )
}

export default function Policies() {
  const backendStatus = useBackendStatus()
  const { policies, loading, isLive, error, refetch } = usePolicies()

  const [panelMode, setPanelMode] = useState<PanelMode>('detail')
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CreatePolicyRequest>(() => emptyDraft(1))
  const [submitState, setSubmitState] = useState<{
    loading: boolean
    error: string | null
    success: string | null
  }>({
    loading: false,
    error: null,
    success: null,
  })

  const nextPolicyId = useMemo(() => {
    if (policies.length === 0) return 1
    return Math.max(...policies.map((policy) => policy.policyId)) + 1
  }, [policies])

  const effectiveSelectedPolicyId = selectedPolicyId ?? policies[0]?._id ?? null
  const selectedPolicy =
    policies.find((policy) => policy._id === effectiveSelectedPolicyId) ?? policies[0] ?? null

  const summary = useMemo(() => {
    const capacity = policies.reduce((sum, policy) => sum + policy.maxAmount, 0)
    const strictestThreshold =
      policies.length > 0 ? Math.min(...policies.map((policy) => policy.amlThreshold)) : 0
    const blockedCoverage = new Set(
      policies.flatMap((policy) => normalizeBlockedCountries(policy.blockedCountries)),
    ).size

    return { capacity, strictestThreshold, blockedCoverage }
  }, [policies])

  const toggleBlockedCountry = (countryCode: number) => {
    setDraft((current) => {
      const exists = current.blockedCountries.includes(countryCode)
      return {
        ...current,
        blockedCountries: exists
          ? current.blockedCountries.filter((code) => code !== countryCode)
          : [...current.blockedCountries, countryCode],
      }
    })
  }

  const updateDraft = <K extends keyof CreatePolicyRequest>(
    key: K,
    value: CreatePolicyRequest[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const handleCreatePolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitState({ loading: true, error: null, success: null })

    if (backendStatus !== 'connected') {
      setSubmitState({
        loading: false,
        error: 'Policy creation requires the backend, MongoDB, and on-chain config to be running.',
        success: null,
      })
      return
    }

    try {
      const response = await api.createPolicy({
        ...draft,
        blockedCountries: [...draft.blockedCountries].sort((left, right) => left - right),
      })
      await refetch()
      setSelectedPolicyId(response.policy._id)
      setPanelMode('detail')
      setDraft(emptyDraft(Math.max(nextPolicyId + 1, response.policy.policyId + 1)))
      setSubmitState({
        loading: false,
        error: null,
        success: `Policy ${response.policy.policyId} submitted successfully.`,
      })
    } catch (submitError) {
      setSubmitState({
        loading: false,
        error:
          submitError instanceof Error
            ? submitError.message
            : 'Unable to create the policy.',
        success: null,
      })
    }
  }

  return (
    <div className="page-shell policies-page">
      <section className="metric-band">
        <article className="metric-band-item">
          <span className="metric-band-label">Policies in registry</span>
          <strong>{policies.length}</strong>
          <p>{isLive ? 'Connected to backend' : 'Using fallback registry'}</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Total notional capacity</span>
          <strong>{formatCurrency(summary.capacity, true)}</strong>
          <p>Combined maximum across all active rules</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Strictest AML threshold</span>
          <strong>{policies.length > 0 ? summary.strictestThreshold : 'n/a'}</strong>
          <p>Lowest configured cutoff currently enforced</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Blocked jurisdictions</span>
          <strong>{summary.blockedCoverage}</strong>
          <p>Unique country codes referenced by policy blocks</p>
        </article>
      </section>

      {(error || submitState.error || submitState.success) && (
        <div className="notice-banner">
          <span className="notice-banner-title">
            {submitState.success ? 'Registry updated' : 'Registry note'}
          </span>
          <span>{submitState.success ?? submitState.error ?? error}</span>
        </div>
      )}

      <div className="policies-layout">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Rule registry</span>
              <h3>Deployed compliance policies</h3>
            </div>
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={() => setPanelMode('create')}
            >
              Create policy
            </button>
          </div>

          {loading ? (
            <div className="empty-panel">
              <h4>Loading policies</h4>
              <p>Reading the current registry and rule posture.</p>
            </div>
          ) : policies.length === 0 ? (
            <div className="empty-panel">
              <h4>No policies deployed yet</h4>
              <p>Use the create panel to publish the first rule set for this workspace.</p>
            </div>
          ) : (
            <div className="policy-list">
              {policies.map((policy) => (
                <PolicyRow
                  key={policy._id}
                  policy={policy}
                  selected={policy._id === effectiveSelectedPolicyId}
                  onSelect={() => {
                    setSelectedPolicyId(policy._id)
                    setPanelMode('detail')
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section className="surface-panel detail-panel">
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-control-item${
                panelMode === 'detail' ? ' segmented-control-item-active' : ''
              }`}
              onClick={() => setPanelMode('detail')}
            >
              Selected policy
            </button>
            <button
              type="button"
              className={`segmented-control-item${
                panelMode === 'create' ? ' segmented-control-item-active' : ''
              }`}
              onClick={() => {
                setDraft(emptyDraft(nextPolicyId))
                setPanelMode('create')
              }}
            >
              Create new
            </button>
          </div>

          {panelMode === 'detail' && selectedPolicy ? (
            <div className="policy-detail">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Selected rule set</span>
                  <h3>{selectedPolicy.institutionId}</h3>
                </div>
                <span className="data-badge data-badge-neutral">
                  POL-{String(selectedPolicy.policyId).padStart(3, '0')}
                </span>
              </div>

              <div className="detail-block">
                <span className="data-label">On-chain policy address</span>
                <strong className="mono">{selectedPolicy.onChainPolicyAddress}</strong>
              </div>

              <div className="detail-grid">
                <article className="detail-tile">
                  <span className="data-label">Max amount</span>
                  <strong>{formatCurrency(selectedPolicy.maxAmount)}</strong>
                </article>
                <article className="detail-tile">
                  <span className="data-label">AML threshold</span>
                  <strong>{selectedPolicy.amlThreshold}</strong>
                </article>
                <article className="detail-tile">
                  <span className="data-label">KYC required</span>
                  <strong>{selectedPolicy.requireKyc ? 'Required' : 'Optional'}</strong>
                </article>
                <article className="detail-tile">
                  <span className="data-label">Travel rule trigger</span>
                  <strong>
                    {selectedPolicy.travelRuleRequired
                      ? formatCurrency(selectedPolicy.travelRuleRequiredAmount)
                      : 'Not required'}
                  </strong>
                </article>
              </div>

              <div className="detail-block">
                <span className="data-label">Blocked countries</span>
                <div className="chip-row">
                  {normalizeBlockedCountries(selectedPolicy.blockedCountries).length === 0 ? (
                    <span className="inline-note">No blocked jurisdictions configured.</span>
                  ) : (
                    normalizeBlockedCountries(selectedPolicy.blockedCountries).map((country) => (
                      <span key={country} className="selection-chip selection-chip-active">
                        {getCountryLabel(country)}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="detail-block">
                <span className="data-label">Created</span>
                <strong>{formatDateTime(selectedPolicy.createdAt)}</strong>
              </div>

              <div className="detail-block">
                <span className="data-label">Address preview</span>
                <strong>{shortenAddress(selectedPolicy.onChainPolicyAddress, 10, 8)}</strong>
              </div>
            </div>
          ) : (
            <form className="policy-form" onSubmit={handleCreatePolicy}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Create rule set</span>
                  <h3>Publish a new policy</h3>
                </div>
                <span className="data-badge data-badge-neutral">
                  {backendStatus === 'connected' ? 'Backend ready' : 'Backend required'}
                </span>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span className="label">Institution ID</span>
                  <input
                    className="input"
                    value={draft.institutionId}
                    onChange={(event) => updateDraft('institutionId', event.target.value)}
                    placeholder="AMINA Bank Zurich"
                    required
                  />
                </label>
                <label className="field">
                  <span className="label">Policy ID</span>
                  <input
                    type="number"
                    className="input"
                    value={draft.policyId}
                    onChange={(event) =>
                      updateDraft('policyId', Number(event.target.value || nextPolicyId))
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span className="label">Max amount (USDC)</span>
                  <input
                    type="number"
                    className="input"
                    value={draft.maxAmount}
                    onChange={(event) =>
                      updateDraft('maxAmount', Number(event.target.value || 0))
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span className="label">AML threshold</span>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    className="input"
                    value={draft.amlThreshold}
                    onChange={(event) =>
                      updateDraft('amlThreshold', Number(event.target.value || 0))
                    }
                    required
                  />
                </label>
                <label className="field field-full">
                  <span className="label">Institution secret key</span>
                  <input
                    type="password"
                    className="input"
                    value={draft.institutionSecretKey}
                    onChange={(event) =>
                      updateDraft('institutionSecretKey', event.target.value)
                    }
                    placeholder="Hackathon demo only"
                    required
                  />
                  <span className="field-note">
                    This is only used because the backend route signs on behalf of the institution.
                  </span>
                </label>
              </div>

              <div className="switch-grid">
                <label className="switch-row">
                  <div>
                    <span className="label">Require KYC</span>
                    <p>KYC must pass before the payment can proceed.</p>
                  </div>
                  <button
                    type="button"
                    className={`switch${draft.requireKyc ? ' switch-active' : ''}`}
                    onClick={() => updateDraft('requireKyc', !draft.requireKyc)}
                    aria-pressed={draft.requireKyc}
                  >
                    <span />
                  </button>
                </label>
                <label className="switch-row">
                  <div>
                    <span className="label">Travel rule required</span>
                    <p>Trigger travel-rule fields above the configured threshold.</p>
                  </div>
                  <button
                    type="button"
                    className={`switch${draft.travelRuleRequired ? ' switch-active' : ''}`}
                    onClick={() =>
                      updateDraft('travelRuleRequired', !draft.travelRuleRequired)
                    }
                    aria-pressed={draft.travelRuleRequired}
                  >
                    <span />
                  </button>
                </label>
              </div>

              <label className="field">
                <span className="label">Travel rule threshold</span>
                <input
                  type="number"
                  className="input"
                  value={draft.travelRuleRequiredAmount}
                  onChange={(event) =>
                    updateDraft('travelRuleRequiredAmount', Number(event.target.value || 0))
                  }
                  required
                />
              </label>

              <div className="field">
                <span className="label">Blocked countries</span>
                <div className="chip-row">
                  {COUNTRY_OPTIONS.map((country) => {
                    const selected = draft.blockedCountries.includes(country.code)
                    return (
                      <button
                        key={country.code}
                        type="button"
                        className={`selection-chip${
                          selected ? ' selection-chip-active' : ''
                        }`}
                        onClick={() => toggleBlockedCountry(country.code)}
                      >
                        {country.iso2} - {country.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="panel-actions">
                <button className="button button-primary" type="submit" disabled={submitState.loading}>
                  {submitState.loading ? 'Submitting policy...' : 'Submit policy'}
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setDraft(emptyDraft(nextPolicyId))}
                >
                  Reset form
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
