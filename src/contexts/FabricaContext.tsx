'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Fabrica = {
  id: string
  codigo: string
  nombre: string
  activo: boolean
}

export const ALL_FABRICAS_ID = 'all'

type FabricaCtx = {
  fabricas: Fabrica[]
  selectedFabricaId: string
  setSelectedFabricaId: (id: string) => void
  selectedFabrica: Fabrica | null
  isAllFabricas: boolean
  isLoading: boolean
}

const FabricaContext = createContext<FabricaCtx>({
  fabricas: [],
  selectedFabricaId: '',
  setSelectedFabricaId: () => {},
  selectedFabrica: null,
  isAllFabricas: false,
  isLoading: true,
})

export function FabricaProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [fabricas, setFabricas] = useState<Fabrica[]>([])
  const [selectedFabricaId, setSelectedFabricaIdState] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('_nl_fabrica') : null

    supabase
      .from('fabricas')
      .select('id, codigo, nombre, activo')
      .eq('activo', true)
      .order('codigo')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFabricas(data)
          const validSaved = saved && (saved === ALL_FABRICAS_ID || data.find((f: Fabrica) => f.id === saved))
          const initial = validSaved ? saved! : data[0].id
          setSelectedFabricaIdState(initial)
          if (!validSaved && typeof window !== 'undefined') {
            localStorage.setItem('_nl_fabrica', initial)
          }
        }
        setIsLoading(false)
      })
  }, [])

  const setSelectedFabricaId = (id: string) => {
    setSelectedFabricaIdState(id)
    if (typeof window !== 'undefined') {
      localStorage.setItem('_nl_fabrica', id)
    }
  }

  const selectedFabrica = fabricas.find(f => f.id === selectedFabricaId) || null
  const isAllFabricas = selectedFabricaId === ALL_FABRICAS_ID

  return (
    <FabricaContext.Provider value={{ fabricas, selectedFabricaId, setSelectedFabricaId, selectedFabrica, isAllFabricas, isLoading }}>
      {children}
    </FabricaContext.Provider>
  )
}

export const useFabrica = () => useContext(FabricaContext)
