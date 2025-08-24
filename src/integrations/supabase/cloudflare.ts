import { supabase } from './client'

export interface CloudflareAnalytics {
  success: boolean
  result: {
    totals: {
      requests: { all: number; cached: number; uncached: number }
      bandwidth: { all: number; cached: number; uncached: number }
      threats: { all: number; type: Record<string, number> }
      pageviews: { all: number; search_engines: Record<string, number> }
      uniques: { all: number }
    }
    timeseries: Array<{
      since: string
      until: string
      requests: { all: number; cached: number; uncached: number }
      bandwidth: { all: number; cached: number; uncached: number }
      threats: { all: number; type: Record<string, number> }
      pageviews: { all: number; search_engines: Record<string, number> }
      uniques: { all: number }
    }>
  }
}

export interface CloudflareZoneInfo {
  success: boolean
  result: {
    id: string
    name: string
    status: string
    paused: boolean
    type: string
    development_mode: number
    name_servers: string[]
    original_name_servers: string[]
    original_registrar: string
    original_dnshost: string
    modified_on: string
    created_on: string
    activated_on: string
    meta: {
      step: number
      wildcard_proxiable: boolean
      custom_certificate_quota: number
      page_rule_quota: number
      phishing_detected: boolean
      multiple_railguns_allowed: boolean
    }
    plan: {
      id: string
      name: string
      price: number
      currency: string
      frequency: string
      is_subscribed: boolean
      can_subscribe: boolean
      legacy_id: string
      legacy_discount: boolean
      externally_managed: boolean
    }
  }
}

export interface CloudflareSecuritySettings {
  success: boolean
  result: {
    security_level: { id: string; value: string; editable: boolean; modified_on: string }
    ssl: { id: string; value: string; editable: boolean; modified_on: string }
    always_use_https: { id: string; value: string; editable: boolean; modified_on: string }
    min_tls_version: { id: string; value: string; editable: boolean; modified_on: string }
  }
}

export interface CloudflarePerformanceSettings {
  success: boolean
  result: {
    browser_cache_ttl: { id: string; value: number; editable: boolean; modified_on: string }
    cache_level: { id: string; value: string; editable: boolean; modified_on: string }
    development_mode: { id: string; value: string; editable: boolean; modified_on: string }
    minify: { 
      id: string
      value: { css: string; html: string; js: string }
      editable: boolean
      modified_on: string 
    }
  }
}

export class CloudflareAPI {
  private async makeRequest(action: string, params?: Record<string, string>) {
    const searchParams = new URLSearchParams({ action, ...params })
    
    const { data, error } = await supabase.functions.invoke('cloudflare-api', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (error) throw error
    return data
  }

  async getZoneInfo(): Promise<CloudflareZoneInfo> {
    return this.makeRequest('zone-info')
  }

  async getAnalytics(since?: string, until?: string): Promise<CloudflareAnalytics> {
    const params: Record<string, string> = {}
    if (since) params.since = since
    if (until) params.until = until
    return this.makeRequest('analytics', params)
  }

  async getDNSRecords() {
    return this.makeRequest('dns-records')
  }

  async getPageRules() {
    return this.makeRequest('page-rules')
  }

  async getCacheStats() {
    return this.makeRequest('cache-stats')
  }

  async getSecuritySettings(): Promise<CloudflareSecuritySettings> {
    return this.makeRequest('security-settings')
  }

  async getPerformanceSettings(): Promise<CloudflarePerformanceSettings> {
    return this.makeRequest('performance-settings')
  }

  async getBandwidthStats(since?: string, until?: string) {
    const params: Record<string, string> = {}
    if (since) params.since = since
    if (until) params.until = until
    return this.makeRequest('bandwidth-stats', params)
  }

  async getThreatAnalytics(since?: string, until?: string) {
    const params: Record<string, string> = {}
    if (since) params.since = since
    if (until) params.until = until
    return this.makeRequest('threat-analytics', params)
  }

  async getEdgeCertificates() {
    return this.makeRequest('edge-certificates')
  }

  async getWorkers() {
    return this.makeRequest('workers')
  }

  async getAccountInfo() {
    return this.makeRequest('account-info')
  }
}

export const cloudflareAPI = new CloudflareAPI()