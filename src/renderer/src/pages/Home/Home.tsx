import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { DevModeContext } from '@/contexts/DevModeContext.js'
import { ModalContext } from '@/contexts/ModalContext.js'
import { GOOGLE_SETUP_URL } from '@/lib/setupGuide.js'

import icon from '@/assets/icon.png'
import iconNightly from '@/assets/icon-nightly.png'

import styles from './Home.module.css'
import { ChannelContext } from '@/contexts/ChannelContext.js'

enum CarThingState {
  NotFound = 'not_found',
  NotInstalled = 'not_installed',
  Installing = 'installing',
  Ready = 'ready'
}

const Home: React.FC = () => {
  const navigate = useNavigate()
  const { devMode } = useContext(DevModeContext)
  const { channel } = useContext(ChannelContext)
  const { openModals, setModalOpen } = useContext(ModalContext)
  const [hasCustomClient, setHasCustomClient] = useState(false)
  const [googleStatus, setGoogleStatus] = useState<Awaited<
    ReturnType<typeof window.api.getGoogleStatus>
  > | null>(null)

  const [carThingState, setCarThingState] = useState<CarThingState | null>(
    null
  )
  const carThingStateRef = useRef(carThingState)
  const [needsPlaybackSetup, setNeedsPlaybackSetup] = useState(false)

  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string
    latestVersion: string
    downloadUrl: string
  } | null>(null)

  useEffect(() => {
    window.api.getStorageValue('setupComplete').then(setupComplete => {
      if (!setupComplete) navigate('/setup')
    })

    const removeListener = window.api.on('carThingState', async s => {
      const state = s as CarThingState

      setCarThingState(state)
      carThingStateRef.current = state
    })

    const stateTimeout = setTimeout(() => {
      if (carThingStateRef.current !== null) return

      window.api.triggerCarThingStateUpdate()
    }, 200)

    window.api.getStorageValue('playbackHandler').then(handler => {
      if (handler === null) setNeedsPlaybackSetup(true)
    })

    window.api.checkUpdate().then(setUpdateInfo)

    const checkUpdateInterval = setInterval(
      () => window.api.checkUpdate().then(setUpdateInfo),
      1000 * 60 * 30
    )

    return () => {
      removeListener()
      clearTimeout(stateTimeout)
      clearInterval(checkUpdateInterval)
    }
  }, [])

  // Re-read when Settings closes, since that is where Google is set up,
  // and every minute to catch a revoke found by the feeds.
  const settingsOpen = openModals.includes('settings')
  useEffect(() => {
    if (settingsOpen) return
    const load = () => window.api.getGoogleStatus().then(setGoogleStatus)
    load()
    const interval = setInterval(load, 60 * 1000)
    return () => clearInterval(interval)
  }, [settingsOpen])

  const updateHasCustomClient = async () =>
    setHasCustomClient(await window.api.hasCustomClient())

  useEffect(() => {
    updateHasCustomClient()
  }, [devMode])

  return (
    <div className={styles.home}>
      <img src={channel === 'nightly' ? iconNightly : icon} alt="" />
      <h1>GlanceThing{channel === 'nightly' ? ' Nightly' : ''}</h1>
      <div className={styles.status}>
        {carThingState === CarThingState.NotFound ? (
          <>
            <p>
              CarThing not found. Please reconnect it to your computer, or
              run setup again.
            </p>
            <button onClick={() => navigate('/setup')}>
              Setup <span className="material-icons">arrow_forward</span>
            </button>
          </>
        ) : carThingState === CarThingState.NotInstalled ? (
          <>
            <p>CarThing found, but the app is not installed.</p>
            <button onClick={() => navigate('/setup')}>
              Setup <span className="material-icons">arrow_forward</span>
            </button>
          </>
        ) : carThingState === CarThingState.Installing ? (
          <p>
            CarThing found, but the app is not installed. Installing...
          </p>
        ) : carThingState === CarThingState.Ready ? (
          <p>CarThing is ready!</p>
        ) : (
          <p>Checking for CarThing...</p>
        )}
      </div>
      {needsPlaybackSetup && carThingState === CarThingState.Ready ? (
        <div className={styles.notice}>
          <p>You have not set up a playback handler yet!</p>
          <button onClick={() => navigate('/setup?step=3')}>
            Set up now
          </button>
        </div>
      ) : null}
      {googleStatus && !googleStatus.connected ? (
        <div className={styles.notice} data-type="warning">
          <p>
            <span className="material-icons">warning</span>
            {!googleStatus.configured
              ? 'Google is not set up. The Calendar and To-do tabs stay empty until it is.'
              : googleStatus.revoked
                ? 'Google access was revoked or expired. Reconnect it in Settings.'
                : 'Connect your Google account in Settings to see events and tasks.'}
          </p>
          <div className={styles.noticeActions}>
            {!googleStatus.configured && (
              <button onClick={() => window.open(GOOGLE_SETUP_URL)}>
                Setup guide{' '}
                <span className="material-icons">open_in_new</span>
              </button>
            )}
            <button onClick={() => setModalOpen('settings', true)}>
              Settings
            </button>
          </div>
        </div>
      ) : null}
      {devMode && hasCustomClient ? (
        <div className={styles.notice} data-type="warning">
          <p>
            <span className="material-icons">warning</span>
            You have a custom client installed!
          </p>
          <button
            data-type="danger"
            onClick={() =>
              window.api.removeCustomClient().then(updateHasCustomClient)
            }
          >
            Remove
          </button>
        </div>
      ) : null}
      {updateInfo &&
      updateInfo.latestVersion !== updateInfo.currentVersion ? (
        <div className={styles.update}>
          <div className={styles.title}>
            <span className="material-icons">download</span>A new
            GlanceThing update is available!
          </div>
          <div className={styles.content}>
            <p className={styles.version}>
              {updateInfo.currentVersion}{' '}
              <span className="material-icons">arrow_forward</span>{' '}
              {updateInfo.latestVersion}
            </p>
            <button onClick={() => window.open(updateInfo.downloadUrl)}>
              Download <span className="material-icons">open_in_new</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Home
