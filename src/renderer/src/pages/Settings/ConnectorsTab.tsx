import React, { useEffect, useState } from 'react'

import styles from './Settings.module.css'

import {
  ConnectorForm,
  ConnectorForSettings,
  ConnectorView,
  LAYOUT_LABELS,
  MAX_INTERVAL,
  MAX_PAIRS,
  MIN_INTERVAL,
  draftFromForm,
  emptyForm,
  formFromConnector,
  shouldWarnHttpSecret,
  validateForm
} from './connectorForm.js'
import ConnectorPreview from './ConnectorPreview.js'
import McpConnectorForm from './McpConnectorForm.js'
import {
  McpConnectorRow,
  McpForm,
  McpRecipe,
  authBadge,
  canSignIn,
  canSignOut,
  emptyMcpForm,
  formFromMcpConnector,
  serverHost
} from './mcpForm.js'

type FormState =
  | { kind: 'json'; form: ConnectorForm }
  | { kind: 'mcp'; form: McpForm }
  | { kind: 'choose' }

const ConnectorsTab: React.FC = () => {
  const [connectors, setConnectors] = useState<Awaited<
    ReturnType<Window['api']['listConnectors']>
  > | null>(null)
  const [recipes, setRecipes] = useState<McpRecipe[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [listError, setListError] = useState('')
  const [signingIn, setSigningIn] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  async function reload() {
    try {
      setConnectors(await window.api.listConnectors())
    } catch {
      setConnectors([])
      setListError('Could not load connectors')
    }
    try {
      setRecipes(await window.api.listMcpRecipes())
    } catch {
      setRecipes([])
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function remove(c: { id: string; label: string }) {
    if (!window.confirm(`Delete connector "${c.label}"?`)) return
    setListError('')
    try {
      await window.api.deleteConnector(c.id)
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not delete')
    }
    await reload()
  }

  async function signIn(id: string) {
    setRowErrors(prev => ({ ...prev, [id]: '' }))
    setSigningIn(id)
    try {
      const r = await window.api.mcpSignIn(id)
      if ('error' in r) setRowErrors(prev => ({ ...prev, [id]: r.error }))
    } catch (e) {
      setRowErrors(prev => ({
        ...prev,
        [id]: e instanceof Error ? e.message : 'Sign-in failed'
      }))
    }
    setSigningIn(null)
    await reload()
  }

  async function signOut(id: string) {
    setRowErrors(prev => ({ ...prev, [id]: '' }))
    try {
      await window.api.mcpSignOut(id)
    } catch (e) {
      setRowErrors(prev => ({
        ...prev,
        [id]: e instanceof Error ? e.message : 'Sign-out failed'
      }))
    }
    await reload()
  }

  if (!connectors) return null

  async function closeAndReload() {
    setForm(null)
    await reload()
  }

  if (form?.kind === 'json')
    return (
      <ConnectorEditor
        initial={form.form}
        onClose={() => setForm(null)}
        onSaved={closeAndReload}
      />
    )

  if (form?.kind === 'mcp')
    return (
      <McpConnectorForm
        initial={form.form}
        onClose={() => setForm(null)}
        onSaved={closeAndReload}
      />
    )

  if (form?.kind === 'choose')
    return (
      <div className={styles.settingsTab}>
        <div className={styles.googleSection}>
          <p>Add connector</p>
          <p className={styles.description}>
            JSON URL: map any JSON web address. MCP recipe: use a
            ready-made recipe with an MCP server
            {recipes.length === 0 ? ' (none available)' : ''}.
          </p>
          <div className={styles.actions}>
            <button
              onClick={() => setForm({ kind: 'json', form: emptyForm() })}
            >
              JSON URL
            </button>
            <button
              disabled={recipes.length === 0}
              onClick={() =>
                setForm({ kind: 'mcp', form: emptyMcpForm() })
              }
            >
              MCP recipe
            </button>
            <button onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      </div>
    )

  const recipeLabel = (id: string) =>
    recipes.find(r => r.id === id)?.label ?? id
  const layoutLabel = (l: string) =>
    LAYOUT_LABELS.find(x => x.id === l)?.label ?? l

  return (
    <div className={styles.settingsTab}>
      <div className={styles.googleSection}>
        <p>Connectors</p>
        <p className={styles.description}>
          Add a tab to the Car Thing from a JSON web address or an MCP
          server.
        </p>
        {connectors.length === 0 && (
          <p className={styles.description}>No connectors yet</p>
        )}
        {connectors.map(c => {
          if (c.source.kind === 'mcp') {
            const m = c as McpConnectorRow
            const badge = authBadge(m.auth)
            return (
              <div key={m.id}>
                <div className={styles.connectorRow}>
                  <div className={styles.info}>
                    <p>{m.label}</p>
                    <p className={`${styles.description} ${styles.meta}`}>
                      <span>{recipeLabel(m.source.recipeId)}</span>
                      <span>· {serverHost(m.source.serverUrl)}</span>
                      <span>· {layoutLabel(m.layout)}</span>
                      <span>· every {m.intervalMin} min</span>
                    </p>
                    <p
                      className={
                        badge.variant === 'ok'
                          ? styles.success
                          : badge.variant === 'warn'
                            ? styles.warning
                            : styles.description
                      }
                    >
                      {badge.text}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    {canSignIn(m.auth) && (
                      <button
                        disabled={signingIn !== null}
                        onClick={() => signIn(m.id)}
                      >
                        {signingIn === m.id
                          ? 'Waiting for browser…'
                          : 'Sign in'}
                      </button>
                    )}
                    {canSignOut(m.auth) && (
                      <button onClick={() => signOut(m.id)}>
                        Sign out
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setForm({
                          kind: 'mcp',
                          form: formFromMcpConnector(m)
                        })
                      }
                    >
                      Edit
                    </button>
                    <button onClick={() => remove(m)}>Delete</button>
                  </div>
                </div>
                {rowErrors[m.id] && (
                  <p className={styles.error}>{rowErrors[m.id]}</p>
                )}
              </div>
            )
          }
          const j = c as ConnectorForSettings
          return (
            <div key={j.id} className={styles.connectorRow}>
              <div className={styles.info}>
                <p>{j.label}</p>
                <p className={`${styles.description} ${styles.meta}`}>
                  <span>{layoutLabel(j.layout)}</span>
                  <span>· {serverHost(j.source.url)}</span>
                  <span>· every {j.intervalMin} min</span>
                </p>
              </div>
              <div className={styles.actions}>
                <button
                  onClick={() =>
                    setForm({ kind: 'json', form: formFromConnector(j) })
                  }
                >
                  Edit
                </button>
                <button onClick={() => remove(j)}>Delete</button>
              </div>
            </div>
          )
        })}
        {listError && <p className={styles.error}>{listError}</p>}
        <div className={styles.actions}>
          <button onClick={() => setForm({ kind: 'choose' })}>
            Add connector
          </button>
        </div>
      </div>
    </div>
  )
}

const ConnectorEditor: React.FC<{
  initial: ConnectorForm
  onClose: () => void
  onSaved: () => void | Promise<void>
}> = ({ initial, onClose, onSaved }) => {
  const [f, setF] = useState<ConnectorForm>(initial)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [testResult, setTestResult] = useState<{
    view?: ConnectorView
    error?: string
  } | null>(null)

  function set(patch: Partial<ConnectorForm>) {
    setF(prev => ({ ...prev, ...patch }))
  }

  function setPair(
    i: number,
    patch: Partial<{ label: string; path: string }>
  ) {
    setF(prev => ({
      ...prev,
      pairs: prev.pairs.map((p, j) => (j === i ? { ...p, ...patch } : p))
    }))
  }

  function check(): boolean {
    const found = validateForm(f)
    setErrors(found)
    return found.length === 0
  }

  async function test() {
    setTestResult(null)
    if (!check()) return
    setBusy(true)
    try {
      setTestResult(await window.api.testConnector(draftFromForm(f)))
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
      await window.api.saveConnector(draftFromForm(f))
      await onSaved()
      return
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Could not save'])
    }
    setBusy(false)
  }

  const text = (
    value: string,
    onChange: (v: string) => void,
    placeholder?: string
  ) => (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
    />
  )

  const pathHelp = (
    <p className={styles.description}>
      Paths look like <code>data.items[0].price</code>.
    </p>
  )

  const headerStored = f.headerSet && !f.headerCleared

  return (
    <div className={styles.settingsTab}>
      <div className={styles.googleSection}>
        <p>{f.id ? 'Edit connector' : 'Add connector'}</p>

        <p className={styles.description}>Name (the tab title)</p>
        {text(f.label, v => set({ label: v }), 'Prices')}

        <p className={styles.description}>URL</p>
        {text(f.url, v => set({ url: v }), 'https://example.com/api')}

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

        <p className={styles.description}>Layout</p>
        <select
          value={f.layout}
          onChange={e =>
            set({ layout: e.target.value as ConnectorForm['layout'] })
          }
        >
          {LAYOUT_LABELS.map(l => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.googleSection}>
        <p>Mapping</p>
        {pathHelp}
        {(f.layout === 'list' || f.layout === 'grid') && (
          <>
            <p className={styles.description}>
              Items path (for each item in). Leave empty if the response
              itself is the list.
            </p>
            {text(f.itemsPath, v => set({ itemsPath: v }), 'data.items')}
          </>
        )}
        {f.layout === 'list' && (
          <>
            <p className={styles.description}>Primary path</p>
            {text(f.primary, v => set({ primary: v }), 'name')}
            <p className={styles.description}>Secondary path (optional)</p>
            {text(f.secondary, v => set({ secondary: v }))}
            <p className={styles.description}>Value path (optional)</p>
            {text(f.listValue, v => set({ listValue: v }))}
          </>
        )}
        {f.layout === 'grid' && (
          <>
            <p className={styles.description}>Label path</p>
            {text(f.gridLabel, v => set({ gridLabel: v }))}
            <p className={styles.description}>Value path</p>
            {text(f.gridValue, v => set({ gridValue: v }))}
          </>
        )}
        {f.layout === 'number' && (
          <>
            <p className={styles.description}>Value path</p>
            {text(f.numValue, v => set({ numValue: v }))}
            <p className={styles.description}>Caption path (optional)</p>
            {text(f.caption, v => set({ caption: v }))}
            <p className={styles.description}>
              Unit (text shown after the number, optional)
            </p>
            {text(f.unit, v => set({ unit: v }), '%')}
            <p className={styles.description}>Decimals (0-3, optional)</p>
            <input
              type="number"
              min={0}
              max={3}
              value={f.decimals}
              onChange={e => set({ decimals: e.target.value })}
            />
          </>
        )}
        {f.layout === 'keyvalue' && (
          <>
            <p className={styles.description}>
              Rows: a label (text) and the path of its value. Up to{' '}
              {MAX_PAIRS}.
            </p>
            {f.pairs.map((p, i) => (
              <div key={i} className={styles.fieldRow}>
                <input
                  type="text"
                  placeholder="Label"
                  value={p.label}
                  onChange={e => setPair(i, { label: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Path"
                  value={p.path}
                  onChange={e => setPair(i, { path: e.target.value })}
                />
                <button
                  onClick={() =>
                    set({ pairs: f.pairs.filter((_, j) => j !== i) })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <div className={styles.actions}>
              <button
                disabled={f.pairs.length >= MAX_PAIRS}
                onClick={() =>
                  set({ pairs: [...f.pairs, { label: '', path: '' }] })
                }
              >
                Add row
              </button>
            </div>
          </>
        )}
      </div>

      <div className={styles.googleSection}>
        <p>Secret header (optional)</p>
        <p className={styles.description}>
          Sent with every request, for example an API key. It stays on this
          computer.
        </p>
        <p className={styles.description}>Header name</p>
        {text(f.headerName, v => set({ headerName: v }), 'Authorization')}
        <p className={styles.description}>Header value</p>
        {headerStored && !f.headerReplacing ? (
          <div className={styles.actions}>
            <span className={styles.description}>Set</span>
            <button onClick={() => set({ headerReplacing: true })}>
              Replace
            </button>
            <button
              onClick={() =>
                set({
                  headerCleared: true,
                  headerName: '',
                  headerValue: ''
                })
              }
            >
              Clear
            </button>
          </div>
        ) : (
          <input
            type="password"
            autoComplete="off"
            value={f.headerValue}
            onChange={e => set({ headerValue: e.target.value })}
          />
        )}
        {shouldWarnHttpSecret(f) && (
          <p className={styles.warning}>
            The secret header will be sent unencrypted over http. Only use
            this on your local network.
          </p>
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

export default ConnectorsTab
