import { manifest as calendar } from './calendar/index.js'
import { manifest as fantasy } from './fantasy/index.js'
import { manifest as spotify } from './spotify/index.js'
import { manifest as sports } from './sports/index.js'
import { manifest as todo } from './todo/index.js'
import { manifest as weather } from './weather/index.js'
import { ModuleManifest } from './types.js'

/** Default tab order. Adding an app is one folder plus one line here. */
export const modules: ModuleManifest[] = [
  weather,
  calendar,
  todo,
  sports,
  fantasy,
  spotify
]

export function getModule(id: string) {
  return modules.find(m => m.id === id)
}
