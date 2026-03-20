import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

interface NotificationContextType {
  isSupported: boolean
  permission: NotificationPermission
  isSubscribed: boolean
  requestPermission: () => Promise<boolean>
  subscribe: () => Promise<boolean>
  unsubscribe: () => Promise<boolean>
  enabledTypes: string[]
  setEnabledTypes: (types: string[]) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [isSupported] = useState(() =>
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC_KEY
  )
  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'denied'
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [enabledTypes, setEnabledTypesState] = useState<string[]>([
    'smart_money',
    'top_picks',
    'market_movement',
  ])

  const checkSubscriptionStatus = useCallback(async () => {
    if (!isSupported || !user) return
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const { data } = await supabase
          .from('push_subscriptions')
          .select('id, enabled_types')
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint)
          .maybeSingle()
        setIsSubscribed(!!data)
        if (data?.enabled_types) setEnabledTypesState(data.enabled_types)
      } else {
        setIsSubscribed(false)
      }
    } catch (error) {
      console.error('Error checking subscription status:', error)
    }
  }, [isSupported, user])

  useEffect(() => {
    if (isSupported && permission === 'granted' && user) {
      checkSubscriptionStatus()
    }
  }, [isSupported, permission, user, checkSubscriptionStatus])

  const requestPermission = async (): Promise<boolean> => {
    if (!isSupported) return false
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result === 'granted'
    } catch (error) {
      console.error('Error requesting notification permission:', error)
      return false
    }
  }

  const subscribe = async (): Promise<boolean> => {
    if (!isSupported || permission !== 'granted' || !user || !VAPID_PUBLIC_KEY) return false

    try {
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      if (!subscription) return false

      const keys = subscription.toJSON().keys
      if (!keys?.p256dh || !keys?.auth) {
        console.error('Subscription missing keys')
        return false
      }

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          enabled_types: enabledTypes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' }
      )

      if (error) {
        console.error('Error storing subscription:', error)
        return false
      }

      setIsSubscribed(true)
      return true
    } catch (error) {
      console.error('Error subscribing to push notifications:', error)
      return false
    }
  }

  const unsubscribe = async (): Promise<boolean> => {
    if (!isSupported || !user) return false

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await subscription.unsubscribe()
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint)
      }

      setIsSubscribed(false)
      return true
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error)
      return false
    }
  }

  const setEnabledTypes = async (types: string[]) => {
    setEnabledTypesState(types)
    if (!user || !isSubscribed) return
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await supabase
          .from('push_subscriptions')
          .update({ enabled_types: types, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint)
      }
    } catch (error) {
      console.error('Error updating enabled types:', error)
    }
  }

  return (
    <NotificationContext.Provider
      value={{
        isSupported,
        permission,
        isSubscribed,
        requestPermission,
        subscribe,
        unsubscribe,
        enabledTypes,
        setEnabledTypes,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}
