import ConnectorTab from './ConnectorTab.tsx'

import type { ClientModule } from '../types.ts'
import type { ConnectorDescriptor } from './types.ts'

export function connectorModule(d: ConnectorDescriptor): ClientModule {
  return {
    id: d.id,
    label: d.label,
    render: active => (
      <ConnectorTab
        key={d.id}
        id={d.id}
        label={d.label}
        layout={d.layout}
        active={active}
      />
    )
  }
}
