import Controls from './widgets/Controls/Controls.tsx'
import Player from './widgets/Player/Player.tsx'
import Apps from './widgets/Apps/Apps.tsx'

import styles from './Widgets.module.css'

const Widgets: React.FC = () => {
  return (
    <div className={styles.widgets}>
      <Player />
      <div className={styles.column}>
        <Apps />
        <Controls />
      </div>
    </div>
  )
}

export default Widgets
