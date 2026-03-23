'use client'

import React, { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { Menu, X } from 'lucide-react'

interface DashboardShellProps {
  children: React.ReactNode
  userRole: 'admin' | 'analista'
  userEmail: string
  userName: string
}

export default function DashboardShell({
  children,
  userRole,
  userEmail,
  userName,
}: DashboardShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 relative">
      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Ahora recibe isOpen y onClose */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar 
          userRole={userRole} 
          userEmail={userEmail} 
          userName={userName} 
          onClose={() => setIsSidebarOpen(false)} 
        />
      </div>
      
      {/* Contenido principal */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 h-16 bg-white border-b border-slate-200 shrink-0">
          <button
            onClick={toggleSidebar}
            className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Toggle Sidebar"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
            Nómina Lechera
          </h1>
          
          <div className="w-10" /> {/* Spacer to center title */}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-8 fade-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
