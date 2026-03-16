import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { 
  CalendarDays,
  Trophy, 
  Settings, 
  Shield, 
  LogOut,
  TrendingUp,
  Menu,
  X,
  Clock,
  Zap,
  Brain,
} from 'lucide-react'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const [ukTime, setUkTime] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  )
  useEffect(() => {
    const id = setInterval(() => {
      setUkTime(new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false)
  }, [location.pathname])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const bottomNavItems = [
    { to: '/races', icon: CalendarDays, label: 'Today', active: 'races' },
    { to: '/auto-bets', icon: Zap, label: 'Top Picks', active: 'auto-bets' },
    { to: '/previous', icon: Trophy, label: 'Results', active: 'previous' },
    { to: '/performance', icon: TrendingUp, label: 'Performance', active: 'performance' },
  ]

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="px-4 py-4 flex items-center justify-between">
          <NavLink to="/races" className="flex items-center">
            <img
              src="/images/eq-logo.png"
              alt="EquiNova"
              className="h-9 w-auto brightness-200"
            />
          </NavLink>

          {/* Live UK Clock */}
          <div className="flex items-center gap-1.5 bg-gray-700/50 px-3 py-1.5 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-white text-sm font-mono font-medium tabular-nums">{ukTime}</span>
            <span className="text-gray-400 text-[10px] font-medium">UK</span>
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
            
            {isMenuOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsMenuOpen(false)}
                />
                {/* Dropdown */}
                <div className="absolute right-0 top-12 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-48 z-50">
                  <NavLink
                    to="/ml-tracker"
                    className={({ isActive }) =>
                      `flex items-center space-x-3 px-4 py-3 transition-colors rounded-t-lg ${
                        isActive ? 'text-yellow-400 bg-gray-700/50' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                      }`
                    }
                  >
                    <Brain className="w-4 h-4" />
                    <span>ML Tracker</span>
                  </NavLink>
                  <div className="border-t border-gray-700" />
                  <NavLink
                    to="/settings"
                    className={({ isActive }) =>
                      `flex items-center space-x-3 px-4 py-3 transition-colors ${
                        isActive ? 'text-yellow-400 bg-gray-700/50' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                      }`
                    }
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </NavLink>
                  {isAdmin && (
                    <>
                      <div className="border-t border-gray-700" />
                      <NavLink
                        to="/admin"
                        className={({ isActive }) =>
                          `flex items-center space-x-3 px-4 py-3 transition-colors ${
                            isActive ? 'text-yellow-400 bg-gray-700/50' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                          }`
                        }
                      >
                        <Shield className="w-4 h-4" />
                        <span>Admin</span>
                      </NavLink>
                    </>
                  )}
                  <div className="border-t border-gray-700" />
                  <button
                    onClick={handleSignOut}
                    className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors w-full text-left rounded-b-lg"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 z-30">
        <div className="flex items-center justify-around py-2">
          {bottomNavItems.map(({ to, icon: Icon, label, active }) => {
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