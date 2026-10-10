import { app } from 'electron'

// https://github.com/electron/electron/issues/46538
if (process.platform === 'linux')
  app.commandLine.appendSwitch('gtk-version', '3')

import {
  shell,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  Notification,
  protocol,
  net,
  nativeImage
} from 'electron'

import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'

import {
  getPlaybackHandlerConfig,
  getStorageValue,
  loadStorage,
  setPlaybackHandlerConfig,
  setStorageValue
} from './lib/storage.js'
import {
  clearLogs,
  downloadLogs,
  findOpenPort,
  getLogs,
  isDev,
  isNightly,
  isPortOpen,
  log,
  LogLevel,
  resourceFolder,
  setLogLevel
} from './lib/utils.js'
import {
  findCarThing,
  rebootCarThing,
  installApp,
  checkInstalledApp,
  forwardSocketServer,
  getAdbExecutable,
  getBrightness,
  setBrightnessSmooth,
  getAutoBrightness,
  setAutoBrightness,
  restore
} from './lib/adb.js'
import {
  getShortcuts,
  addShortcut,
  removeShortcut,
  updateShortcut,
  uploadShortcutImage,
  getShortcutImagePath,
  removeShortcutImage,
  updateApps
} from './lib/shortcuts.js'

import {
  hasCustomWebApp,
  importCustomWebApp,
  removeCustomWebApp
} from './lib/webapp.js'
import {
  uploadScreensaverImage,
  removeScreensaverImage,
  hasCustomScreensaverImage
} from './lib/screensaver.js'

import { playbackManager } from './lib/playback/playback.js'
import { applyPatch, getPatches } from './lib/patches.js'
import { getLatestVersion } from './lib/update.js'
import { serverManager } from './lib/server.js'
import { isProtectedStorageKey } from './lib/connectors/store.js'
import {
  ipcDeleteConnector,
  ipcListConnectors,
  ipcSaveConnector,
  ipcTestConnector
} from './lib/connectors/ipc.js'
import {
  ipcListMcpRecipes,
  ipcMcpSignIn,
  ipcMcpSignOut
} from './lib/mcp/ipc.js'
import {
  CLOCK_WIDGETS,
  clockPayload,
  getClockSettings,
  setClockSettings
} from './lib/clock/settings.js'
import { getDisplaySettings, setDisplaySettings } from './lib/display.js'
import { allModules } from './lib/modules/registry.js'
import {
  getTabSettings,
  setTabSettings,
  tabsPayload
} from './lib/modules/tabs.js'
import { applyTabSettings } from './lib/setup/feeds.js'
import { getFeed } from './lib/feeds/registry.js'
import { searchLocations } from './lib/weather/openMeteo.js'
import { applyWeatherSettings } from './lib/weather/service.js'
import { getWeatherSettings } from './lib/weather/settings.js'
import * as fantasy from './lib/fantasy/service.js'
import * as google from './lib/google/service.js'
import { watchCarThing } from './lib/watchdog.js'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux'
      ? { icon: `${resourceFolder}/icon.png` }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    },
    titleBarStyle: 'hidden',
    resizable: false,
    maximizable: false,
    minimizable: false
  })

  mainWindow.on('ready-to-show', async () => {
    mainWindow!.show()
    mainWindow!.center()
    mainWindow?.setWindowButtonVisibility?.(false)
    app.dock?.show()
  })

  mainWindow.on('closed', () => {
    const firstClose = getStorageValue('firstClose')

    if (firstClose !== false) {
      setStorageValue('firstClose', false)

      new Notification({
        title: 'Still Running!',
        body: 'GlanceThing has been minimized to the system tray, and is still running in the background!'
      }).show()
    }
    mainWindow = null
    app.dock?.hide()
  })

  mainWindow.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.focus()
  } else {
    createWindow()
  }
})

