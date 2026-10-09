import Calendar from './Calendar.tsx'

import type { ClientModule } from '../types.ts'

export const module: ClientModule = {
  id: 'calendar',
  label: 'Calendar',
  render: active => <Calendar active={active} />
}
