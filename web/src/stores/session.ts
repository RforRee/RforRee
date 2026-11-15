import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Client, Warehouse } from '@/api/types'

const CLIENT_KEY = 'wms_client'
const WH_KEY = 'wms_warehouse'
const API_KEY = 'wms_api_key'
const OPERATOR_KEY = 'wms_operator'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export const useSessionStore = defineStore('session', () => {
  const client = ref<Client | null>(readJson<Client>(CLIENT_KEY))
  const warehouse = ref<Warehouse | null>(readJson<Warehouse>(WH_KEY))
  const apiKey = ref(localStorage.getItem(API_KEY) || '')
  const operator = ref(localStorage.getItem(OPERATOR_KEY) || '')

  const isAuthenticated = computed(() => Boolean(client.value && operator.value))

  function login(payload: {
    client: Client
    warehouse?: Warehouse | null
    operator: string
    apiKey?: string
  }) {
    client.value = payload.client
    warehouse.value = payload.warehouse ?? null
    operator.value = payload.operator.trim()
    apiKey.value = payload.apiKey?.trim() || ''

    localStorage.setItem(CLIENT_KEY, JSON.stringify(payload.client))
    if (payload.warehouse) {
      localStorage.setItem(WH_KEY, JSON.stringify(payload.warehouse))
    } else {
      localStorage.removeItem(WH_KEY)
    }
    localStorage.setItem(OPERATOR_KEY, operator.value)
    if (apiKey.value) localStorage.setItem(API_KEY, apiKey.value)
    else localStorage.removeItem(API_KEY)
  }

  function setWarehouse(wh: Warehouse | null) {
    warehouse.value = wh
    if (wh) localStorage.setItem(WH_KEY, JSON.stringify(wh))
    else localStorage.removeItem(WH_KEY)
  }

  function logout() {
    client.value = null
    warehouse.value = null
    operator.value = ''
    apiKey.value = ''
    localStorage.removeItem(CLIENT_KEY)
    localStorage.removeItem(WH_KEY)
    localStorage.removeItem(OPERATOR_KEY)
    localStorage.removeItem(API_KEY)
  }

  return {
    client,
    warehouse,
    apiKey,
    operator,
    isAuthenticated,
    login,
    setWarehouse,
    logout,
  }
})
