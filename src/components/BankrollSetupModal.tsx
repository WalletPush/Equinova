import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Wallet, Loader2, AlertCircle } from 'lucide-react'

interface BankrollSetupModalProps {
  onSetup: (amount: number) => Promise<any>
  isSubmitting?: boolean
}

export function BankrollSetupModal({ onSetup, isSubmitting }: BankrollSetupModalProps) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const presets = [50, 100, 200, 500]

  const handleSubmit = async () => {
    const val = parseFloat(amount)
    if (!val || val <= 0) {
      setError('Please enter an amount greater than £0')
      return
    }
    setError(null)
    try {
      await onSetup(val)
    } catch (e: any) {
      setError(e?.message || 'Failed to set bankroll')
    }
  }

  const modal = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-sm w-full shadow-2xl">
        <div className="p-6 space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 bg-yellow-500/15 border border-yellow-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Wallet className="w-7 h-7 text-yellow-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Set Your Starting Bankroll</h2>
            <p className="text-gray-400 text-sm mt-1">
              How much are you starting with? This tracks your betting performance over time.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {presets.map(p => (
              <button
                key={p}
                onClick={() => { setAmount(String(p)); setError(null) }}
                className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                  amount === String(p)
                    ? 'bg-yellow-500 text-gray-900'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                £{p}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Custom amount (GBP)
            </label>
            <input
              type="number"
              step="1"
              min="1"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(null) }}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white text-lg font-semibold placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
              placeholder="Enter amount"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !amount || parseFloat(amount) <= 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500 text-gray-900 rounded-xl font-bold text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wallet className="w-4 h-4" />
            )}
            {isSubmitting ? 'Setting up...' : `Start with £${amount || '0'}`}
          </button>

          <p className="text-[11px] text-gray-600 text-center">
            You can add more funds later from the Performance page
          </p>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}
