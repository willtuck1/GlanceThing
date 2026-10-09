import Sports from './Sports.tsx'

import type { ClientModule } from '../types.ts'

export const module: ClientModule = {
  id: 'sports',
  label: 'Sports',
  render: active => <Sports active={active} />
}
