import { respondWithFeed } from '../feeds/respond.js'
import { getFeed } from '../feeds/registry.js'
import { googleErrorMessage } from '../google/errors.js'
import { setTaskDone } from '../google/tasks.js'
import { googlePatch } from '../google/tasksSettings.js'
import { parseToggle, toggleTask } from '../google/todoToggle.js'
import { log, LogLevel } from '../utils.js'

import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'

export const name = 'todo'

export const hasActions = true

export const handle: HandlerFunction = async ws => {
  respondWithFeed('todo', ws)
}

export const actions: HandlerAction[] = [
  {
    action: 'toggle',
    handle: async (ws, data) => {
      const req = parseToggle(data)
      if (!req) {
        log('Ignoring toggle without reqId', 'Todo', LogLevel.WARN)
        return
      }

      const ack =
        'invalid' in req
          ? { reqId: req.reqId, ok: false, error: 'Invalid request' }
          : await toggleTask(req, {
              setDone: (listId, id, done) =>
                setTaskDone(googlePatch, listId, id, done, Date.now()),
              refetch: () => void getFeed('todo')?.refetch(),
              describeError: googleErrorMessage
            })

      if (!ack.ok)
        log(`Task toggle failed: ${ack.error}`, 'Todo', LogLevel.WARN)

      ws.send(JSON.stringify({ type: 'todo', action: 'ack', data: ack }))
    }
  }
]
