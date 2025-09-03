import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthProvider } from '@/contexts/AuthContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { HorseDetailProvider } from '@/contexts/HorseDetailContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { SignUpPage } from '@/pages/SignUpPage'
import { TodaysRacesPage } from '@/pages/TodaysRacesPage'
import { PreviousRacesPage } from '@/pages/PreviousRacesPage'
import { RaceDetailPage } from '@/pages/RaceDetailPage'
import { AIInsiderPage } from '@/pages/AIInsiderPage'
import { ShortListPage } from '@/pages/ShortListPage'
import { MySelectionsPage } from '@/pages/MySelectionsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AdminPage } from '@/pages/AdminPage'
import { MLPerformancePage } from '@/pages/MLPerformancePage'
import { BankrollPage } from '@/pages/BankrollPage'
import './App.css'

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
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignUpPage />} />
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
                  <Route path="/my-selections" element={
                    <ProtectedRoute>
                      <MySelectionsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/bankroll" element={
                    <ProtectedRoute>
                      <BankrollPage />
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
                  <Route path="/performance" element={
                    <AdminRoute>
                      <MLPerformancePage />
                    </AdminRoute>
                  } />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Router>
            </HorseDetailProvider>
          </NotificationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
