import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'

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

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [isSupported] = useState(() => 'Notification' in window && 'serviceWorker' in navigator)
  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'denied'
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [enabledTypes, setEnabledTypes] = useState<string[]>([
    'course_distance_specialist',
    'trainer_intent',
    'market_movement'
  ])

  useEffect(() => {
    if (isSupported && permission === 'granted') {
      checkSubscriptionStatus()
    }
  }, [isSupported, permission, user])

  const checkSubscriptionStatus = async () => {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      setIsSubscribed(!!subscription)
    } catch (error) {
      console.error('Error checking subscription status:', error)
    }
  }

  const requestPermission = async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn('Push notifications are not supported')
      return false
    }

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
    if (!isSupported || permission !== 'granted' || !user) {
      return false
    }

    try {
      const registration = await navigator.serviceWorker.ready
      
      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription()
      
      if (!subscription) {
        // Subscribe to push notifications
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: null // You would normally use VAPID keys here
        })
      }

      if (subscription) {
        // Store subscription in database (you could implement this)
        // await supabase.from('notification_subscriptions').upsert({
        //   user_id: user.id,
        //   subscription_data: JSON.stringify(subscription),
        //   enabled_types: enabledTypes
        // })
        
        setIsSubscribed(true)
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error subscribing to push notifications:', error)
      return false
    }
  }

  const unsubscribe = async (): Promise<boolean> => {
    if (!isSupported || !user) {
      return false
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      
      if (subscription) {
        await subscription.unsubscribe()
        // Remove from database
        // await supabase.from('notification_subscriptions')
        //   .delete()
        //   .eq('user_id', user.id)
      }
      
      setIsSubscribed(false)
      return true
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error)
      return false
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
        setEnabledTypes
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