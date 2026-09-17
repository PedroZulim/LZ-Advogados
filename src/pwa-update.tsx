/// <reference types="vite-plugin-pwa/client" />
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { Button } from '@/components/ui/button'

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null)

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onRegisteredSW(_url, registration) {
        // Check for a new version periodically without interrupting an active form.
        if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000)
      },
    })
    setUpdate(() => updateSW)
  }, [])

  if (!needRefresh || !update) return null
  return (
    <aside className="pwa-update" role="status">
      <span>Nova versão disponível.</span>
      <Button
        onClick={() => {
          void update().then(() => window.location.reload())
        }}
      >
        Atualizar agora
      </Button>
    </aside>
  )
}
