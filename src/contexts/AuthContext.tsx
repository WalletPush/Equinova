import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, Profile } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Load user profile (non-blocking)
  const loadProfile = async (userId: string) => {
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      
      if (!error) {
        setProfile(profileData)
      }
    } catch (error) {
      console.warn('Profile loading failed:', error)
      // Don't block authentication if profile loading fails
    }
  }

  // Load user on mount
  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        
        setUser(user)
        
        // Load profile non-blocking
        if (user) {
          loadProfile(user.id)
        }
      } catch (error) {
        console.error('Error loading user:', error)
      } finally {
        // Set loading to false regardless of profile loading status
        setLoading(false)
      }
    }
    loadUser()

    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user || null)
        
        if (session?.user) {
          // Load profile non-blocking
          loadProfile(session.user.id)
        } else {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error }
    } catch (error) {
      console.error('Sign in error:', error)
      return { error }
    }
  }

  async function signUp(email: string, password: string, fullName?: string) {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || ''
          }
        }
      })
      return { error }
    } catch (error) {
      console.error('Sign up error:', error)
      return { error }
    }
  }

  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      setProfile(null)
      return { error }
    } catch (error) {
      console.error('Sign out error:', error)
      return { error }
    }
  }

  async function updateProfile(updates: Partial<Profile>) {
    if (!user) return { error: new Error('No user logged in') }
    
    try {
      // First check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (!existingProfile) {
        // Profile doesn't exist, create it
        const { data, error } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: updates.full_name || '',
            openai_api_key: updates.openai_api_key || '',
            role: 'user',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single()
        
        if (error) {
          console.error('Profile creation error:', error)
          return { error }
        }
        
        if (data) {
          setProfile(data)
        }
        
        return { error: null }
      } else {
        // Profile exists, update it
        const { data, error } = await supabase
          .from('profiles')
          .update({...updates, updated_at: new Date().toISOString()})
          .eq('id', user.id)
          .select()
        
        if (error) {
          console.error('Profile update error:', error)
          return { error }
        }
        
        if (data && data.length > 0) {
          setProfile(data[0])
        }
        
        return { error: null }
      }
    } catch (error) {
      console.error('Profile update error:', error)
      return { error }
    }
  }

  const value = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}