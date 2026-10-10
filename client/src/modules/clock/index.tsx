import ClockTab from './ClockTab.tsx'

import type { ClientModule } from '../types.ts'

export const module: ClientModule = {
  id: 'clock',
  label: 'Clock',
  render: active => <ClockTab active={active} />
}
