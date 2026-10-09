import { getGoogleStatus } from '../../google/auth.js'
import { createCalendarFetcher } from '../../google/calendar.js'
import {
  getSelectedCalendars,
  googleGet
} from '../../google/calendarSettings.js'
import { CALENDAR_INTERVAL } from '../../google/calendarLogic.js'
import { describeGoogleError } from '../../google/session.js'
import { setStorageValue } from '../../storage.js'
import { formatDate } from '../../time.js'
import { ModuleManifest } from '../types.js'

import * as handler from './handler.js'

export const manifest: ModuleManifest = {
  id: 'calendar',
  label: 'Calendar',
  feedKeys: ['calendar'],
  feeds: () => [
    {
      key: 'calendar',
      fetch: createCalendarFetcher({
        get: googleGet,
        getSelected: getSelectedCalendars,
        now: () => Date.now(),
        formatTime: ts => formatDate(new Date(ts)).time
      }),
      interval: () => CALENDAR_INTERVAL,
      describeError: describeGoogleError,
      // Without a Google account, don't show events cached from an earlier
      // account (or from the M0 fixtures).
      prepare: () => {
        if (!getGoogleStatus().connected)
          setStorageValue('feedCache.calendar', null)
      }
    }
  ],
  handlers: [handler],
  settings: { panel: 'google' }
}
