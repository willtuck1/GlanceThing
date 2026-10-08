import styles from './StaleBadge.module.css'

interface StaleBadgeProps {
  stale: boolean
  label: string
}

const StaleBadge: React.FC<StaleBadgeProps> = ({ stale, label }) => {
  if (!stale) return null

  return (
    <div className={styles.badge}>
      <span className="material-icons">sync_problem</span>
      <span className={styles.text}>
        {label ? `Updated ${label}` : 'No data yet'}
      </span>
    </div>
  )
}

export default StaleBadge
