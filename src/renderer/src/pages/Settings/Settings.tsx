import React, { useContext, useEffect, useRef, useState } from 'react'

import { DevModeContext } from '@/contexts/DevModeContext.js'
import { ModalContext } from '@/contexts/ModalContext.js'

import Loader from '@/components/Loader/Loader.js'
import Switch from '@/components/Switch/Switch.js'

import styles from './Settings.module.css'

import icon from '@/assets/icon.png'
import iconNightly from '@/assets/icon-nightly.png'
import { useNavigate } from 'react-router-dom'
import { ChannelContext } from '@/contexts/ChannelContext.js'

enum Tab {
  General,
  Client,
  Appearance,
  Startup,
  Google,
  Fantasy,
  Advanced,
  Logs,
  About
}

const Settings: React.FC = () => {
  const { openModals, setModalOpen } = useContext(ModalContext)
  const { devMode } = useContext(DevModeContext)

  const [currentTab, setCurrentTab] = useState<Tab>(Tab.General)

  function onClickBackground(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) setModalOpen('settings', false)
  }

  useEffect(() => {
    if (!openModals.includes('settings') && currentTab !== Tab.General) {
      setTimeout(() => setCurrentTab(Tab.General), 200)
    }
  }, [openModals.includes('settings'), currentTab])

  useEffect(() => {
    if (!devMode && currentTab === Tab.Advanced) setCurrentTab(Tab.General)
  })

  return (
    <div
      className={styles.settings}
      data-open={openModals.includes('settings')}
      onClick={onClickBackground}
    >
      <div className={styles.box}>
        <h2>
          Settings
          <button onClick={() => setModalOpen('settings', false)}>
            <span className="material-icons">close</span>
          </button>
        </h2>
        <div className={styles.content}>
          <div className={styles.tabs}>
            <button
              onClick={() => setCurrentTab(Tab.General)}
              data-active={currentTab === Tab.General}
            >
              <span className="material-icons">settings</span>
              General
            </button>
            <button
              onClick={() => setCurrentTab(Tab.Client)}
              data-active={currentTab === Tab.Client}
            >
              <span className="material-icons">devices</span>
              Client
            </button>
            <button
              onClick={() => setCurrentTab(Tab.Appearance)}
              data-active={currentTab === Tab.Appearance}
            >
              <span className="material-icons">palette</span>
              Appearance
            </button>
            <button
              onClick={() => setCurrentTab(Tab.Startup)}
              data-active={currentTab === Tab.Startup}
            >
              <span className="material-icons">security</span>
              Startup
            </button>
            <button
              onClick={() => setCurrentTab(Tab.Google)}
              data-active={currentTab === Tab.Google}
            >
              <span className="material-icons">event</span>
              Google
            </button>
            <button
              onClick={() => setCurrentTab(Tab.Fantasy)}
              data-active={currentTab === Tab.Fantasy}
            >
              <span className="material-icons">sports_football</span>
              Fantasy
            </button>
            {devMode ? (
              <>
                <button
                  onClick={() => setCurrentTab(Tab.Advanced)}
                  data-active={currentTab === Tab.Advanced}
                >
                  <span className="material-icons">code</span>
                  Advanced
                </button>
                <button
                  onClick={() => setCurrentTab(Tab.Logs)}
                  data-active={currentTab === Tab.Logs}
                >
                  <span className="material-icons">description</span>
                  Logs
                </button>
              </>
            ) : null}
            <button
              onClick={() => setCurrentTab(Tab.About)}
              data-active={currentTab === Tab.About}
            >
              <span className="material-icons">info</span>
              About
            </button>
          </div>
          <div className={styles.tab}>
            {currentTab === Tab.General ? (
              <GeneralTab />
            ) : currentTab === Tab.Client ? (
              <ClientTab />
            ) : currentTab === Tab.Appearance ? (
              <AppearanceTab />
            ) : currentTab === Tab.Startup ? (
              <StartupTab />
            ) : currentTab === Tab.Google ? (
              <GoogleTab />
            ) : currentTab === Tab.Fantasy ? (
              <FantasyTab />
            ) : currentTab === Tab.Advanced ? (
              <AdvancedTab />
            ) : currentTab === Tab.Logs ? (
              <LogsTab />
            ) : currentTab === Tab.About ? (
              <AboutTab />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

const ToggleSetting: React.FC<{
  label: string
  description?: string
  defaultValue?: boolean
  value?: boolean
  onChange: (value: boolean) => void
}> = ({ label, description, defaultValue, value, onChange }) => {
  return (
    <div className={styles.toggleSetting}>
      <div className={styles.text}>
        <p className={styles.label}>{label}</p>
        <p className={styles.description}>{description}</p>
      </div>
      <Switch
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

const ButtonSetting: React.FC<{
  label: string
  description?: string
  onClick: () => void
}> = ({ label, description, onClick }) => {
  return (
    <div className={styles.buttonSetting}>
      <div className={styles.text}>
        <p className={styles.label}>{label}</p>
        <p className={styles.description}>{description}</p>
      </div>
      <button onClick={onClick}>
        <span className="material-icons">arrow_forward</span>
      </button>
    </div>
  )
}

const SelectSetting: React.FC<{
  label: string
  description?: string
  defaultValue?: string | number
  value?: string | number
  options: { value: string | number; label: string }[]
  onChange: (value: string | number) => void
}> = ({ label, description, defaultValue, value, options, onChange }) => {
  return (
    <div className={styles.selectSetting}>
      <div className={styles.text}>
        <p className={styles.label}>{label}</p>
        <p className={styles.description}>{description}</p>
      </div>
      <select
        defaultValue={defaultValue}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const SliderSetting: React.FC<{
  label: string
  description?: string
  disabled?: boolean
  defaultValue?: number
  value?: number
  min: number
  max: number
  step: number
  onChange?: (value: number) => void
  onRelease?: (value: number) => void
}> = ({
  label,
  description,
  disabled,
  defaultValue,
  value,
  min,
  max,
  step,
  onChange,
  onRelease
}) => {
  return (
    <div className={styles.sliderSetting} data-disabled={disabled}>
      <div className={styles.text}>
        <p className={styles.label}>{label}</p>
        <p className={styles.description}>{description}</p>
      </div>
      <input
        type="range"
        defaultValue={defaultValue}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={
          onChange ? e => onChange(Number(e.target.value)) : undefined
        }
        onMouseUp={
          onRelease
            ? e => onRelease(Number(e.currentTarget.value))
            : undefined
        }
      />
    </div>
  )
}

const InputSubmitSetting: React.FC<{
  label: string
  description?: string
  disabled?: boolean
  defaultValue?: string
  placeholder?: string
  regex?: RegExp
  onSubmit: (value: string) => void
  clearOnSubmit?: boolean
  submitLabel: string
}> = ({
  label,
  description,
  disabled,
  defaultValue,
  placeholder,
  regex,
  onSubmit,
  clearOnSubmit,
  submitLabel
}) => {
  const [value, setValue] = useState(defaultValue ?? '')

  function submit() {
    if (disabled) return
    onSubmit(value.trim())
    if (clearOnSubmit) setValue('')
  }

  return (
    <div className={styles.inputWithSubmitSetting}>
      <div className={styles.title}>
        <p>{label}</p>
        <p className={styles.description}>{description}</p>
      </div>
      <div className={styles.form}>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onKeyDown={e => {
            const controlKeys = [
              'Backspace',
              'ArrowUp',
              'ArrowDown',
              'ArrowLeft',
              'ArrowRight',
              'Delete'
            ]

            if (
              regex &&
              !regex.test(e.key) &&
              !controlKeys.includes(e.key)
            )
              e.preventDefault()
            else if (e.key === 'Enter') submit()
          }}
          onChange={e => setValue(e.target.value)}
        />
        <button disabled={disabled} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

const GeneralTab: React.FC = () => {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)

  const settings = useRef<{
    installAutomatically?: boolean
  }>({})

  useEffect(() => {
    async function loadSettings() {
      settings.current = {
        installAutomatically:
          (await window.api.getStorageValue('installAutomatically')) ===
          true
      }
      setLoaded(true)
    }

    loadSettings()
  }, [])

  return (
    loaded && (
      <div className={styles.settingsTab}>
        <ToggleSetting
          label="Install Automatically"
          description="Automatically installs the web app to the CarThing when it is connected."
          defaultValue={settings.current.installAutomatically ?? false}
          onChange={value =>
            window.api.setStorageValue('installAutomatically', value)
          }
        />
        <ButtonSetting
          label="Playback Setup"
          description="Run the playback setup again to change how playback is handled."
          onClick={() => navigate('/setup?step=3')}
        />
      </div>
    )
  )
}

const ClientTab: React.FC = () => {
  const [loaded, setLoaded] = useState(false)
  const [hasCustomImage, setHasCustomImage] = useState(false)
  const [screensaverStatus, setScreensaverStatus] = useState<{
    message: string
    status: 'error' | 'success'
  } | null>(null)
  const settings = useRef<{
    timeFormat?: string
    dateFormat?: string
    autoBrightness?: boolean
    brightness?: number
    sleepMethod?: string
  }>({})

  const [autoBrightness, setAutoBrightness] = useState(false)
  const [sleepMethod, setSleepMethod] = useState('sleep')
  const [patches, setPatches] = useState<
    | { name: string; description: string; installed: boolean }[]
    | false
    | null
  >(null)
  const [isDev, setIsDev] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      settings.current = {
        timeFormat: ((await window.api.getStorageValue('timeFormat')) ||
          'HH:mm') as string,
        dateFormat: ((await window.api.getStorageValue('dateFormat')) ||
          'ddd, D MMM') as string,
        autoBrightness:
          ((await window.api.getStorageValue('autoBrightness')) ??
            true) === true,
        brightness: ((await window.api.getStorageValue('brightness')) ??
          0.5) as number,
        sleepMethod: ((await window.api.getStorageValue('sleepMethod')) ||
          'sleep') as string
      }
      setAutoBrightness(settings.current.autoBrightness ?? false)
      setSleepMethod(settings.current.sleepMethod ?? 'sleep')

      const hasImage = await window.api.hasCustomScreensaverImage()
      setHasCustomImage(hasImage)

      setLoaded(true)
    }

    window.api.isDevMode().then(setIsDev)

    loadSettings()
    loadPatches()
  }, [])

  async function loadPatches() {
    setPatches(null)
    const patches = await window.api.getPatches()

    setPatches(patches)
  }

  async function applyPatch(patchName: string) {
    await window.api.applyPatch(patchName)
    loadPatches()
  }

  useEffect(() => {
    const removeListener = window.api.on('carThingState', async s => {
      if (patches && s !== 'ready') {
        setPatches(false)
      } else if (!patches && s === 'ready') {
        loadPatches()
      }
    })

    return () => removeListener()
  })

  return (
    loaded && (
      <div className={styles.settingsTab}>
        <SelectSetting
          label="Time Format"
          description="Displayed time format in the titlebar"
          defaultValue={settings.current.timeFormat}
          options={[
            { value: 'HH:mm', label: '24-hour' },
            { value: 'h:mm A', label: '12-hour' }
          ]}
          onChange={value =>
            window.api.setStorageValue('timeFormat', value as string)
          }
        />
        <SelectSetting
          label="Date Format"
          description="Displayed date format in the titlebar"
          defaultValue={settings.current.dateFormat}
          options={[
            { value: 'ddd, D MMM', label: 'Short' },
            { value: 'dddd, D MMMM', label: 'Long' }
          ]}
          onChange={value =>
            window.api.setStorageValue('dateFormat', value as string)
          }
        />
        <ToggleSetting
          label="Auto Brightness"
          description="Automatically adjust the brightness"
          defaultValue={settings.current.autoBrightness ?? false}
          onChange={value => {
            window.api.setStorageValue('autoBrightness', value)
            setAutoBrightness(value)
          }}
        />
        <SliderSetting
          label="Brightness"
          description="Adjust the brightness of the screen"
          disabled={autoBrightness}
          defaultValue={settings.current.brightness}
          min={0}
          max={1}
          step={0.05}
          onRelease={value =>
            window.api.setStorageValue('brightness', value as number)
          }
        />
        <SelectSetting
          label="Sleep Method"
          description="Method used for putting the CarThing to sleep"
          defaultValue={settings.current.sleepMethod}
          options={[
            { value: 'sleep', label: 'Black Screen' },
            {
              value: 'screensaver',
              label: 'Screensaver'
            }
          ]}
          onChange={value => {
            window.api.setStorageValue('sleepMethod', value as string)
            setSleepMethod(value as string)
          }}
        />

        {sleepMethod === 'screensaver' && (
          <div className={styles.screensaverSettings}>
            <div className={styles.header}>
              <div className={styles.text}>
                <p className={styles.label}>Custom Screensaver Image</p>
                <p className={styles.description}>
                  Upload a custom image to use as your screensaver
                  background
                </p>
              </div>
              <div className={styles.actions}>
                <button
                  onClick={async () => {
                    setScreensaverStatus(null)

                    const result =
                      await window.api.uploadScreensaverImage()

                    if (result && result.success) {
                      setHasCustomImage(true)
                      setScreensaverStatus({
                        message: 'Image uploaded successfully!',
                        status: 'success'
                      })
                    } else {
                      setScreensaverStatus({
                        message:
                          result.message || 'Failed to upload image',
                        status: 'error'
                      })
                    }
                  }}
                >
                  <span className="material-icons">upload</span>
                </button>
                {hasCustomImage && (
                  <button
                    data-type="danger"
                    onClick={async () => {
                      setScreensaverStatus(null)

                      const success =
                        await window.api.removeScreensaverImage()

                      if (success) {
                        setHasCustomImage(false)
                        setScreensaverStatus({
                          message: 'Image removed successfully!',
                          status: 'success'
                        })
                      } else {
                        setScreensaverStatus({
                          message: 'Failed to remove image',
                          status: 'error'
                        })
                      }
                    }}
                  >
                    <span className="material-icons">delete</span>
                  </button>
                )}
              </div>
            </div>
            {screensaverStatus && (
              <div
                className={styles.status}
                data-type={screensaverStatus.status}
              >
                <span className="material-icons">
                  {screensaverStatus.status === 'error'
                    ? 'error_outline'
                    : 'check_circle'}
                </span>
                {screensaverStatus.message}
              </div>
            )}
          </div>
        )}
        {patches !== null && isDev ? (
          <div className={styles.patches}>
            <h2>Patches</h2>

            {patches ? (
              patches.map(patch => (
                <Patch
                  key={patch.name}
                  {...patch}
                  onApply={() => applyPatch(patch.name)}
                />
              ))
            ) : (
              <div className={styles.status}>
                <span className="material-icons">info_outline</span>
                Please connect your CarThing to see and install patches!
              </div>
            )}
          </div>
        ) : null}
      </div>
    )
  )
}

const Patch: React.FC<{
  name: string
  description: string
  installed: boolean
  onApply: () => void
}> = ({ name, description, installed, onApply }) => {
  const [applying, setApplying] = useState(false)

  return (
    <div className={styles.patch}>
      <div className={styles.info}>
        <h3>{name}</h3>
        <p>{description}</p>
      </div>
      {applying ? (
        <Loader />
      ) : installed ? (
        <span className="material-icons">check</span>
      ) : (
        <button
          onClick={() => {
            setApplying(true)
            onApply()
          }}
        >
          <span className="material-icons">get_app</span>
        </button>
      )}
    </div>
  )
}

const AppearanceTab: React.FC = () => {
  const [darkMode, setDarkMode] = useState(true)

  useEffect(() => {
    if (darkMode === false) {
      setTimeout(() => {
        setDarkMode(true)
      }, 100)
    }
  }, [darkMode])

  return (
    <div className={styles.settingsTab}>
      <ToggleSetting
        label="Dark mode"
        description={
          darkMode ? 'Enable dark mode for the app.' : 'sike u thought'
        }
        value={darkMode}
        onChange={value => setDarkMode(value)}
      />
    </div>
  )
}

const StartupTab: React.FC = () => {
  const [loaded, setLoaded] = useState(false)
  const settings = useRef<{
    launchOnStartup?: boolean
    launchMinimized?: boolean
    installOnStartup?: boolean
  }>({})

  useEffect(() => {
    async function loadSettings() {
      settings.current = {
        launchOnStartup:
          (await window.api.getStorageValue('launchOnStartup')) === true,
        launchMinimized:
          (await window.api.getStorageValue('launchMinimized')) === true
      }
      setLoaded(true)
    }

    loadSettings()
  }, [])

  return (
    loaded && (
      <div className={styles.settingsTab}>
        <ToggleSetting
          label="Launch on startup"
          description="Starts the app when you log in. This will also start the server."
          defaultValue={settings.current.launchOnStartup ?? false}
          onChange={value =>
            window.api.setStorageValue('launchOnStartup', value)
          }
        />
        <ToggleSetting
          label="Launch minimized"
          description="Starts the app minimized in the system tray."
          defaultValue={settings.current.launchMinimized ?? false}
          onChange={value =>
            window.api.setStorageValue('launchMinimized', value)
          }
        />
      </div>
    )
  )
}

type GoogleStatus = Awaited<ReturnType<typeof window.api.getGoogleStatus>>
type GoogleCalendar = Extract<
  Awaited<ReturnType<typeof window.api.getGoogleCalendars>>,
  { ok: true }
>['calendars'][number]
type GoogleTaskList = Extract<
  Awaited<ReturnType<typeof window.api.getGoogleTaskLists>>,
  { ok: true }
>['taskLists'][number]

const GoogleTab: React.FC = () => {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [message, setMessage] = useState<{
    text: string
    type: 'error' | 'success'
  } | null>(null)
  const [calendars, setCalendars] = useState<GoogleCalendar[] | null>(null)
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [taskLists, setTaskLists] = useState<GoogleTaskList[] | null>(null)
  const [taskListError, setTaskListError] = useState<string | null>(null)

  async function loadStatus() {
    const s = await window.api.getGoogleStatus()
    setStatus(s)
    if (s.clientSource === 'settings') setClientId(s.clientId)
  }

  useEffect(() => {
    loadStatus()
  }, [])

  useEffect(() => {
    if (!status?.connected) {
      setCalendars(null)
      setCalendarError(null)
      setTaskLists(null)
      setTaskListError(null)
      return
    }

    let cancelled = false
    window.api.getGoogleCalendars().then(res => {
      if (cancelled) return
      if (res.ok) {
        setCalendars(res.calendars)
        setCalendarError(null)
      } else {
        setCalendarError(res.error)
      }
    })
    window.api.getGoogleTaskLists().then(res => {
      if (cancelled) return
      if (res.ok) {
        setTaskLists(res.taskLists)
        setTaskListError(null)
      } else {
        setTaskListError(res.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [status?.connected])

  async function saveClient() {
    const id = clientId.trim()
    const secret = clientSecret.trim()
    if (id && !secret) {
      setMessage({ text: 'Enter the client secret too.', type: 'error' })
      return
    }
    setStatus(await window.api.setGoogleClient(id, secret))
    setClientSecret('')
    setMessage({
      text: id ? 'OAuth client saved.' : 'OAuth client cleared.',
      type: 'success'
    })
  }

  async function connect() {
    setConnecting(true)
    setMessage(null)
    const res = await window.api.connectGoogle()
    setConnecting(false)
    setMessage(
      res.ok
        ? { text: 'Google account connected.', type: 'success' }
        : { text: res.error, type: 'error' }
    )
    await loadStatus()
  }

  async function disconnect() {
    await window.api.disconnectGoogle()
    setMessage(null)
    await loadStatus()
  }

  function toggleCalendar(id: string, selected: boolean) {
    if (!calendars) return
    const next = calendars.map(c => (c.id === id ? { ...c, selected } : c))
    setCalendars(next)
    window.api.setGoogleCalendars(next.filter(c => c.selected).map(c => c.id))
  }

  function selectTaskList(id: string) {
    if (!taskLists) return
    setTaskLists(taskLists.map(l => ({ ...l, selected: l.id === id })))
    window.api.setGoogleTaskList(id)
  }

  if (!status) return null

  return (
    <div className={styles.settingsTab}>
      <div className={styles.googleSection}>
        <p>OAuth client</p>
        <p className={styles.description}>
          {status.clientSource === 'build'
            ? 'This app has a built-in Google client. Enter your own to use it instead.'
            : 'Create a Desktop app OAuth client in your Google Cloud project and paste its ID and secret here.'}{' '}
          <a
            href={status.setupGuideUrl}
            target="_blank"
            rel="noreferrer"
          >
            Setup guide
          </a>
        </p>
        <input
          type="text"
          placeholder="Client ID"
          value={clientId}
          onChange={e => setClientId(e.target.value)}
        />
        <input
          type="password"
          placeholder={
            status.clientSource === 'settings'
              ? 'Client secret (saved)'
              : 'Client secret'
          }
          value={clientSecret}
          onChange={e => setClientSecret(e.target.value)}
        />
        <div className={styles.actions}>
          <button onClick={saveClient}>Save</button>
          {status.clientSource === 'settings' && (
            <button
              onClick={() => {
                setClientId('')
                setClientSecret('')
                window.api
                  .setGoogleClient('', '')
                  .then(setStatus)
                  .then(() =>
                    setMessage({
                      text: 'OAuth client cleared.',
                      type: 'success'
                    })
                  )
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className={styles.googleSection}>
        <p>Google account</p>
        <p className={styles.description}>
          {status.connected
            ? 'Connected. Calendar events and tasks show on the Car Thing.'
            : connecting
              ? 'Waiting for you to sign in from your browser...'
              : 'Not connected.'}
        </p>
        <div className={styles.actions}>
          {status.connected ? (
            <button data-type="danger" onClick={disconnect}>
              Disconnect
            </button>
          ) : (
            <button
              disabled={!status.configured || connecting}
              onClick={connect}
            >
              Connect
            </button>
          )}
        </div>
        {message && <p className={styles[message.type]}>{message.text}</p>}
      </div>

      {status.connected && (
        <div className={styles.googleSection}>
          <p>Calendars</p>
          <p className={styles.description}>
            Events from the checked calendars show on the Car Thing.
          </p>
          {calendarError && <p className={styles.error}>{calendarError}</p>}
          {!calendars && !calendarError && (
            <p className={styles.description}>Loading calendars...</p>
          )}
          {calendars?.map(calendar => (
            <label key={calendar.id} className={styles.calendarOption}>
              <input
                type="checkbox"
                checked={calendar.selected}
                onChange={e => toggleCalendar(calendar.id, e.target.checked)}
              />
              <span
                className={styles.swatch}
                style={{ backgroundColor: calendar.color }}
              />
              {calendar.name}
            </label>
          ))}
        </div>
      )}

      {status.connected && (
        <div className={styles.googleSection}>
          <p>Task list</p>
          <p className={styles.description}>
            Tasks from this list show on the Car Thing. Ticking one there
            completes it in Google Tasks.
          </p>
          {taskListError && (
            <p className={styles.error}>{taskListError}</p>
          )}
          {!taskLists && !taskListError && (
            <p className={styles.description}>Loading task lists...</p>
          )}
          {taskLists?.map(list => (
            <label key={list.id} className={styles.taskListOption}>
              <input
                type="radio"
                name="googleTaskList"
                checked={list.selected}
                onChange={() => selectTaskList(list.id)}
              />
              {list.name}
              {list.isDefault && (
                <span className={styles.note}>(default)</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

type FantasyLeague = Extract<
  Awaited<ReturnType<typeof window.api.getFantasyLeagues>>,
  { ok: true }
>['leagues'][number]

const FantasyTab: React.FC = () => {
  const [loaded, setLoaded] = useState(false)
  const [username, setUsername] = useState('')
  const [savedUsername, setSavedUsername] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [leagues, setLeagues] = useState<FantasyLeague[] | null>(null)
  const [leagueId, setLeagueId] = useState<string | null>(null)
  const [season, setSeason] = useState('')
  const [message, setMessage] = useState<{
    text: string
    type: 'error' | 'success'
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.getFantasyStatus().then(status => {
      if (cancelled) return
      setUsername(status.username ?? '')
      setSavedUsername(status.username)
      setLeagueId(status.leagueId)
      setLoaded(true)
      if (!status.username) return
      window.api.getFantasyLeagues().then(res => {
        if (cancelled) return
        if (res.ok) {
          setLeagues(res.leagues)
          setLeagueId(res.leagueId)
          setSeason(res.season)
        } else {
          setMessage({ text: res.error, type: 'error' })
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setSaving(true)
    setMessage(null)
    const res = await window.api.setFantasyUsername(username)
    setSaving(false)
    if (!res.ok) {
      setMessage({ text: res.error, type: 'error' })
      return
    }
    setSavedUsername(res.username)
    setUsername(res.username ?? '')
    setLeagues(res.username ? res.leagues : null)
    setLeagueId(res.leagueId)
    setSeason(res.season)
    setMessage({
      text: res.username ? 'Sleeper username saved.' : 'Sleeper username cleared.',
      type: 'success'
    })
  }

  function selectLeague(id: string) {
    setLeagueId(id)
    window.api.setFantasyLeague(id)
  }

  if (!loaded) return null

  return (
    <div className={styles.settingsTab}>
      <div className={styles.googleSection}>
        <p>Sleeper username</p>
        <p className={styles.description}>
          The Fantasy tab on the Car Thing shows your current Sleeper
          matchup. Sleeper data is public, so no password is needed.
        </p>
        <input
          type="text"
          placeholder="Sleeper username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
          }}
        />
        <div className={styles.actions}>
          <button disabled={saving} onClick={save}>
            {saving ? 'Checking...' : 'Save'}
          </button>
        </div>
        {message && <p className={styles[message.type]}>{message.text}</p>}
      </div>

      {savedUsername && leagues && (
        <div className={styles.googleSection}>
          <p>League</p>
          {leagues.length === 0 ? (
            <p className={styles.description}>
              No leagues found for the {season} season.
            </p>
          ) : leagues.length === 1 ? (
            <p className={styles.description}>
              Showing {leagues[0].name}, your only league this season.
            </p>
          ) : (
            <>
              <p className={styles.description}>
                The Car Thing shows your matchup in this league.
              </p>
              {leagues.map(league => (
                <label key={league.id} className={styles.taskListOption}>
                  <input
                    type="radio"
                    name="sleeperLeague"
                    checked={league.id === leagueId}
                    onChange={() => selectLeague(league.id)}
                  />
                  {league.name}
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const AdvancedTab: React.FC = () => {
  const { setDevMode } = useContext(DevModeContext)
  const [loaded, setLoaded] = useState(false)
  const settings = useRef<{
    disableSocketAuth?: boolean
    logLevel?: number
    port?: number | null
  }>({})

  useEffect(() => {
    async function loadSettings() {
      settings.current = {
        disableSocketAuth:
          (await window.api.getStorageValue('disableSocketAuth')) === true,
        logLevel: ((await window.api.getStorageValue('logLevel')) ||
          1) as number,
        port: ((await window.api.getStorageValue('port')) || null) as
          | number
          | null
      }

      setLoaded(true)
    }

    loadSettings()
  }, [])

  const [portNotice, setPortNotice] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  async function changePort(newPort: number | null) {
    setPortNotice(null)

    if (newPort === settings.current.port) return

    if (newPort === null) {
      await window.api.setStorageValue('port', null)
      settings.current.port = null
    } else {
      if (isNaN(newPort) || newPort < 1024 || newPort > 65535)
        return setPortNotice({
          type: 'error',
          message: 'Port is not valid (must be between 1024 and 65535)'
        })

      if (!(await window.api.isPortOpen(newPort)))
        return setPortNotice({
          type: 'error',
          message: 'The port is unavailable, choose another one'
        })

      await window.api.setStorageValue('port', newPort)
      settings.current.port = newPort
    }

    setPortNotice({
      type: 'success',
      message: 'Port changed and server restarted!'
    })
  }

  useEffect(() => {
    if (portNotice) {
      const timeout = setTimeout(() => setPortNotice(null), 5000)

      return () => clearTimeout(timeout)
    }

    return
  }, [portNotice])

  return (
    loaded && (
      <div className={styles.settingsTab}>
        <ToggleSetting
          label="Developer Mode"
          description="Enables some options for development purposes."
          defaultValue={true}
          onChange={() => setDevMode(false)}
        />
        <SelectSetting
          label="Log Level"
          description="Useful for debugging purposes."
          defaultValue={settings.current.logLevel}
          options={[
            { value: 0, label: 'Debug' },
            { value: 1, label: 'Info' },
            { value: 2, label: 'Warn' },
            { value: 3, label: 'Error' }
          ]}
          onChange={value =>
            window.api.setStorageValue(
              'logLevel',
              parseInt(value as string)
            )
          }
        />
        <ToggleSetting
          label="Disable WebSocket Authentication"
          description="Allows connections to the WebSocket server without authentication."
          defaultValue={settings.current.disableSocketAuth ?? false}
          onChange={value =>
            window.api.setStorageValue('disableSocketAuth', value)
          }
        />
        <div className={styles.customPort}>
          <InputSubmitSetting
            label="Server Port"
            description="The port the server listens on. Leave empty to use a random available port."
            defaultValue={settings.current.port?.toString()}
            placeholder="1337"
            regex={/[\d]/}
            onSubmit={async value => {
              const port = parseInt(value)
              changePort(isNaN(port) ? null : port)
            }}
            submitLabel="Change"
          />
          {portNotice && (
            <p className={styles.notice} data-type={portNotice.type}>
              <span className="material-icons">
                {portNotice.type === 'success' ? 'check_circle' : 'error'}
              </span>
              {portNotice.message}
            </p>
          )}
        </div>
      </div>
    )
  )
}

const LogsTab: React.FC = () => {
  const logsRef = useRef<HTMLDivElement>(null)
  const [logs, setLogs] = useState<string[]>([])

  const [loaded, setLoaded] = useState(false)
  const settings = useRef<{
    logLevel?: number
  }>({})

  useEffect(() => {
    async function loadSettings() {
      settings.current = {
        logLevel: ((await window.api.getStorageValue('logLevel')) ||
          1) as number
      }
      setLoaded(true)
    }

    loadSettings()
  }, [])

  useEffect(() => {
    const updateLogs = async () => setLogs(await window.api.getLogs())

    const interval = setInterval(() => {
      updateLogs()
    }, 500)

    updateLogs()

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scroll({
        top: logsRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [logsRef.current])

  useEffect(() => {
    if (logsRef.current) {
      const currentScroll =
        logsRef.current.scrollHeight - logsRef.current.clientHeight

      if (currentScroll <= logsRef.current.scrollTop + 200) {
        logsRef.current.scroll({
          top: logsRef.current.scrollHeight,
          behavior: 'smooth'
        })
      }
    }
  }, [logs])

  return loaded ? (
    <div className={styles.logsTab}>
      <div className={styles.logs} ref={logsRef}>
        {logs.map((log, i) => (
          <p key={i} className={styles.log}>
            {log}
          </p>
        ))}
      </div>
      <div className={styles.controls}>
        <div className={styles.level}>
          <p>Log level</p>
          <select
            defaultValue={settings.current.logLevel}
            onChange={e =>
              window.api.setStorageValue(
                'logLevel',
                parseInt(e.target.value as string)
              )
            }
          >
            <option value="0">Debug</option>
            <option value="1">Info</option>
            <option value="2">Warn</option>
            <option value="3">Error</option>
          </select>
        </div>
        <div className={styles.buttons}>
          <button
            onClick={() => window.api.clearLogs().then(() => setLogs([]))}
            className={styles.clear}
            data-type="danger"
          >
            <span className="material-icons">delete_forever</span>
          </button>
          <button
            onClick={() => window.api.downloadLogs()}
            className={styles.download}
          >
            <span className="material-icons">download</span>
          </button>
        </div>
      </div>
    </div>
  ) : null
}

const AboutTab: React.FC = () => {
  const { devMode, setDevMode } = useContext(DevModeContext)
  const { channel } = useContext(ChannelContext)

  const [version, setVersion] = useState<string | null>(null)
  const [timesClicked, setTimesClicked] = useState(0)

  useEffect(() => {
    window.api.getVersion().then(setVersion)
  }, [])

  useEffect(() => {
    if (timesClicked <= 0) return

    if (devMode) return

    if (timesClicked >= 5) setDevMode(true)
  }, [timesClicked])

  return (
    <div className={styles.aboutTab}>
      <div className={styles.app}>
        <img src={channel === 'nightly' ? iconNightly : icon} alt="" />
        <div className={styles.info}>
          <h2>GlanceThing{channel === 'nightly' ? ' Nightly' : ''}</h2>
          <p
            onClick={() => setTimesClicked(t => (t += 1))}
            className={styles.version}
          >
            Version {version}
          </p>
        </div>
      </div>
      <h2>Credits</h2>
      <div className={styles.credit}>
        <img src="https://api.bludood.com/avatar?size=48" alt="" />
        <div className={styles.info}>
          <a href="https://bludood.com" target="_blank" rel="noreferrer">
            BluDood
          </a>
          <p>GlanceThing Developer</p>
        </div>
      </div>
      <div className={styles.credit}>
        <img
          src="https://avatars.githubusercontent.com/u/131838720?size=48"
          alt=""
        />
        <div className={styles.info}>
          <a
            href="https://github.com/ItsRiprod"
            target="_blank"
            rel="noreferrer"
          >
            ItsRiprod
          </a>
          <p>Developer of DeskThing, heavily inspired this project</p>
        </div>
      </div>
    </div>
  )
}

export default Settings
