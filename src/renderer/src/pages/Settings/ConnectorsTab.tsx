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

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

const ConnectorsTab: React.FC = () => {
  const [connectors, setConnectors] = useState<
    ConnectorForSettings[] | null
  >(null)
  const [form, setForm] = useState<ConnectorForm | null>(null)
  const [listError, setListError] = useState('')

  async function reload() {
    try {
      setConnectors(await window.api.listConnectors())
    } catch {
      setConnectors([])
      setListError('Could not load connectors')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function remove(c: ConnectorForSettings) {
    if (!window.confirm(`Delete connector "${c.label}"?`)) return
    setListError('')
    try {
      await window.api.deleteConnector(c.id)
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not delete')
    }
    await reload()
  }

  if (!connectors) return null

  if (form)
    return (
      <ConnectorEditor
        initial={form}
        onClose={() => setForm(null)}
        onSaved={async () => {
          setForm(null)
          await reload()
        }}
      />
    )

  return (
    <div className={styles.settingsTab}>
      <div className={styles.googleSection}>
        <p>Connectors</p>
        <p className={styles.description}>
          Add a tab to the Car Thing from any JSON web address.
        </p>
        {connectors.length === 0 && (
          <p className={styles.description}>No connectors yet</p>
        )}
        {connectors.map(c => (
          <div key={c.id} className={styles.connectorRow}>
            <div className={styles.info}>
              <p>{c.label}</p>
              <p className={styles.description}>
                {LAYOUT_LABELS.find(l => l.id === c.layout)?.label ??
                  c.layout}{' '}
                · {hostOf(c.source.url)} · every {c.intervalMin} min
              </p>
            </div>
            <div className={styles.actions}>
              <button onClick={() => setForm(formFromConnector(c))}>
                Edit
              </button>
              <button onClick={() => remove(c)}>Delete</button>
            </div>
          </div>
        ))}
        {listError && <p className={styles.error}>{listError}</p>}
        <div className={styles.actions}>
          <button onClick={() => setForm(emptyForm())}>
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
      {testResult?.view && <Preview view={testResult.view} />}

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

const Preview: React.FC<{ view: ConnectorView }> = ({ view }) => {
  const row = (
    key: string,
    left: string,
    right?: string,
    sub?: string
  ) => (
    <div key={key} className={styles.previewRow}>
      <span>
        {left}
        {sub ? ` (${sub})` : ''}
      </span>
      <span>{right}</span>
    </div>
  )
  return (
    <div className={styles.preview}>
      <p className={styles.success}>Mapped OK</p>
      {view.layout === 'list' && (
        <>
          {view.rows.map((r, i) =>
            row(String(i), r.primary, r.value, r.secondary)
          )}
          {view.more > 0 && <span>+{view.more} more</span>}
        </>
      )}
      {view.layout === 'grid' && (
        <>
          {view.cells.map((c, i) => row(String(i), c.label, c.value))}
          {view.more > 0 && <span>+{view.more} more</span>}
        </>
      )}
      {view.layout === 'number' && (
        <>
          <span className={styles.big}>
            {view.value}
            {view.unit ? ` ${view.unit}` : ''}
          </span>
          {view.caption && <span>{view.caption}</span>}
        </>
      )}
      {view.layout === 'keyvalue' &&
        view.pairs.map((p, i) => row(String(i), p.label, p.value))}
    </div>
  )
}

export default ConnectorsTab
