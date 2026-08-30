import { useSyncExternalStore } from 'react'

const KEY = 'homeservices_admin_token'
let token = sessionStorage.getItem(KEY)
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

export const session = {
  get token() { return token },
  set(value: string) { token = value; sessionStorage.setItem(KEY, value); emit() },
  clear() { token = null; sessionStorage.removeItem(KEY); emit() },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
}

export function useSession() {
  return {
    token: useSyncExternalStore(session.subscribe, () => token),
    setToken: session.set,
    logout: session.clear,
  }
}
