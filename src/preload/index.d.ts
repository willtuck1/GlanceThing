import '@electron-toolkit/preload'

interface Shortcut {
  id: string
  command: string
}

interface GoogleStatus {
  configured: boolean
  clientSource: 'settings' | 'build' | null
  clientId: string
  connected: boolean
  // docs/SETUP.md in the repo this build came from.
  setupGuideUrl: string
}

interface GoogleCalendarOption {
  id: string
  name: string
  color: string
  primary: boolean
  selected: boolean
}

interface GoogleTaskListOption {
  id: string
  name: string
  isDefault: boolean
  selected: boolean
}

interface FantasyStatus {
  username: string | null
  leagueId: string | null
}

interface FantasyLeagues {
  leagues: { id: string; name: string }[]
  // The league the tab shows, null without any.
  leagueId: string | null
  season: string
}

// JSON connectors (M9B); shapes copied from src/main/lib/connectors.
// Responses never carry a header value, only its name and `headerSet`.
type ConnectorLayout = 'list' | 'number' | 'keyvalue' | 'grid'

type ConnectorMapping =
  | {
      itemsPath: string
      primary: string
      secondary?: string
      value?: string
    }
  | { itemsPath: string; label: string; value: string }
  | { value: string; caption?: string; unit?: string; decimals?: number }
  | { pairs: { label: string; path: string }[] }

interface ConnectorBase {
  id: string
  label: string
  layout: ConnectorLayout
  mapping: ConnectorMapping
  intervalMin: number
}

interface JsonConnectorForSettings extends ConnectorBase {
  source: { kind: 'json'; url: string; header?: { name: string } }
  headerSet: boolean
}

interface McpConnectorForSettings extends ConnectorBase {
  source: {
    kind: 'mcp'
    recipeId: string
    serverUrl: string
    settings?: Record<string, string>
  }
  headerSet: false
  // Never a token, registration or the full client ID.
  auth: 'signedIn' | 'expired' | 'signedOut' | 'notRequired'
  clientIdSet: boolean
  // '••••' plus the last 4 characters.
  clientIdHint?: string
}

type ConnectorForSettings =
  | JsonConnectorForSettings
  | McpConnectorForSettings

interface ConnectorDraft {
  // Omit for a new connector.
  id?: string
  label: string
  layout: ConnectorLayout
  mapping: ConnectorMapping
  intervalMin: number
  url: string
  // undefined = keep, null = clear, {name, value} = set both,
  // {name} = rename and keep the stored value.
  header?: { name: string; value?: string } | null
}

interface McpDraft {
  // Omit for a new connector; a connector can't change kind.
  id?: string
  kind: 'mcp'
  label: string
  intervalMin?: number
  recipeId: string
  serverUrl: string
  settings?: Record<string, string>
  // undefined = keep, null = clear.
  clientId?: string | null
}

interface McpRecipeInfo {
  id: string
  label: string
  description: string
  defaultServerUrl?: string
  layout: ConnectorLayout
  source: 'tool' | 'resource'
  settings: {
    key: string
    label: string
    placeholder?: string
    maxLength: number
  }[]
  intervalMin: number
}

type ConnectorView =
  | {
      layout: 'list'
      rows: { primary: string; secondary?: string; value?: string }[]
      more: number
    }
  | {
      layout: 'grid'
      cells: { label: string; value: string }[]
      more: number
    }
  | { layout: 'number'; value: string; unit?: string; caption?: string }
  | { layout: 'keyvalue'; pairs: { label: string; value: string }[] }

