import { ModuleManifest } from '../types.js'

import * as handler from './handler.js'

export const manifest: ModuleManifest = {
  id: 'spotify',
  label: 'Spotify',
  feeds: () => [],
  handlers: [handler]
}