app.on('ready', async () => {
  log('Welcome!', 'GlanceThing')

  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) return app.quit()

  loadStorage()
  setLogLevel(getStorageValue('logLevel') ?? LogLevel.INFO)

  if (
    process.env.NODE_ENV === 'development' &&
    getStorageValue('devMode') === null
  ) {
    setStorageValue('devMode', true)
  }
  if (isDev()) log('Running in development mode', 'GlanceThing')
  electronApp.setAppUserModelId(`com.bludood.${app.getName()}`)

  const adbPath = await getAdbExecutable().catch(err => ({ err }))

  if (typeof adbPath === 'object' && adbPath.err) {
    log(
      `Failed to get ADB executable: ${adbPath.err.message}`,
      'adb',
      LogLevel.ERROR
    )
  } else {
    if (adbPath === 'adb') log('Using system adb', 'adb')
    else log(`Using downloaded ADB from path: ${adbPath}`, 'adb')
  }

  if (getStorageValue('setupComplete') === true)
    await serverManager.start()

  await setupIpcHandlers()
  await setupTray()

  serverManager.on('status', up => {
    mainWindow?.webContents.send('serverStatus', up)
  })

  protocol.handle('shortcut', req => {
    const name = req.url.split('/').pop()
    if (!name) return new Response(null, { status: 404 })
    const path = getShortcutImagePath(name.split('?')[0])
    if (!path) return new Response(null, { status: 404 })
    return net.fetch(`file://${path}`)
  })

  if (getStorageValue('launchMinimized') !== true) createWindow()
  else app.dock?.hide()
})

app.on('browser-window-created', (_, window) => {
  optimizer.watchWindowShortcuts(window)
})