declare global {
  interface Window {
    api: {
      on: (
        channel: string,
        listener: (...args: unknown[]) => void
      ) => () => void
      findCarThing: () => Promise<string | boolean>
      findSetupCarThing: () => Promise<
        'not_found' | 'not_installed' | 'ready'
      >
      rebootCarThing: () => Promise<void>
      restoreCarThing: () => Promise<void>
      installApp: () => Promise<string | true>
      startServer: () => Promise<void>
      stopServer: () => Promise<void>
      getServerInfo: () => Promise<{
        running: boolean
        port: number | null
      }>
      forwardSocketServer: () => Promise<void>
      getVersion: () => Promise<string>
      getStorageValue: (key: string) => Promise<unknown>
      setStorageValue: (key: string, value: unknown) => Promise
      triggerCarThingStateUpdate: () => void
      uploadShortcutImage: (name: string) => Promise<string>
      removeNewShortcutImage: () => Promise<void>
      getShortcuts: () => Promise<Shortcut[]>
      addShortcut: (shortcut: Shortcut) => Promise<void>
      removeShortcut: (id: string) => Promise<void>
      updateShortcut: (shortcut: Shortcut) => Promise<void>
      isDevMode: () => Promise<boolean>
      getBrightness: () => Promise<number>
      setBrightness: (brightness: number) => Promise<void>
      getPatches: () => Promise<
        { name: string; description: string; installed: boolean }[] | false
      >
      applyPatch: (patchName: string) => Promise<void>
      validateConfig: (
        handlerName: string,
        config: unknown
      ) => Promise<boolean>
      getPlaybackHandlerConfig: (handlerName: string) => Promise<unknown>
      setPlaybackHandlerConfig: (
        handlerName: string,
        config: unknown
      ) => Promise<void>
      restartPlaybackHandler: () => Promise<void>
      hasCustomClient: () => Promise<boolean>
      importCustomClient: () => Promise<void>
      removeCustomClient: () => Promise<void>
      getLogs: () => Promise<string[]>
      clearLogs: () => Promise<void>
      downloadLogs: () => Promise<void>
      uploadScreensaverImage: () => Promise<{
        success: boolean
        error?: string
        message?: string
      }>
      removeScreensaverImage: () => Promise<boolean>
      hasCustomScreensaverImage: () => Promise<boolean>
      openDevTools: () => void
      getChannel: () => Promise<'stable' | 'nightly'>
      checkUpdate: () => Promise<{
        currentVersion: string
        latestVersion: string
        downloadUrl: string
      } | null>
      findOpenPort: () => Promise<number>
      isPortOpen: (port: number) => Promise<boolean>
      getGoogleStatus: () => Promise<GoogleStatus>
      setGoogleClient: (
        clientId: string,
        clientSecret: string
      ) => Promise<GoogleStatus>
      connectGoogle: () => Promise<
        { ok: true } | { ok: false; error: string }
      >
      disconnectGoogle: () => Promise<void>
      getGoogleCalendars: () => Promise<
        | { ok: true; calendars: GoogleCalendarOption[] }
        | { ok: false; error: string }
      >
      setGoogleCalendars: (ids: string[]) => Promise<void>
      getGoogleTaskLists: () => Promise<
        | { ok: true; taskLists: GoogleTaskListOption[] }
        | { ok: false; error: string }
      >
      setGoogleTaskList: (id: string) => Promise<void>
      getFantasyStatus: () => Promise<FantasyStatus>
      setFantasyUsername: (
        username: string
      ) => Promise<
        | ({ ok: true; username: string | null } & FantasyLeagues)
        | { ok: false; error: string }
      >
      getFantasyLeagues: () => Promise<
        ({ ok: true } & FantasyLeagues) | { ok: false; error: string }
      >
      setFantasyLeague: (id: string) => Promise<void>
      getDisplaySettings: () => Promise<{
        sportsTintOpacity: number
        calendarTintOpacity: number
      }>
      setDisplaySettings: (settings: {
        sportsTintOpacity?: number
        calendarTintOpacity?: number
      }) => Promise<{
        sportsTintOpacity: number
        calendarTintOpacity: number
      }>
      getTabSettings: () => Promise<{
        settings: { order: string[]; hidden: string[] }
        modules: { id: string; label: string }[]
      }>
      setTabSettings: (settings: {
        order: string[]
        hidden: string[]
      }) => Promise<{ order: string[]; hidden: string[] }>
      searchWeatherLocations: (query: string) => Promise<
        {
          name: string
          label: string
          latitude: number
          longitude: number
        }[]
      >
      getWeatherSettings: () => Promise<{
        location: {
          name: string
          latitude: number
          longitude: number
        } | null
        units: 'imperial' | 'metric'
      }>
      setWeatherSettings: (settings: {
        location?: {
          name: string
          latitude: number
          longitude: number
        } | null
        units?: 'imperial' | 'metric'
      }) => Promise<{
        location: {
          name: string
          latitude: number
          longitude: number
        } | null
        units: 'imperial' | 'metric'
      }>
      listConnectors: () => Promise<ConnectorForSettings[]>
      // Rejects with a readable message when the draft is invalid.
      saveConnector: (
        draft: ConnectorDraft | McpDraft
      ) => Promise<ConnectorForSettings>
      deleteConnector: (id: string) => Promise<boolean>
      // Never rejects.
      testConnector: (
        draft: ConnectorDraft | McpDraft
      ) => Promise<{ view?: ConnectorView; error?: string }>
      listMcpRecipes: () => Promise<McpRecipeInfo[]>
      mcpSignIn: (id: string) => Promise<{ ok: true } | { error: string }>
      mcpSignOut: (id: string) => Promise<boolean>
    }
  }
}
