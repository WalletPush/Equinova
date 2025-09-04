import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { 
  Home, 
  Trophy, 
  Settings, 
  Shield, 
  LogOut,
  User,
  TrendingUp,
  Brain,
  Menu,
  X,
  List,
  Heart,
  Wallet,
  BarChart3
} from 'lucide-react'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const navItems = [
    { to: '/races', icon: Home, label: 'Today', active: 'races' },
    { to: '/previous', icon: Trophy, label: 'Results', active: 'previous' },
    { to: '/ai-insider', icon: Brain, label: 'AI Insider', active: 'ai-insider' },
    { to: '/short-list', icon: List, label: 'Short list', active: 'short-list' },
  ]

  // Add admin-specific navigation items
  if (profile?.role === 'admin') {
    navItems.push({ to: '/admin', icon: Shield, label: 'Admin', active: 'admin' })
    navItems.push({ to: '/performance', icon: TrendingUp, label: 'ML Analytics', active: 'performance' })
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            {/* Logo and icon on same line */}
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-md flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-gray-900" />
              </div>
              <h1 className="text-xl font-bold text-white">EquiNova</h1>
            </div>
            {/* Tagline below */}
            <p className="text-xs text-gray-400 mt-1">AI powered intelligence</p>
          </div>
          
          {/* Hamburger Menu */}
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Menu"
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            
            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 top-12 bg-gray-800 border border-gray-700 rounded-lg shadow-lg min-w-32 z-50">
                <NavLink
                  to="/ml-tracker"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center space-x-2 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Tracker</span>
                </NavLink>
                <NavLink
                  to="/my-selections"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center space-x-2 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <Heart className="w-4 h-4" />
                  <span>Selections</span>
                </NavLink>
                <NavLink
                  to="/bankroll"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center space-x-2 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <Wallet className="w-4 h-4" />
                  <span>Bankroll</span>
                </NavLink>
                <NavLink
                  to="/settings"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center space-x-2 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </NavLink>
                <button
                  onClick={() => {
                    setIsMenuOpen(false)
                    handleSignOut()
                  }}
                  className="flex items-center space-x-2 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors w-full text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center justify-around py-2">
          {navItems.map(({ to, icon: Icon, label, active }) => {
            const isActive = location.pathname.includes(active)
            return (
              <NavLink
                key={to}
                to={to}
                className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
                  isActive
                    ? 'text-yellow-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'fill-current' : ''}`} />
                <span className="text-xs mt-1 font-medium">{label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}