app.on('window-all-closed', () => {
  // don't quit the process
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

enum IPCHandler {
  FindCarThing = 'findCarThing',
  FindSetupCarThing = 'findSetupCarThing',
  RebootCarThing = 'rebootCarThing',
  RestoreCarThing = 'restoreCarThing',
  InstallApp = 'installApp',
  StartServer = 'startServer',
  StopServer = 'stopServer',
  GetServerInfo = 'getServerInfo',
  ForwardSocketServer = 'forwardSocketServer',
  GetVersion = 'getVersion',
  GetStorageValue = 'getStorageValue',
  SetStorageValue = 'setStorageValue',
  TriggerCarThingStateUpdate = 'triggerCarThingStateUpdate',
  UploadShortcutImage = 'uploadShortcutImage',
  RemoveNewShortcutImage = 'removeNewShortcutImage',
  GetShortcuts = 'getShortcuts',
  AddShortcut = 'addShortcut',
  RemoveShortcut = 'removeShortcut',
  UpdateShortcut = 'updateShortcut',
  IsDevMode = 'isDevMode',
  GetBrightness = 'getBrightness',
  SetBrightness = 'setBrightness',
  GetPatches = 'getPatches',
  ApplyPatch = 'applyPatch',
  ValidateConfig = 'validateConfig',
  GetPlaybackHandlerConfig = 'getPlaybackHandlerConfig',
  SetPlaybackHandlerConfig = 'setPlaybackHandlerConfig',
  RestartPlaybackHandler = 'restartPlaybackHandler',
  HasCustomClient = 'hasCustomClient',
  ImportCustomClient = 'importCustomClient',
  RemoveCustomClient = 'removeCustomClient',
  GetLogs = 'getLogs',
  ClearLogs = 'clearLogs',
  DownloadLogs = 'downloadLogs',
  UploadScreensaverImage = 'uploadScreensaverImage',
  RemoveScreensaverImage = 'removeScreensaverImage',
  HasCustomScreensaverImage = 'hasCustomScreensaverImage',
  OpenDevTools = 'openDevTools',
  GetChannel = 'getChannel',
  CheckUpdate = 'checkUpdate',
  FindOpenPort = 'findOpenPort',
  IsPortOpen = 'isPortOpen',
  GetGoogleStatus = 'getGoogleStatus',
  SetGoogleClient = 'setGoogleClient',
  ConnectGoogle = 'connectGoogle',
  DisconnectGoogle = 'disconnectGoogle',
  GetGoogleCalendars = 'getGoogleCalendars',
  SetGoogleCalendars = 'setGoogleCalendars',
  GetGoogleTaskLists = 'getGoogleTaskLists',
  SetGoogleTaskList = 'setGoogleTaskList',
  GetFantasyStatus = 'getFantasyStatus',
  SetFantasyUsername = 'setFantasyUsername',
  GetFantasyLeagues = 'getFantasyLeagues',
  SetFantasyLeague = 'setFantasyLeague',
  GetDisplaySettings = 'getDisplaySettings',
  SetDisplaySettings = 'setDisplaySettings',
  GetClockSettings = 'getClockSettings',
  SetClockSettings = 'setClockSettings',
  SleepDeviceOnClock = 'sleepDeviceOnClock',
  GetTabSettings = 'getTabSettings',
  SetTabSettings = 'setTabSettings',
  SearchWeatherLocations = 'searchWeatherLocations',
  GetWeatherSettings = 'getWeatherSettings',
  SetWeatherSettings = 'setWeatherSettings',
  ListConnectors = 'listConnectors',
  SaveConnector = 'saveConnector',
  DeleteConnector = 'deleteConnector',
  TestConnector = 'testConnector',
  ListMcpRecipes = 'listMcpRecipes',
  McpSignIn = 'mcpSignIn',
  McpSignOut = 'mcpSignOut'
}

async function setupIpcHandlers() {
  ipcMain.handle(IPCHandler.FindCarThing, async () => {
    const found = await findCarThing().catch(err => ({ err }))
    if (typeof found !== 'string' && found?.err) return found.err.message
    return !!found
  })

  ipcMain.handle(IPCHandler.FindSetupCarThing, async () => {
    const found = await findCarThing()
    if (!found) return 'not_found'

    const installed = await checkInstalledApp(found)
    if (!installed) return 'not_installed'

    return 'ready'
  })

  ipcMain.handle(IPCHandler.RebootCarThing, async () => {
    await rebootCarThing(null)
  })

  ipcMain.handle(IPCHandler.RestoreCarThing, async () => {
    await restore(null)
  })

  ipcMain.handle(IPCHandler.InstallApp, async () => {
    const res = await installApp(null).catch(err => ({ err }))
    if (res && typeof res === 'object' && 'err' in res)
      return res.err.message
    return true
  })

  ipcMain.handle(IPCHandler.StartServer, async () => {
    await serverManager.start()
  })

  ipcMain.handle(IPCHandler.StopServer, async () => {
    await serverManager.stop()
  })

  ipcMain.handle(IPCHandler.GetServerInfo, async () => {
    return serverManager.getServerInfo()
  })

  ipcMain.handle(IPCHandler.ForwardSocketServer, async () => {
    await forwardSocketServer(null)
  })

  ipcMain.handle(IPCHandler.GetVersion, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPCHandler.GetStorageValue, (_event, key) => {
    if (isProtectedStorageKey(key)) return null
    return getStorageValue(key)
  })

  ipcMain.handle(IPCHandler.SetStorageValue, (_event, key, value) => {
    if (isProtectedStorageKey(key)) throw new Error('Not allowed')
    return setStorageValue(key, value)
  })

  async function carThingStateUpdate() {
    const found = await findCarThing().catch(err => {
      log(
        `Got an error while finding CarThing: ${err.message}`,
        'CarThingState',
        LogLevel.ERROR
      )
      return null
    })

    let installed = false

    if (found) {
      installed = await checkInstalledApp(found)

      if (installed) {
        mainWindow?.webContents.send('carThingState', 'ready')
        await forwardSocketServer(found)

        const autoBrightness = getStorageValue('autoBrightness') ?? true
        if ((await getAutoBrightness(found)) !== autoBrightness)
          setAutoBrightness(found, autoBrightness)

        if (!autoBrightness) {
          const brightness = getStorageValue('brightness') ?? 0.5
          if ((await getBrightness(found)) !== brightness)
            setBrightnessSmooth(found, brightness)
        }
      } else {
        const willAutoInstall = getStorageValue('installAutomatically')
        if (willAutoInstall) {
          mainWindow?.webContents.send('carThingState', 'installing')
          await installApp(found)
        } else {
          mainWindow?.webContents.send('carThingState', 'not_installed')
        }
      }
    } else {
      mainWindow?.webContents.send('carThingState', 'not_found')
    }

    await watchCarThing(found, installed).catch(err =>
      log(`Watchdog failed: ${err.message}`, 'Watchdog', LogLevel.WARN)
    )
  }

  async function interval() {
    await carThingStateUpdate().catch(err => {
      log(
        `Error updating state: ${err.message}`,
        'CarThingState',
        LogLevel.ERROR
      )
    })

    setTimeout(interval, 5000)
  }

  interval()

  ipcMain.handle(IPCHandler.TriggerCarThingStateUpdate, async () => {
    await carThingStateUpdate()
  })

  ipcMain.handle(IPCHandler.UploadShortcutImage, async (_event, name) => {
    return await uploadShortcutImage(name)
  })

  ipcMain.handle(IPCHandler.RemoveNewShortcutImage, async () => {
    return removeShortcutImage('new')
  })

  ipcMain.handle(IPCHandler.GetShortcuts, async () => {
    return getShortcuts()
  })

  ipcMain.handle(IPCHandler.AddShortcut, async (_event, shortcut) => {
    addShortcut(shortcut)
    await updateApps()
  })

  ipcMain.handle(IPCHandler.RemoveShortcut, async (_event, shortcut) => {
    removeShortcut(shortcut)
    await updateApps()
  })

  ipcMain.handle(IPCHandler.UpdateShortcut, async (_event, shortcut) => {
    updateShortcut(shortcut)
    await updateApps()
  })

  ipcMain.handle(IPCHandler.IsDevMode, async () => {
    return isDev()
  })

  ipcMain.handle(IPCHandler.GetBrightness, async () => {
    return await getBrightness(null)
  })

  ipcMain.handle(IPCHandler.SetBrightness, async (_event, value) => {
    return await setBrightnessSmooth(null, value)
  })

  ipcMain.handle(IPCHandler.GetPatches, async () => {
    return await getPatches()
  })

  ipcMain.handle(IPCHandler.ApplyPatch, async (_event, patch) => {
    return await applyPatch(patch)
  })

  ipcMain.handle(
    IPCHandler.ValidateConfig,
    async (_event, handlerName, config) => {
      const valid = playbackManager.validateConfig(handlerName, config)
      return valid
    }
  )

  ipcMain.handle(
    IPCHandler.GetPlaybackHandlerConfig,
    (_event, handlerName) => {
      return getPlaybackHandlerConfig(handlerName)
    }
  )

  ipcMain.handle(
    IPCHandler.SetPlaybackHandlerConfig,
    (_event, handlerName, config) => {
      return setPlaybackHandlerConfig(handlerName, config)
    }
  )

  ipcMain.handle(IPCHandler.RestartPlaybackHandler, async () => {
    const playbackHandler = getStorageValue('playbackHandler')
    if (!playbackHandler) return

    playbackManager.setup(playbackHandler)
  })

  ipcMain.handle(IPCHandler.HasCustomClient, async () => {
    return hasCustomWebApp()
  })

  ipcMain.handle(IPCHandler.ImportCustomClient, async () => {
    const res = await importCustomWebApp().catch(err => err.message)
    if (typeof res === 'string') return res
    await installApp(null)
    return true
  })

  ipcMain.handle(IPCHandler.RemoveCustomClient, async () => {
    await removeCustomWebApp()
    await installApp(null)
    return true
  })

  ipcMain.handle(IPCHandler.GetLogs, async () => {
    return getLogs()
  })

  ipcMain.handle(IPCHandler.ClearLogs, async () => {
    return clearLogs()
  })

  ipcMain.handle(IPCHandler.DownloadLogs, async () => {
    await downloadLogs()
  })

  ipcMain.handle(IPCHandler.UploadScreensaverImage, async () => {
    return await uploadScreensaverImage()
  })

  ipcMain.handle(IPCHandler.RemoveScreensaverImage, async () => {
    return removeScreensaverImage()
  })

  ipcMain.handle(IPCHandler.HasCustomScreensaverImage, async () => {
    return hasCustomScreensaverImage()
  })

  ipcMain.handle(IPCHandler.OpenDevTools, () => {
    if (mainWindow) {
      mainWindow.webContents.openDevTools()
    }
  })

  ipcMain.handle(IPCHandler.GetChannel, () => {
    return isNightly ? 'nightly' : 'stable'
  })

  ipcMain.handle(IPCHandler.CheckUpdate, async () => {
    const currentVersion = 'v' + app.getVersion()
    const latestVersion = await getLatestVersion()
    if (!latestVersion) return null

    return {
      currentVersion,
      latestVersion: latestVersion.version,
      downloadUrl: latestVersion.downloadUrl
    }
  })

  ipcMain.handle(IPCHandler.FindOpenPort, async () => {
    return await findOpenPort()
  })

  ipcMain.handle(IPCHandler.IsPortOpen, async (_event, port) => {
    return await isPortOpen(port as number)
  })

  ipcMain.handle(IPCHandler.GetGoogleStatus, () => {
    return google.googleStatus()
  })

  ipcMain.handle(
    IPCHandler.SetGoogleClient,
    (_event, clientId, clientSecret) => {
      return google.saveGoogleClient(clientId, clientSecret)
    }
  )

  ipcMain.handle(IPCHandler.ConnectGoogle, async () => {
    return await google.connect()
  })

  ipcMain.handle(IPCHandler.DisconnectGoogle, async () => {
    await google.disconnect()
  })

  ipcMain.handle(IPCHandler.GetGoogleCalendars, async () => {
    return await google.calendars()
  })

  ipcMain.handle(IPCHandler.SetGoogleCalendars, (_event, ids) => {
    google.saveCalendars(ids)
  })

  ipcMain.handle(IPCHandler.GetGoogleTaskLists, async () => {
    return await google.taskLists()
  })

  ipcMain.handle(IPCHandler.SetGoogleTaskList, (_event, id) => {
    google.saveTaskList(id)
  })

  ipcMain.handle(IPCHandler.GetFantasyStatus, () => {
    return fantasy.fantasyStatus()
  })

  ipcMain.handle(
    IPCHandler.SetFantasyUsername,
    async (_event, username) => {
      return await fantasy.saveUsername(username)
    }
  )

  ipcMain.handle(IPCHandler.GetFantasyLeagues, async () => {
    return await fantasy.leagues()
  })

  ipcMain.handle(IPCHandler.SetFantasyLeague, (_event, id) => {
    fantasy.saveLeague(id)
  })

  ipcMain.handle(IPCHandler.GetDisplaySettings, () => {
    return getDisplaySettings()
  })

  ipcMain.handle(IPCHandler.SetDisplaySettings, (_event, value) => {
    const settings = setDisplaySettings(value)
    serverManager.broadcast('display', settings)
    return settings
  })

  ipcMain.handle(IPCHandler.GetClockSettings, () => ({
    settings: getClockSettings(),
    widgets: CLOCK_WIDGETS
  }))

  ipcMain.handle(IPCHandler.SetClockSettings, (_event, value) => {
    const settings = setClockSettings(value)
    serverManager.broadcast('clock', clockPayload(settings))
    return settings
  })

  ipcMain.handle(IPCHandler.SleepDeviceOnClock, async () => {
    if (!serverManager.hasClient()) return false
    serverManager.broadcast('sleep', 'clock')
    try {
      await setBrightnessSmooth(null, 0.2, 10)
    } catch {
      /* the clock still shows */
    }
    return true
  })

  ipcMain.handle(IPCHandler.GetTabSettings, () => ({
    settings: getTabSettings(),
    modules: allModules().map(({ id, label }) => ({ id, label }))
  }))

  ipcMain.handle(IPCHandler.SetTabSettings, (_event, value) => {
    const settings = setTabSettings(value)
    serverManager.broadcast('tabs', tabsPayload())
    applyTabSettings(settings)
    return settings
  })

  ipcMain.handle(
    IPCHandler.SearchWeatherLocations,
    async (_event, query: unknown) => {
      try {
        return await searchLocations(String(query ?? ''))
      } catch {
        // The original error message may contain request details (the search
        // text), so throw a generic one that never reaches logs.
        throw new Error('Could not search for locations')
      }
    }
  )

  ipcMain.handle(IPCHandler.GetWeatherSettings, () => getWeatherSettings())

  ipcMain.handle(IPCHandler.SetWeatherSettings, (_event, value) =>
    applyWeatherSettings(value, getFeed('weather'))
  )

  ipcMain.handle(IPCHandler.ListConnectors, () => ipcListConnectors())

  ipcMain.handle(IPCHandler.SaveConnector, (_event, draft) =>
    ipcSaveConnector(draft)
  )

  ipcMain.handle(IPCHandler.DeleteConnector, (_event, id) =>
    ipcDeleteConnector(id)
  )

  ipcMain.handle(IPCHandler.TestConnector, (_event, draft) =>
    ipcTestConnector(draft)
  )

  ipcMain.handle(IPCHandler.ListMcpRecipes, () => ipcListMcpRecipes())

  ipcMain.handle(IPCHandler.McpSignIn, (_event, id) => ipcMcpSignIn(id))

  ipcMain.handle(IPCHandler.McpSignOut, (_event, id) => ipcMcpSignOut(id))
}

async function setupTray() {
  const icon =
    process.platform === 'darwin'
      ? nativeImage
          .createFromPath(`${resourceFolder}/tray.png`)
          .resize({ height: 24, width: 24 })
      : `${resourceFolder}/tray.png`
  const tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `GlanceThing${isNightly ? ' Nightly' : ''} v${app.getVersion()}`,
      enabled: false
    },
    {
      type: 'separator'
    },
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
        } else {
          createWindow()
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.setToolTip(
    `GlanceThing${isNightly ? ' Nightly' : ''} v${app.getVersion()}`
  )

  tray.on('click', () => {
    if (process.platform === 'darwin') return
    if (mainWindow) {
      mainWindow.show()
    } else {
      createWindow()
    }
  })
}
