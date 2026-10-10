import React, { useEffect, useState } from 'react'

import styles from './Settings.module.css'

import { MAX_INTERVAL, MIN_INTERVAL } from './connectorForm.js'
import ConnectorPreview from './ConnectorPreview.js'
import {
  McpForm,
  McpRecipe,
  applyRecipe,
  mcpDraftFromForm,
  validateMcpForm
} from './mcpForm.js'

const McpConnectorForm: React.FC<{
  initial: McpForm
  onClose: () => void
  onSaved: () => void | Promise<void>
}> = ({ initial, onClose, onSaved }) => {
  const [f, setF] = useState<McpForm>(initial)
  const [recipes, setRecipes] = useState<McpRecipe[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [testResult, setTestResult] = useState<Awaited<
    ReturnType<Window['api']['testConnector']>
  > | null>(null)

  useEffect(() => {
    window.api
      .listMcpRecipes()
      .then(setRecipes)
      .catch(() => {
        setRecipes([])
        setErrors(['Could not load recipes'])
      })
  }, [])

  const recipe = recipes?.find(r => r.id === f.recipeId)
  const editing = !!f.id

  function set(patch: Partial<McpForm>) {
    setF(prev => ({ ...prev, ...patch }))
  }

  function pick(id: string) {
    const next = recipes?.find(r => r.id === id)
    if (next) setF(prev => applyRecipe(prev, next, recipe))
  }

  function check(): boolean {
    const found = validateMcpForm(f, recipe)
    setErrors(found)
    return found.length === 0
  }

  async function test() {
    setTestResult(null)
    if (!check()) return
    setBusy(true)
    try {
      setTestResult(await window.api.testConnector(mcpDraftFromForm(f)))
    } catch (e) {
      setTestResult({
        error: e instanceof Error ? e.message : 'Test failed'
      })
    }
    setBusy(false)
  }

  async function save() {
    setTestResult(null)
    if (!check()) return
    setBusy(true)
    try {
      await window.api.saveConnector(mcpDraftFromForm(f))
      await onSaved()
      return
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Could not save'])
    }
    setBusy(false)
  }

  if (!recipes) return null

  const clientIdStored = f.clientIdSet && !f.clientIdCleared

  return (
    <div className={styles.settingsTab}>
      <div className={styles.googleSection}>
        <p>{editing ? 'Edit MCP connector' : 'Add MCP connector'}</p>

        <p className={styles.description}>Recipe</p>
        <select
          value={f.recipeId}
          disabled={editing}
          onChange={e => pick(e.target.value)}
        >
          {!f.recipeId && <option value="">Choose a recipe…</option>}
          {recipes.map(r => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        {recipe && (
          <p className={styles.description}>{recipe.description}</p>
        )}

        <p className={styles.description}>Server URL</p>
        <input
          type="text"
          value={f.serverUrl}
          placeholder="https://example.com/mcp"
          onChange={e => set({ serverUrl: e.target.value })}
        />

        <p className={styles.description}>Name (the tab title)</p>
        <input
          type="text"
          value={f.label}
          onChange={e => set({ label: e.target.value })}
        />

        <p className={styles.description}>
          Refresh every N minutes ({MIN_INTERVAL}-{MAX_INTERVAL})
        </p>
        <input
          type="number"
          min={MIN_INTERVAL}
          max={MAX_INTERVAL}
          value={f.intervalMin}
          onChange={e => set({ intervalMin: e.target.value })}
        />

        {recipe?.settings.map(s => (
          <React.Fragment key={s.key}>
            <p className={styles.description}>{s.label}</p>
            <input
              type="text"
              value={f.settings[s.key] ?? ''}
              placeholder={s.placeholder}
              maxLength={s.maxLength}
              onChange={e =>
                set({
                  settings: { ...f.settings, [s.key]: e.target.value }
                })
              }
            />
          </React.Fragment>
        ))}
      </div>

      <div className={styles.googleSection}>
        <p>OAuth client ID (optional)</p>
        <p className={styles.description}>
          Only if the server doesn&apos;t support automatic registration.
          Register http://127.0.0.1/callback as the redirect URI.
        </p>
        {clientIdStored && !f.clientIdReplacing ? (
          <div className={styles.actions}>
            <span className={styles.description}>{f.clientIdHint}</span>
            <button onClick={() => set({ clientIdReplacing: true })}>
              Replace
            </button>
            <button
              onClick={() => set({ clientIdCleared: true, clientId: '' })}
            >
              Clear
            </button>
          </div>
        ) : (
          <input
            type="text"
            autoComplete="off"
            value={f.clientId}
            onChange={e => set({ clientId: e.target.value })}
          />
        )}
      </div>

      {errors.map(e => (
        <p key={e} className={styles.error}>
          {e}
        </p>
      ))}
      {testResult?.error && (
        <p className={styles.error}>{testResult.error}</p>
      )}
      {testResult?.view && <ConnectorPreview view={testResult.view} />}

      <div className={styles.actions}>
        <button disabled={busy} onClick={test}>
          Test
        </button>
        <button disabled={busy} onClick={save}>
          Save
        </button>
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default McpConnectorForm
