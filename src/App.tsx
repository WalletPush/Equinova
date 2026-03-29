import React, { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { HorseDetailProvider } from '@/contexts/HorseDetailContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminRoute } from '@/components/AdminRoute'
import './App.css'

const LandingPage = lazy(() => import('@/pages/LandingPage').then(m => ({ default: m.LandingPage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })))
const SignUpPage = lazy(() => import('@/pages/SignUpPage').then(m => ({ default: m.SignUpPage })))
const PaymentSuccessPage = lazy(() => import('@/pages/PaymentSuccessPage').then(m => ({ default: m.PaymentSuccessPage })))
const TodaysRacesPage = lazy(() => import('@/pages/TodaysRacesPage').then(m => ({ default: m.TodaysRacesPage })))
const PreviousRacesPage = lazy(() => import('@/pages/PreviousRacesPage').then(m => ({ default: m.PreviousRacesPage })))
const RaceDetailPage = lazy(() => import('@/pages/RaceDetailPage').then(m => ({ default: m.RaceDetailPage })))
const AIInsiderPage = lazy(() => import('@/pages/AIInsiderPage').then(m => ({ default: m.AIInsiderPage })))
const ShortListPage = lazy(() => import('@/pages/ShortListPage').then(m => ({ default: m.ShortListPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const AdminPage = lazy(() => import('@/pages/AdminPage').then(m => ({ default: m.AdminPage })))
const PerformancePage = lazy(() => import('@/pages/PerformancePage').then(m => ({ default: m.PerformancePage })))
const BankrollPage = lazy(() => import('@/pages/BankrollPage').then(m => ({ default: m.BankrollPage })))
const MLTrackerPage = lazy(() => import('@/pages/MLTrackerPage').then(m => ({ default: m.MLTrackerPage })))
const MLPerformancePage = lazy(() => import('@/pages/MLPerformancePage').then(m => ({ default: m.MLPerformancePage })))
const AutoBetsPage = lazy(() => import('@/pages/AutoBetsPage').then(m => ({ default: m.AutoBetsPage })))
const ExoticBetsPage = lazy(() => import('@/pages/ExoticBetsPage').then(m => ({ default: m.ExoticBetsPage })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
    </div>
  )
}

function SmartRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? '/races' : '/'} replace />
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
})

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationProvider>
            <HorseDetailProvider>
              <Router>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/signup" element={<SignUpPage />} />
                    <Route path="/payment-success" element={<PaymentSuccessPage />} />
                    <Route path="/races" element={
                      <ProtectedRoute>
                        <TodaysRacesPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/previous" element={
                      <ProtectedRoute>
                        <PreviousRacesPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/race/:raceId" element={
                      <ProtectedRoute>
                        <RaceDetailPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/ai-insider" element={
                      <ProtectedRoute>
                        <AIInsiderPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/short-list" element={
                      <ProtectedRoute>
                        <ShortListPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/bankroll" element={
                      <ProtectedRoute>
                        <BankrollPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/ml-tracker" element={
                      <ProtectedRoute>
                        <MLTrackerPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/auto-bets" element={
                      <ProtectedRoute>
                        <AutoBetsPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/exotic-bets" element={
                      <ProtectedRoute>
                        <ExoticBetsPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/settings" element={
                      <ProtectedRoute>
                        <SettingsPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin" element={
                      <AdminRoute>
                        <AdminPage />
                      </AdminRoute>
                    } />
                    <Route path="/ml-performance" element={
                      <AdminRoute>
                        <MLPerformancePage />
                      </AdminRoute>
                    } />
                    <Route path="/performance" element={
                      <ProtectedRoute>
                        <PerformancePage />
                      </ProtectedRoute>
                    } />
                    <Route path="*" element={<SmartRedirect />} />
                  </Routes>
                </Suspense>
              </Router>
            </HorseDetailProvider>
          </NotificationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
