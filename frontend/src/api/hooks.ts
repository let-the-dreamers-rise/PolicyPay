import { useCallback, useEffect, useState } from 'react'
import { api, DEMO_AUDIT_LOGS, DEMO_POLICIES } from './client'
import type { AuditLogDoc, PolicyDoc } from './client'

type ConnectionStatus = 'checking' | 'connected' | 'demo'
const EMPTY_POLICY_MESSAGE = 'Backend is running, but no policies exist yet. Showing demo data.'

export function useBackendStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('checking')

  useEffect(() => {
    let active = true

    const checkStatus = async () => {
      const ok = await api.healthCheck()
      if (active) {
        setStatus(ok ? 'connected' : 'demo')
      }
    }

    void checkStatus()
    const interval = window.setInterval(checkStatus, 30000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  return status
}

interface ResourceState<T> {
  data: T
  loading: boolean
  isLive: boolean
  error: string | null
}

function mapPoliciesState(policies: PolicyDoc[]): ResourceState<PolicyDoc[]> {
  if (policies.length === 0) {
    return {
      data: DEMO_POLICIES,
      loading: false,
      isLive: false,
      error: EMPTY_POLICY_MESSAGE,
    }
  }

  return {
    data: policies,
    loading: false,
    isLive: true,
    error: null,
  }
}

export function usePolicies() {
  const [state, setState] = useState<ResourceState<PolicyDoc[]>>({
    data: [],
    loading: true,
    isLive: false,
    error: null,
  })

  const loadPolicies = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }))

    try {
      const response = await api.getPolicies()
      setState(mapPoliciesState(response.policies))
    } catch (error) {
      setState({
        data: DEMO_POLICIES,
        loading: false,
        isLive: false,
        error: error instanceof Error ? error.message : 'Unable to load policies',
      })
    }
  }, [])

  useEffect(() => {
    let active = true

    const fetchPolicies = async () => {
      try {
        const response = await api.getPolicies()
        if (!active) return
        setState(mapPoliciesState(response.policies))
      } catch (error) {
        if (!active) return
        setState({
          data: DEMO_POLICIES,
          loading: false,
          isLive: false,
          error: error instanceof Error ? error.message : 'Unable to load policies',
        })
      }
    }

    void fetchPolicies()

    return () => {
      active = false
    }
  }, [])

  return {
    policies: state.data,
    loading: state.loading,
    isLive: state.isLive,
    error: state.error,
    refetch: loadPolicies,
  }
}

export function useAuditLogs(page: number, limit = 12) {
  const [state, setState] = useState<
    ResourceState<AuditLogDoc[]> & {
      pagination: { page: number; total: number; pages: number; limit: number }
    }
  >({
    data: [],
    loading: true,
    isLive: false,
    error: null,
    pagination: { page: 1, total: 0, pages: 1, limit },
  })

  useEffect(() => {
    let active = true

    const loadAudits = async () => {
      setState((current) => ({ ...current, loading: true, error: null }))

      try {
        const response = await api.getAuditLogs(page, limit)
        if (!active) return

        if (response.audits.length === 0) {
          const start = (page - 1) * limit
          setState({
            data: DEMO_AUDIT_LOGS.slice(start, start + limit),
            loading: false,
            isLive: false,
            error: 'Backend is running, but the audit trail is empty. Showing demo data.',
            pagination: {
              page,
              total: DEMO_AUDIT_LOGS.length,
              pages: Math.max(1, Math.ceil(DEMO_AUDIT_LOGS.length / limit)),
              limit,
            },
          })
          return
        }

        setState({
          data: response.audits,
          loading: false,
          isLive: true,
          error: null,
          pagination: {
            page: response.pagination.page,
            total: response.pagination.total,
            pages: response.pagination.pages,
            limit: response.pagination.limit,
          },
        })
      } catch (error) {
        if (!active) return

        const start = (page - 1) * limit
        setState({
          data: DEMO_AUDIT_LOGS.slice(start, start + limit),
          loading: false,
          isLive: false,
          error: error instanceof Error ? error.message : 'Unable to load audit trail',
          pagination: {
            page,
            total: DEMO_AUDIT_LOGS.length,
            pages: Math.max(1, Math.ceil(DEMO_AUDIT_LOGS.length / limit)),
            limit,
          },
        })
      }
    }

    void loadAudits()

    return () => {
      active = false
    }
  }, [limit, page])

  return {
    audits: state.data,
    pagination: state.pagination,
    loading: state.loading,
    isLive: state.isLive,
    error: state.error,
  }
}
