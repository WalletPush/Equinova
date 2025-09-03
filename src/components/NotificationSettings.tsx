import React from 'react'
import { useNotifications } from '@/contexts/NotificationContext'
import { Bell, BellOff, Check, AlertCircle, Target, Eye, TrendingUp } from 'lucide-react'

export function NotificationSettings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    requestPermission,
    subscribe,
    unsubscribe,
    enabledTypes,
    setEnabledTypes
  } = useNotifications()

  const handlePermissionRequest = async () => {
    const granted = await requestPermission()
    if (granted) {
      await subscribe()
    }
  }

  const handleToggleSubscription = async () => {
    if (isSubscribed) {
      await unsubscribe()
    } else {
      await subscribe()
    }
  }

  const handleToggleAlertType = (type: string) => {
    if (enabledTypes.includes(type)) {
      setEnabledTypes(enabledTypes.filter(t => t !== type))
    } else {
      setEnabledTypes([...enabledTypes, type])
    }
  }

  const alertTypes = [
    {
      id: 'course_distance_specialist',
      name: 'Course & Distance Specialists',
      description: 'Notifications when high-confidence specialists are identified',
      icon: Target,
      color: 'text-green-400'
    },
    {
      id: 'trainer_intent',
      name: 'Trainer Intent Signals',
      description: 'Alerts for single runner patterns indicating strong trainer intent',
      icon: Eye,
      color: 'text-blue-400'
    },
    {
      id: 'market_movement',
      name: 'Market Movements',
      description: 'Significant odds changes and market activity alerts',
      icon: TrendingUp,
      color: 'text-yellow-400'
    }
  ]

  if (!isSupported) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center space-x-3 mb-4">
          <BellOff className="w-6 h-6 text-gray-400" />
          <h3 className="text-lg font-bold text-white">Push Notifications</h3>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-orange-400">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Not Supported</span>
          </div>
          <p className="text-orange-300 text-sm mt-2">
            Push notifications are not supported in your current browser or environment.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center space-x-3 mb-6">
        <Bell className="w-6 h-6 text-yellow-400" />
        <h3 className="text-lg font-bold text-white">Push Notifications</h3>
      </div>

      {/* Permission Status */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-medium text-white mb-1">Notification Permission</h4>
            <p className="text-sm text-gray-400">
              Allow EquiNova to send you push notifications for racing insights
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {permission === 'granted' ? (
              <>
                <div className="flex items-center space-x-2 text-green-400">
                  <Check className="w-5 h-5" />
                  <span className="text-sm font-medium">Granted</span>
                </div>
                <button
                  onClick={handleToggleSubscription}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isSubscribed
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                </button>
              </>
            ) : (
              <button
                onClick={handlePermissionRequest}
                className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Enable Notifications
              </button>
            )}
          </div>
        </div>
        
        {permission === 'denied' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center space-x-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Permission Denied</span>
            </div>
            <p className="text-red-300 text-sm mt-2">
              Notifications are blocked. Please enable them in your browser settings to receive racing alerts.
            </p>
          </div>
        )}
      </div>

      {/* Alert Types */}
      {permission === 'granted' && isSubscribed && (
        <div>
          <h4 className="font-medium text-white mb-4">Alert Types</h4>
          <div className="space-y-3">
            {alertTypes.map((alertType) => {
              const Icon = alertType.icon
              const isEnabled = enabledTypes.includes(alertType.id)
              
              return (
                <div
                  key={alertType.id}
                  className="flex items-center justify-between p-4 bg-gray-700/50 border border-gray-600 rounded-lg hover:border-gray-500 transition-colors"
                >
                  <div className="flex items-start space-x-3">
                    <Icon className={`w-5 h-5 mt-0.5 ${alertType.color}`} />
                    <div>
                      <h5 className="font-medium text-white">{alertType.name}</h5>
                      <p className="text-sm text-gray-400 mt-1">{alertType.description}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleToggleAlertType(alertType.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                      isEnabled ? 'bg-yellow-500' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )
            })}
          </div>
          
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center space-x-2 text-blue-400 mb-2">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Note</span>
            </div>
            <p className="text-blue-300 text-xs">
              Notifications are only sent for alerts with confidence scores above 75%. 
              High-priority alerts (90%+ confidence) will require interaction to dismiss.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}