import { iconFor } from './view.ts'

const STROKE = {
  fill: 'none',
  stroke: '#fff',
  strokeWidth: 3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}
const CLOUD =
  'M20 46h28a10 10 0 0 0 0-20 14 14 0 0 0-27-3A12 12 0 0 0 20 46z'
const SUN = '#ffc83d'

const Sun: React.FC<{ cx?: number; cy?: number; r?: number }> = ({
  cx = 32,
  cy = 32,
  r = 11
}) => {
  const rays = []
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    const x1 = cx + Math.cos(a) * (r + 5)
    const y1 = cy + Math.sin(a) * (r + 5)
    const x2 = cx + Math.cos(a) * (r + 10)
    const y2 = cy + Math.sin(a) * (r + 10)
    rays.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={SUN}
        strokeWidth={3}
        strokeLinecap="round"
      />
    )
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={SUN} />
      {rays}
    </g>
  )
}

const Moon: React.FC<{ x?: number; y?: number; s?: number }> = ({
  x = 0,
  y = 0,
  s = 1
}) => (
  <path
    transform={`translate(${x} ${y}) scale(${s})`}
    d="M40 38A16 16 0 0 1 26 14a16 16 0 1 0 14 24z"
    fill="#cfd8ff"
  />
)

const Cloud: React.FC<{ transform?: string }> = ({ transform }) => (
  <path d={CLOUD} transform={transform} {...STROKE} fill="#555" />
)

function body(name: string): React.ReactNode {
  switch (name) {
    case 'clear':
      return <Sun />
    case 'clear-night':
      return <Moon x={6} y={8} s={1.2} />
    case 'partly':
      return (
        <>
          <Sun cx={24} cy={24} r={8} />
          <Cloud transform="translate(4 4)" />
        </>
      )
    case 'partly-night':
      return (
        <>
          <Moon x={0} y={0} s={0.9} />
          <Cloud transform="translate(4 4)" />
        </>
      )
    case 'fog':
      return (
        <>
          <line x1="12" y1="22" x2="52" y2="22" {...STROKE} />
          <line x1="8" y1="32" x2="48" y2="32" {...STROKE} />
          <line x1="14" y1="42" x2="54" y2="42" {...STROKE} />
        </>
      )
    case 'drizzle':
      return (
        <>
          <Cloud transform="translate(0 -8)" />
          <line
            x1="22"
            y1="46"
            x2="21"
            y2="50"
            stroke="#6ab7ff"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <line
            x1="32"
            y1="46"
            x2="31"
            y2="50"
            stroke="#6ab7ff"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <line
            x1="42"
            y1="46"
            x2="41"
            y2="50"
            stroke="#6ab7ff"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      )
    case 'rain':
      return (
        <>
          <Cloud transform="translate(0 -8)" />
          <line
            x1="22"
            y1="46"
            x2="18"
            y2="56"
            stroke="#6ab7ff"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <line
            x1="32"
            y1="46"
            x2="28"
            y2="56"
            stroke="#6ab7ff"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <line
            x1="42"
            y1="46"
            x2="38"
            y2="56"
            stroke="#6ab7ff"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      )
    case 'snow':
      return (
        <>
          <Cloud transform="translate(0 -8)" />
          <circle cx="22" cy="50" r="2.5" fill="#fff" />
          <circle cx="32" cy="55" r="2.5" fill="#fff" />
          <circle cx="42" cy="50" r="2.5" fill="#fff" />
        </>
      )
    case 'storm':
      return (
        <>
          <Cloud transform="translate(0 -8)" />
          <path d="M34 36l-8 12h7l-4 11 11-15h-7z" fill={SUN} />
        </>
      )
    default:
      return <Cloud />
  }
}

const WeatherIcon: React.FC<{ name: string; size?: number }> = ({
  name,
  size = 64
}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    {body(iconFor(name))}
  </svg>
)

export default WeatherIcon
