import React, { useEffect, useRef, useState } from 'react'

import {
  AgentsSettings,
  listenerText,
  maskToken,
  stepsFor
} from './agentsForm.js'

import styles from './Settings.module.css'
import tabStyles from './AgentsTab.module.css'

const AgentsTab: React.FC = () => {
  const [info, setInfo] = useState<AgentsSettings | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [regenerated, setRegenerated] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.api
      .getAgentsSettings()
      .then(setInfo)
      .catch(() => setError('Could not load agent settings'))
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  function flashCopied(key: string) {
    setCopied(key)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(null), 1500)
  }

  async function loadToken(): Promise<string | null> {
    if (token) return token
    try {
      const t = await window.api.getAgentsToken()
      setToken(t)
      return t
    } catch {
      setError('Could not read the token')
      return null
    }
  }

  async function toggleShow() {
    if (show) return setShow(false)
    if (await loadToken()) setShow(true)
  }

  async function copyToken() {
    const t = await loadToken()
    if (!t) return
    try {
      await navigator.clipboard.writeText(t)
      flashCopied('token')
    } catch {
      setError('Could not copy')
    }
  }

  async function regenerate() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    try {
      setToken(await window.api.regenerateAgentsToken())
      setRegenerated(true)
    } catch {
      setError('Could not regenerate the token')
    }
  }

  async function copySnippet(id: string) {
    try {
      const text = await window.api.getAgentsSnippet(id)
      if (text === null) return setError('No config for this agent')
      await navigator.clipboard.writeText(text)
      flashCopied(id)
    } catch {
      setError('Could not copy')
    }
  }

  if (!info) return error ? <p className={styles.description}>{error}</p> : null

  return (
    <div className={styles.settingsTab}>
      <div className={styles.googleSection}>
        <p>Listener</p>
        <p className={styles.description}>{listenerText(info.listener)}</p>
      </div>

      <div className={styles.googleSection}>
        <p>Token</p>
        <div className={styles.actions}>
          <code className={tabStyles.token}>
            {show && token ? token : maskToken(token ?? '••••')}
          </code>
          <button onClick={toggleShow}>{show ? 'Hide' : 'Show'}</button>
          <button onClick={copyToken}>
            {copied === 'token' ? 'Copied' : 'Copy'}
          </button>
          <button onClick={regenerate}>
            {confirming ? 'Click again to confirm' : 'Regenerate'}
          </button>
        </div>
        {regenerated && (
          <p className={styles.description}>
            Copy the config again; old hooks stop working.
          </p>
        )}
      </div>

      {info.adapters.map(adapter => (
        <div key={adapter.id} className={styles.googleSection}>
          <p>{adapter.label}</p>
          {adapter.id === 'claude-code' && (
            <p className={styles.description}>
              Paste into ~/.claude/settings.json (user level, so every
              project reports).
            </p>
          )}
          <ol className={tabStyles.steps}>
            {stepsFor(adapter).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <div className={styles.actions}>
            <button onClick={() => copySnippet(adapter.id)}>
              {copied === adapter.id ? 'Copied' : 'Copy config'}
            </button>
          </div>
        </div>
      ))}

      <div className={styles.googleSection}>
        <p>Custom agent</p>
        <p className={styles.description}>
          POST /v1/status with {'{'}source, sessionId, label?, state:
          working|waiting|idle|stopped, detail?, end?{'}'}.
        </p>
        <div className={styles.actions}>
          <button onClick={() => copySnippet('custom')}>
            {copied === 'custom' ? 'Copied' : 'Copy curl example'}
          </button>
        </div>
      </div>

      {error && <p className={styles.description}>{error}</p>}
    </div>
  )
}

export default AgentsTab
