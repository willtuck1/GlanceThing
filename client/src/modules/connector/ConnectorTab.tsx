import { useFeed } from '@/hooks/useFeed.ts'

import StaleBadge from '@/components/StaleBadge/StaleBadge.tsx'
import List from './List.tsx'
import BigNumber from './BigNumber.tsx'
import KeyValue from './KeyValue.tsx'
import Grid from './Grid.tsx'

import type { ConnectorView, FeedType } from '@/types/Feeds.ts'
import type { Layout } from './types.ts'

import tabStyles from '../tab.module.css'
import styles from './Connector.module.css'

interface ConnectorTabProps {
  id: string
  label: string
  layout: Layout
  active: boolean
}

const ConnectorTab: React.FC<ConnectorTabProps> = ({
  id,
  label,
  active
}) => {
  const feed = useFeed<ConnectorView>(id as FeedType, active)
  const view = feed.items[0] ?? null

  return (
    <div className={tabStyles.tab} data-scroll-container>
      <StaleBadge stale={feed.stale} label={feed.fetchedAtLabel} />
      <div className={tabStyles.heading}>{label}</div>

      {feed.loaded && !view && (
        <div className={tabStyles.empty}>{feed.error ?? 'No data'}</div>
      )}
      {view && feed.error && (
        <div className={styles.error}>{feed.error}</div>
      )}

      {view?.layout === 'list' && <List view={view} active={active} />}
      {view?.layout === 'number' && <BigNumber view={view} />}
      {view?.layout === 'keyvalue' && <KeyValue view={view} />}
      {view?.layout === 'grid' && <Grid view={view} />}
    </div>
  )
}

export default ConnectorTab
