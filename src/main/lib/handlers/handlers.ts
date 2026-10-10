import { isConnectorModuleId } from '../connectors/types.js'
import { Handler } from '../../types/WebSocketHandler.js'
import { allModules, modules } from '../modules/registry.js'

import * as apps from './apps.js'
import * as display from './display.js'
import * as keylog from './keylog.js'
import * as lock from './lock.js'
import * as ping from './ping.js'
import * as reboot from './reboot.js'
import * as restore from './restore.js'
import * as screensaver from './screensaver.js'
import * as sleep from './sleep.js'
import * as tabs from './tabs.js'
import * as time from './time.js'
import * as update from './update.js'
import * as version from './version.js'
import * as wake from './wake.js'

export const coreHandlers: Handler[] = [
  apps,
  display,
  keylog,
  lock,
  ping,
  reboot,
  restore,
  screensaver,
  sleep,
  tabs,
  time,
  update,
  version,
  wake
]

// Built on first use: module manifests import server.ts (via time.ts), which
// imports this file, so reading the registry at load time could see it
// half-initialized.
let all: Handler[] | null = null

export function getHandlers(): Handler[] {
  all ??= [...coreHandlers, ...modules.flatMap(m => m.handlers)]
  return all
}

/**
 * Looks up the handler for a message type. `json:` and `mcp:` names are connector
 * handlers, read at call time because connectors come and go at runtime;
 * every other name is the static list.
 */
export function findHandler(name: string): Handler | undefined {
  if (typeof name === 'string' && isConnectorModuleId(name))
    return allModules()
      .flatMap(m => m.handlers)
      .find(h => h.name === name)
  return getHandlers().find(h => h.name === name)
}
