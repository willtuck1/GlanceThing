export interface WeatherHour {
  timeLabel: string
  tempLabel: string
  precipPct: number
}

// The one item of the weather feed: the forecast, or why there is none.
export type WeatherView =
  | {
      kind: 'forecast'
      locationName: string
      units: 'imperial' | 'metric'
      current: {
        tempLabel: string
        code: number
        label: string
        icon: string
      }
      highLabel: string
      lowLabel: string
      sunriseLabel: string
      sunsetLabel: string
      precipLabel: string
      hours: WeatherHour[]
    }
  | { kind: 'none'; message: string }
