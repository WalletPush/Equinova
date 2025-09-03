import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface AccordionSectionProps {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
  sectionId: string
  activeSection: string | null
  onSectionChange: (sectionId: string | null) => void
}

export function AccordionSection({ 
  title, 
  icon: Icon, 
  children, 
  defaultOpen = false,
  className = '',
  sectionId,
  activeSection,
  onSectionChange
}: AccordionSectionProps) {
  const isOpen = activeSection === sectionId

  const handleToggle = () => {
    onSectionChange(isOpen ? null : sectionId)
  }

  return (
    <div className={`bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-lg overflow-hidden transition-all duration-300 ${className} ${
      isOpen ? 'border-yellow-400/30' : 'hover:border-gray-600'
    }`}>
      <button
        onClick={handleToggle}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Icon className="w-5 h-5 text-yellow-400" />
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <div className="transition-transform duration-200">
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-yellow-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>
      
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="border-t border-gray-700 p-4">
          {children}
        </div>
      </div>
    </div>
  )
}

// Hook to manage accordion state
export function useAccordionState(defaultSection?: string) {
  const [activeSection, setActiveSection] = useState<string | null>(defaultSection || null)
  
  const handleSectionChange = (sectionId: string | null) => {
    setActiveSection(sectionId)
  }
  
  return {
    activeSection,
    onSectionChange: handleSectionChange
  }
}
