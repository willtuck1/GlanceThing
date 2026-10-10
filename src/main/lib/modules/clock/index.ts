import { ModuleManifest } from '../types.js'

import * as clockHandler from './handler.js'
import * as timerHandler from './timerHandler.js'

export const manifest: ModuleManifest = {
  id: 'clock',
  label: 'Clock',
  feedKeys: [],
  feeds: () => [],
  handlers: [clockHandler, timerHandler],
  settings: { panel: 'clock' }
}
