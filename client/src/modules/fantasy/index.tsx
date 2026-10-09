import Fantasy from './Fantasy.tsx'

import type { ClientModule } from '../types.ts'

export const module: ClientModule = {
  id: 'fantasy',
  label: 'Fantasy',
  render: active => <Fantasy active={active} />
}
