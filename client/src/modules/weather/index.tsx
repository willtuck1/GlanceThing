import Weather from './Weather.tsx'

import type { ClientModule } from '../types.ts'

export const module: ClientModule = {
  id: 'weather',
  label: 'Weather',
  render: active => <Weather active={active} />
}
