import React from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Brain, Trophy, Shield, ArrowRight } from 'lucide-react'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="px-4 py-6">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center space-x-3">
            <div>
              <h1 className="text-2xl font-bold text-white">EquiNova</h1>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-gray-900" />
                </div>
                <p className="text-sm text-gray-400">AI-Powered Racing Intelligence</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center">
            <Link
              to="/login"
              className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
            The Future of
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-500">
              {' '}Horse Racing{' '}
            </span>
            Predictions
          </h2>
          
          <p className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
            Advanced machine learning models combined with comprehensive racing data 
            to deliver unmatched insights for UK & Ireland horse racing.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/signup"
              className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 transform hover:scale-105 flex items-center justify-center space-x-2"
            >
              <span>Start Winning Today</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/login"
              className="border-2 border-gray-600 hover:border-yellow-400 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 hover:bg-gray-800"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 bg-gray-800/50">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-3xl font-bold text-white text-center mb-12">
            Professional Racing Intelligence
          </h3>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-white mb-4">
                AI-Powered Analysis
              </h4>
              <p className="text-gray-300 leading-relaxed">
                Multiple machine learning models analyze 60+ data points per horse, 
                delivering predictions with transparent confidence indicators.
              </p>
            </div>
            
            <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-white mb-4">
                Comprehensive Data
              </h4>
              <p className="text-gray-300 leading-relaxed">
                Complete racing intelligence including form, speed figures, 
                trainer/jockey statistics, and track conditions analysis.
              </p>
            </div>
            
            <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-white mb-4">
                Professional Grade
              </h4>
              <p className="text-gray-300 leading-relaxed">
                Built for serious racing enthusiasts with institutional-grade 
                security and professional design patterns.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-4xl font-bold text-white mb-6">
            Ready to Transform Your Racing Strategy?
          </h3>
          <p className="text-xl text-gray-300 mb-10">
            Join the new generation of racing analysts powered by AI
          </p>
          <Link
            to="/signup"
            className="bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-gray-900 px-10 py-4 rounded-xl font-bold text-xl transition-all duration-200 transform hover:scale-105 inline-flex items-center space-x-3"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-6 h-6" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-8 border-t border-gray-800">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-gray-400">
            © 2025 EquiNova. Professional horse racing intelligence platform.
          </p>
        </div>
      </footer>
    </div>
  )
}