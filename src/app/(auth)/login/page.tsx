'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, X, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorModal, setErrorModal] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Si ya tiene sesión, mandarlo al dashboard directamente
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/')
      }
    }
    checkSession()
  }, [router, supabase.auth])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorModal(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
         setErrorModal('Contraseña o correo electrónico incorrectos. Verifica tus credenciales.')
      } else {
         setErrorModal('Error de autenticación: ' + error.message)
      }
      setIsLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const handleSignUp = async (e: React.MouseEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorModal(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setErrorModal('Error al registrar cuenta: ' + error.message)
    } else {
      setErrorModal('¡Cuentas registradas con éxito en el sistema GoTrue! Usa el botón de Iniciar Sesión para entrar.')
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white relative overflow-hidden">
      {/* Elementos decorativos de fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-md p-8 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl relative z-10 transition-all duration-300">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight mb-2 bg-gradient-to-r from-blue-300 to-cyan-200 bg-clip-text text-transparent">Nómina Lechera</h1>
          <p className="text-blue-200 text-sm">Gestiona la recepción y precios eficientemente</p>
        </div>

        <form className="space-y-6" onSubmit={handleLogin}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">Correo Electrónico</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="admin@admin.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">Contraseña</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="••••••••"
            />
          </div>

          <div className="flex gap-4">
             <button
               type="submit"
               disabled={isLoading}
               className="flex-1 flex items-center justify-center py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-lg shadow-lg transform transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0"
             >
               {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Iniciar Sesión'}
             </button>
             
             <button
               type="button"
               onClick={handleSignUp}
               disabled={isLoading}
               className="flex-1 flex items-center justify-center py-3 px-4 bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold rounded-lg shadow-lg transform transition-all hover:-translate-y-0.5 disabled:opacity-70"
               title="Crea la cuenta de forma segura a través de la API en lugar de SQL"
             >
               Registrarse
             </button>
          </div>
        </form>
      </div>

      {/* ERROR MODAL */}
      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-red-500 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold">
                <AlertCircle className="w-5 h-5" />
                <span>Error de Acceso</span>
              </div>
              <button onClick={() => setErrorModal(null)} className="text-white hover:text-red-200 transition-colors">
                <X size={20}/>
              </button>
            </div>
            <div className="p-6 bg-slate-50">
              <p className="text-slate-700 text-sm leading-relaxed">{errorModal}</p>
              <button 
                onClick={() => setErrorModal(null)}
                className="mt-6 w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors shadow-sm"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
