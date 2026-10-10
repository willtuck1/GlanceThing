import { describe, expect, it } from 'vitest'

import {
  ClockWidgetId,
  moveWidget,
  toggleWidget,
  widgetRows
} from './clockForm.js'

const widgets: { id: ClockWidgetId; label: string }[] = [
  { id: 'weather', label: 'Weather' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'todo', label: 'To-do' }
]

const settings = {
  widgets: {
    order: ['todo', 'weather', 'calendar'] as ClockWidgetId[],
    hidden: ['weather'] as ClockWidgetId[]
  }
}

describe('clockForm', () => {
  it('lists rows in settings order', () => {
    expect(widgetRows(settings, widgets)).toEqual([
      { id: 'todo', label: 'To-do', shown: true },
      { id: 'weather', label: 'Weather', shown: false },
      { id: 'calendar', label: 'Calendar', shown: true }
    ])
  })

  it('toggles a widget on and off, allowing all hidden', () => {
    expect(toggleWidget(settings, 'weather').widgets.hidden).toEqual([])
    expect(toggleWidget(settings, 'todo').widgets.hidden).toEqual([
      'weather',
      'todo'
    ])
    const all = {
      widgets: {
        order: settings.widgets.order,
        hidden: ['todo', 'weather'] as ClockWidgetId[]
      }
    }
    expect(toggleWidget(all, 'calendar').widgets.hidden).toHaveLength(3)
  })

  it('moves widgets and ignores the ends', () => {
    expect(moveWidget(settings, 'weather', -1).widgets.order).toEqual([
      'weather',
      'todo',
      'calendar'
    ])
    expect(moveWidget(settings, 'todo', 1).widgets.order).toEqual([
      'weather',
      'todo',
      'calendar'
    ])
    expect(moveWidget(settings, 'todo', -1).widgets.order).toEqual(
      settings.widgets.order
    )
    expect(moveWidget(settings, 'calendar', 1).widgets.order).toEqual(
      settings.widgets.order
    )
  })
})
