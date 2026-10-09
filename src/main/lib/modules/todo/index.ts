import { getGoogleStatus } from '../../google/auth.js'
import { googleGet } from '../../google/calendarSettings.js'
import { createTasksFetcher } from '../../google/tasks.js'
import { TASKS_INTERVAL } from '../../google/tasksLogic.js'
import { describeGoogleError } from '../../google/session.js'
import { getSelectedTaskList } from '../../google/tasksSettings.js'
import { setStorageValue } from '../../storage.js'
import { ModuleManifest } from '../types.js'

import * as handler from './handler.js'

export const manifest: ModuleManifest = {
  id: 'todo',
  label: 'To-do',
  feeds: () => [
    {
      key: 'todo',
      fetch: createTasksFetcher({
        get: googleGet,
        getSelected: getSelectedTaskList,
        now: () => Date.now()
      }),
      interval: () => TASKS_INTERVAL,
      describeError: describeGoogleError,
      // Same as Calendar: no stale tasks from an earlier account.
      prepare: () => {
        if (!getGoogleStatus().connected)
          setStorageValue('feedCache.todo', null)
      }
    }
  ],
  handlers: [handler],
  settings: { panel: 'google' }
}
