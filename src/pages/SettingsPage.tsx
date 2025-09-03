import React, { useState, useEffect } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { NotificationSettings } from '@/components/NotificationSettings'
import { useAuth } from '@/contexts/AuthContext'
import { 
  User, 
  Key, 
  Save, 
  Eye, 
  EyeOff,
  AlertCircle,
  CheckCircle,
  ExternalLink
} from 'lucide-react'

export function SettingsPage() {
  const { profile, updateProfile } = useAuth()
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    openai_api_key: profile?.openai_api_key || ''
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log('Updating profile with:', formData)
      
      const { error } = await updateProfile({
        full_name: formData.full_name,
        openai_api_key: formData.openai_api_key
      })
      
      if (error) {
        console.error('Profile update error:', error)
        setError(error.message)
      } else {
        console.log('Profile updated successfully!')
        setSuccess('Settings updated successfully!')
        // Form data will be updated automatically through profile update
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err: any) {
      console.error('Unexpected error:', err)
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Update form data when profile changes
  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        openai_api_key: profile.openai_api_key || ''
      })
    }
  }, [profile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  return (
    <AppLayout>
      <div className="p-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Manage your account and AI preferences</p>
        </div>

        {/* Account Info */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <User className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-semibold text-white">Account Information</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-400 mb-1">Email</div>
              <div className="text-white bg-gray-700/50 px-3 py-2 rounded-lg">
                {profile?.email}
              </div>
            </div>
            
            <div>
              <div className="text-sm text-gray-400 mb-1">Role</div>
              <div className="text-white bg-gray-700/50 px-3 py-2 rounded-lg capitalize">
                {profile?.role}
                {profile?.role === 'admin' && (
                  <span className="ml-2 bg-yellow-400 text-gray-900 px-2 py-1 rounded text-xs font-bold">
                    ADMIN
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Profile Settings */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Profile Settings</h2>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4 flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4 flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-300 mb-2">
                Full Name
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                value={formData.full_name}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-colors"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label htmlFor="openai_api_key" className="block text-sm font-medium text-gray-300 mb-2">
                OpenAI API Key
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="openai_api_key"
                  name="openai_api_key"
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.openai_api_key}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-12 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-colors"
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="mt-2 text-sm text-gray-400">
                Required for AI race analysis. Your key is stored securely and only used for your requests.
                <a 
                  href="https://platform.openai.com/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-yellow-400 hover:text-yellow-300 ml-1 inline-flex items-center"
                >
                  Get your API key
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-600 disabled:cursor-not-allowed text-gray-900 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
            >
              <Save className="w-5 h-5" />
              <span>{loading ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </form>
        </div>

        {/* Notification Settings */}
        <NotificationSettings />

        {/* AI Features Info */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">AI Features</h2>
          
          <div className="space-y-4 text-sm text-gray-300">
            <div>
              <h3 className="font-medium text-white mb-2">Race Analysis</h3>
              <p className="text-gray-400 leading-relaxed">
                Get comprehensive AI-powered analysis of races, including key factors, 
                top contenders, and value picks based on machine learning predictions 
                and extensive racing data.
              </p>
            </div>
            
            <div>
              <h3 className="font-medium text-white mb-2">Privacy & Security</h3>
              <p className="text-gray-400 leading-relaxed">
                Your OpenAI API key is encrypted and stored securely. It's only used 
                to generate race analysis for your account and is never shared or 
                used for any other purpose.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}