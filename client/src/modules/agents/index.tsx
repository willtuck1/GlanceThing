import AgentsTab from './AgentsTab.tsx'

import type { ClientModule } from '../types.ts'

export const module: ClientModule = {
  id: 'agents',
  label: 'Agents',
  render: active => <AgentsTab active={active} />
}
