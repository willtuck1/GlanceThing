import { useFeed } from '@/hooks/useFeed.ts'

import StaleBadge from '@/components/StaleBadge/StaleBadge.tsx'
import WeatherIcon from './icons.tsx'
import { barHeight } from './view.ts'

import type { WeatherView } from '@/types/Feeds.ts'

import styles from './Weather.module.css'

const BAR_MAX_PX = 56

const Weather: React.FC<{ active: boolean }> = ({ active }) => {
  const feed = useFeed<WeatherView>('weather', active)
  const view = feed.items[0] ?? null
  const forecast = view?.kind === 'forecast' ? view : null

  return (
    <div className={styles.tab}>
      <StaleBadge stale={feed.stale} label={feed.fetchedAtLabel} />

      {feed.loaded && !forecast && (
        <div className={styles.empty}>
          {view?.kind === 'none'
            ? view.message
            : (feed.error ?? 'Set a location in Settings')}
        </div>
      )}

      {forecast && (
        <>
          <div className={styles.top}>
            <div className={styles.main}>
              <div className={styles.temp}>
                {forecast.current.tempLabel}
              </div>
              <div className={styles.iconWrap}>
                <WeatherIcon name={forecast.current.icon} size={96} />
              </div>
            </div>
            <div className={styles.details}>
              <div className={styles.location}>
                {forecast.locationName}
              </div>
              <div className={styles.condition}>
                {forecast.current.label}
              </div>
              <div className={styles.meta}>
                <span>H</span>
                {forecast.highLabel}
                {'  '}
                <span>L</span>
                {forecast.lowLabel}
                {'  '}
                <span>Precip</span>
                {forecast.precipLabel}
              </div>
              <div className={styles.meta}>
                <span>Sunrise</span>
                {forecast.sunriseLabel}
                {'  '}
                <span>Sunset</span>
                {forecast.sunsetLabel}
              </div>
            </div>
          </div>

          <div className={styles.strip}>
            {forecast.hours.slice(0, 12).map((h, i) => (
              <div key={i} className={styles.hour}>
                <div className={styles.hourTime}>{h.timeLabel}</div>
                <div className={styles.hourTemp}>{h.tempLabel}</div>
                <div className={styles.barArea}>
                  <div
                    className={styles.bar}
                    style={{ height: barHeight(h.precipPct, BAR_MAX_PX) }}
                  />
                </div>
                <div className={styles.pct}>{h.precipPct}%</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default Weather
