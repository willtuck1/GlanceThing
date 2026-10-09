import { module as weather } from './weather/index.tsx'
import { module as calendar } from './calendar/index.tsx'
import { module as todo } from './todo/index.tsx'
import { module as sports } from './sports/index.tsx'
import { module as fantasy } from './fantasy/index.tsx'
import { module as spotify } from './spotify/index.tsx'

import type { ClientModule } from './types.ts'

// Tab order. Adding a tab is one folder plus one line here.
export const modules: ClientModule[] = [
  weather,
  calendar,
  todo,
  sports,
  fantasy,
  spotify
]
