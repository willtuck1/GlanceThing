import React, { useEffect, useState } from 'react'

import {
  ClockSettings,
  ClockStyle,
  ClockWidgetId,
  moveWidget,
  toggleWidget,
  widgetRows
} from './clockForm.js'

import styles from './Settings.module.css'

const STYLES: { value: ClockStyle; label: string }[] = [
  { value: 'digital', label: 'Digital' },
  { value: 'analog', label: 'Analog' }
]

const ALERTS: { value: ClockSettings['defaultAlert']; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'notify', label: 'Notification' },
  { value: 'sound', label: 'Notification + sound' }
]

const ClockTab: React.FC = () => {
  const [settings, setSettings] = useState<ClockSettings | null>(null)
  const [widgets, setWidgets] = useState<
    { id: ClockWidgetId; label: string }[]
  >([])
  const [saving, setSaving] = useState(false)
  const [sleepResult, setSleepResult] = useState<string | null>(null)

  useEffect(() => {
    window.api.getClockSettings().then(res => {
      setSettings(res.settings)
      setWidgets(res.widgets)
    })
  }, [])

  if (!settings) return null

  const current = settings
  const rows = widgetRows(current, widgets)

  async function save(partial: Partial<ClockSettings>) {
    if (saving) return
    setSaving(true)
    try {
      setSettings(await window.api.setClockSettings(partial))
    } catch {
      // keep the previous state
    } finally {
      setSaving(false)
    }
  }

  async function sleepNow() {
    setSleepResult(null)
    try {
      const sent = await window.api.sleepDeviceOnClock()
      setSleepResult(sent ? 'Sent' : 'No device connected')
    } catch {
      setSleepResult('No device connected')
    }
  }

  const styleRadios = (
    name: string,
    value: ClockStyle,
    key: 'tabStyle' | 'sleepStyle'
  ) =>
    STYLES.map(s => (
      <label key={s.value} className={styles.taskListOption}>
        <input
          type="radio"
          name={name}
          checked={value === s.value}
          disabled={saving}
          onChange={() => save({ [key]: s.value })}
        />
        {s.label}
      </label>
    ))

  return (
    <div className={styles.settingsTab}>
      <div className={styles.googleSection}>
        <p>Clock tab style</p>
        {styleRadios('clockTabStyle', current.tabStyle, 'tabStyle')}
      </div>

      <div className={styles.googleSection}>
        <p>Sleep screen style</p>
        {styleRadios('clockSleepStyle', current.sleepStyle, 'sleepStyle')}
      </div>

      <div className={styles.googleSection}>
        <p>Sleep screen widgets</p>
        <p className={styles.description}>
          Uncheck all for a clock-only sleep screen.
        </p>
        {rows.map((row, index) => (
          <div key={row.id} className={styles.actions}>
            <label
              className={`${styles.taskListOption} ${styles.tabOption}`}
            >
              <input
                type="checkbox"
                checked={row.shown}
                disabled={saving}
                onChange={() => save(toggleWidget(current, row.id))}
              />
              {row.label}
            </label>
            <button
              disabled={saving || index === 0}
              onClick={() => save(moveWidget(current, row.id, -1))}
            >
              Up
            </button>
            <button
              disabled={saving || index === rows.length - 1}
              onClick={() => save(moveWidget(current, row.id, 1))}
            >
              Down
            </button>
          </div>
        ))}
      </div>

      <div className={styles.googleSection}>
        <p>Timer desktop alert (default)</p>
        <p className={styles.description}>
          Each timer can override this on the device.
        </p>
        {ALERTS.map(a => (
          <label key={a.value} className={styles.taskListOption}>
            <input
              type="radio"
              name="clockDefaultAlert"
              checked={current.defaultAlert === a.value}
              disabled={saving}
              onChange={() => save({ defaultAlert: a.value })}
            />
            {a.label}
          </label>
        ))}
      </div>

      <div className={styles.googleSection}>
        <p>Sleep device on clock</p>
        <div className={styles.actions}>
          <button onClick={sleepNow}>Sleep device on clock</button>
          {sleepResult && (
            <span className={styles.description}>{sleepResult}</span>
          )}
        </div>
      </div>

      <div className={styles.googleSection}>
        <label className={styles.taskListOption}>
          <input
            type="checkbox"
            checked={current.keyDebug}
            disabled={saving}
            onChange={() => save({ keyDebug: !current.keyDebug })}
          />
          Show button presses on the device
        </label>
        <p className={styles.description}>
          For checking button 4: presses appear on the device and in Logs.
        </p>
      </div>
    </div>
  )
}

export default ClockTab
