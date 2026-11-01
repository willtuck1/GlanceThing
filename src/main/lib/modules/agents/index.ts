import { ModuleManifest } from '../types.js'

import * as agentsHandler from './handler.js'

export const manifest: ModuleManifest = {
  id: 'agents',
  label: 'Agents',
  feedKeys: [],
  feeds: () => [],
  handlers: [agentsHandler],
  settings: { panel: 'agents' }
}
