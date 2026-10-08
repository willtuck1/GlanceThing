import {
  listAdbDevices,
  reconnectOfflineDevices,
  resetSocketConnection,
  restartAdbServer
} from './adb.js'
import {
  decideTunnelReset,
  decideUsbRecovery,
  initialTunnelState,
  initialUsbState,
  parseAdbDevices
} from './recovery.js'
import { serverManager } from './server.js'
import { log, LogLevel } from './utils.js'

let usbState = initialUsbState
let tunnelState = initialTunnelState
let loggedMissing = false

// Runs after each Car Thing state check (every 5 s). Tries to win back a
// device that dropped off USB, or a client that never reconnected.
export async function watchCarThing(
  found: string | null,
  installed: boolean
) {
  const now = Date.now()

  if (found) {
    loggedMissing = false
    usbState = decideUsbRecovery(usbState, {
      found: true,
      devices: [],
      now
    }).next
  } else if (usbState.wasFound) {
    const raw = await listAdbDevices().catch(
      e => `adb devices failed: ${e}`
    )
    if (!loggedMissing) {
      // Tells offline, unauthorized and missing apart in the logs.
      log(
        `Car Thing lost. adb devices:\n${raw.trim()}`,
        'Watchdog',
        LogLevel.WARN
      )
      loggedMissing = true
    }

    const decision = decideUsbRecovery(usbState, {
      found: false,
      devices: parseAdbDevices(raw),
      now
    })
    usbState = decision.next

    if (decision.action === 'reconnect-offline') {
      log('Reconnecting offline adb devices', 'Watchdog', LogLevel.WARN)
      await reconnectOfflineDevices()
    } else if (decision.action === 'restart-server') {
      log('Restarting the adb server', 'Watchdog', LogLevel.WARN)
      await restartAdbServer()
    }
  }

  const server = serverManager.getServerInfo()
  const tunnel = decideTunnelReset(tunnelState, {
    deviceReady: !!found && installed && server.running,
    hasClient: serverManager.hasClient(),
    now
  })
  tunnelState = tunnel.next

  if (tunnel.reset && found) {
    log(
      'Car Thing has not reconnected; resetting the tunnel and browser',
      'Watchdog',
      LogLevel.WARN
    )
    await resetSocketConnection(found)
  }
}
