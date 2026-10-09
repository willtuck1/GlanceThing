import { Handler } from '../../types/WebSocketHandler.js'
import { modules } from '../modules/registry.js'

import * as apps from './apps.js'
import * as display from './display.js'
import * as lock from './lock.js'
import * as ping from './ping.js'
import * as reboot from './reboot.js'
import * as restore from './restore.js'
import * as screensaver from './screensaver.js'
import * as sleep from './sleep.js'
import * as time from './time.js'
import * as update from './update.js'
import * as version from './version.js'
import * as wake from './wake.js'

export const coreHandlers: Handler[] = [
  apps,
  display,
  lock,
  ping,
  reboot,
  restore,
  screensaver,
  sleep,
  time,
  update,
  version,
  wake
]

export const handlers: Handler[] = [
  ...coreHandlers,
  ...modules.flatMap(m => m.handlers)
]
