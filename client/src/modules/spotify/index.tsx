import Widgets from '@/components/Widgets/Widgets.tsx'

import type { ClientModule } from '../types.ts'

export const module: ClientModule = {
  id: 'spotify',
  label: 'Spotify',
  render: () => <Widgets />
}
