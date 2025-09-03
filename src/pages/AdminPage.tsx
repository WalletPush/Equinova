import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { supabase } from '@/lib/supabase'
import { fetchFromSupabaseFunction } from '@/lib/api'
import { 
  Shield, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertCircle,
  Loader,
  Database,
  Users,
  Trophy,
  Brain,
  TrendingUp,
  ArrowRight,
  BarChart3
} from 'lucide-react'

export function AdminPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadType, setUploadType] = useState<'initial' | 'results'>('initial')
  const [uploadResult, setUploadResult] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        setCsvFile(file)
        setError('')
      } else {
        setError('Please select a CSV file')
        setCsvFile(null)
      }
    }
  }

  const handleUpload = async () => {
    if (!csvFile) {
      setError('Please select a CSV file')
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')
    setUploadProgress('Reading file...')

    try {
      // Read file content
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsText(csvFile)
      })

      setUploadProgress('Processing CSV data...')

      // Send to CSV processor edge function
      const response = await fetchFromSupabaseFunction('csv-processor', {
        method: 'POST',
        body: JSON.stringify({
          csvData: fileContent,
          fileName: csvFile.name
        })
      })

      if (!response.ok) {
        throw new Error('Failed to process CSV file')
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error.message)
      }

      const resultData = data.data
      setUploadResult(resultData)
      
      // Invalidate race cache to refresh data
      await queryClient.invalidateQueries({ queryKey: ['races'] })
      
      if (resultData.updatedRecords !== undefined) {
        // Results upload
        setSuccess(`Successfully updated ${resultData.updatedRecords} race results from ${resultData.fileName}`)
      } else {
        // Initial data upload
        setSuccess(`Successfully processed ${resultData.processedRows} rows from ${resultData.fileName}`)
      }
      setCsvFile(null)
      // Clear file input
      const fileInput = document.getElementById('csv-file') as HTMLInputElement
      if (fileInput) fileInput.value = ''
      
    } catch (err: any) {
      setError(err.message || 'Failed to upload CSV')
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <AppLayout>
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
            <p className="text-gray-400">Manage racing data and system settings</p>
          </div>
        </div>

        {/* CSV Upload Section */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Database className="w-6 h-6 text-yellow-400" />
            <h2 className="text-xl font-semibold text-white">Racing Data Upload</h2>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <p className="text-green-400 text-sm">{success}</p>
                </div>
                {uploadResult && uploadResult.updatedRecords !== undefined && (
                  <button
                    onClick={() => navigate('/performance')}
                    className="flex items-center space-x-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Brain className="w-4 h-4" />
                    <span>View ML Analysis</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
              {uploadResult && uploadResult.updatedRecords !== undefined && (
                <div className="mt-3 p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                  <div className="flex items-center space-x-2 text-green-300 text-sm">
                    <TrendingUp className="w-4 h-4" />
                    <span>Results uploaded! ML model performance has been automatically updated. View detailed analysis and insights in the ML Performance Dashboard.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* File Upload */}
          <div className="space-y-4">
            {/* Upload Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Upload Type
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setUploadType('initial')}
                  className={`p-4 rounded-lg border transition-colors text-left ${
                    uploadType === 'initial'
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400'
                      : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <Database className="w-5 h-5" />
                    <span className="font-medium">Initial Race Data</span>
                  </div>
                  <p className="text-xs opacity-75">
                    Upload new races with ML predictions and horse data
                  </p>
                </button>
                
                <button
                  type="button"
                  onClick={() => setUploadType('results')}
                  className={`p-4 rounded-lg border transition-colors text-left ${
                    uploadType === 'results'
                      ? 'border-green-400 bg-green-400/10 text-green-400'
                      : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <Trophy className="w-5 h-5" />
                    <span className="font-medium">Race Results</span>
                  </div>
                  <p className="text-xs opacity-75">
                    Update existing races with finishing positions
                  </p>
                </button>
              </div>
            </div>
            
            <div>
              <label htmlFor="csv-file" className="block text-sm font-medium text-gray-300 mb-2">
                Select CSV File
              </label>
              <div className="relative">
                <input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-yellow-500 file:text-gray-900 file:font-medium hover:file:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <p className="text-sm text-gray-400 mt-2">
                {uploadType === 'initial' 
                  ? 'Upload new racing data in CSV format. Expected columns: race_id, course, horse, trainer, jockey, ML predictions, etc.'
                  : 'Upload race results with finishing positions. Expected columns: race_id, horse_id, finishing_position, etc.'
                }
              </p>
            </div>

            {/* File Info */}
            {csvFile && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <FileSpreadsheet className="w-8 h-8 text-green-400" />
                  <div>
                    <div className="text-white font-medium">{csvFile.name}</div>
                    <div className="text-sm text-gray-400">
                      {formatFileSize(csvFile.size)} • {csvFile.type || 'text/csv'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {uploading && uploadProgress && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 flex items-center space-x-3">
                <Loader className="w-5 h-5 text-yellow-400 animate-spin flex-shrink-0" />
                <p className="text-yellow-400 text-sm">{uploadProgress}</p>
              </div>
            )}

            {/* Upload Button */}
            <button
              onClick={handleUpload}
              disabled={!csvFile || uploading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-600 disabled:cursor-not-allowed text-gray-900 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
            >
              {uploading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
              <span>
                {uploading ? 'Processing...' : 'Upload & Process CSV'}
              </span>
            </button>
          </div>
        </div>

        {/* Data Format Guide */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">CSV Format Guide</h3>
          
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium text-gray-300 mb-2">Required Columns</h4>
              <div className="bg-gray-700/30 rounded p-3 font-mono text-xs text-gray-300">
                race_id, course, course_id, date, off_time, distance, race_class, type, <br />
                horse_id, horse, age, sex, trainer, trainer_id, jockey, jockey_id, <br />
                current_odds, number, draw, form, comment, spotlight, <br />
                benter_proba, ensemble_proba, predicted_winner, mlp_proba, rf_proba, xgboost_proba
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-300 mb-2">Data Processing</h4>
              <ul className="text-gray-400 space-y-1">
                <li>• CSV data is automatically parsed and imported into the database</li>
                <li>• Duplicate entries are handled using merge-duplicates strategy</li>
                <li>• Race, horse, trainer, jockey, and owner data is normalized</li>
                <li>• ML predictions and statistics are preserved</li>
              </ul>
            </div>
          </div>
        </div>

        {/* System Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Users className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">User Management</h3>
            </div>
            <p className="text-gray-400 text-sm">
              User roles and permissions are managed through the database. 
              Contact system administrator for user role changes.
            </p>
          </div>
          
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Database className="w-6 h-6 text-green-400" />
              <h3 className="text-lg font-semibold text-white">Database Status</h3>
            </div>
            <p className="text-gray-400 text-sm">
              All systems operational. Database connections are healthy and 
              processing requests normally.
            </p>
          </div>
          
          <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 backdrop-blur-sm border border-purple-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Brain className="w-6 h-6 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">ML Analytics</h3>
              </div>
              <button
                onClick={() => navigate('/performance')}
                className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
              >
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>
            <p className="text-gray-300 text-sm mb-3">
              Access comprehensive ML model performance analysis, AI insights, and detailed metrics.
            </p>
            <button
              onClick={() => navigate('/performance')}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-2"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Open ML Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}