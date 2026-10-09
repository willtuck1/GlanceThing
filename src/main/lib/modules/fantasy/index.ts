import { getFeed } from '../../feeds/registry.js'
import { FantasyView, FeedPayload, Game } from '../../feeds/types.js'
import { decorateFantasy } from '../../fantasy/gameStatus.js'
import { fantasyInterval } from '../../fantasy/logic.js'
import { getPlayers } from '../../fantasy/playersDisk.js'
import { sportsSnapshot } from '../../fantasy/sportsLink.js'
import {
  createProjectionStore,
  projectionsGet
} from '../../fantasy/projections.js'
import {
  getFantasySettings,
  setFantasyUserId
} from '../../fantasy/settings.js'
import {
  createFantasyFetcher,
  describeFantasyError,
  sleeperGet
} from '../../fantasy/sleeper.js'
import { setStorageValue } from '../../storage.js'
import { formatDate } from '../../time.js'
import { log, LogLevel } from '../../utils.js'
import { ModuleManifest } from '../types.js'

import * as handler from './handler.js'

export const manifest: ModuleManifest = {
  id: 'fantasy',
  label: 'Fantasy',
  feedKeys: ['fantasy'],
  feeds: () => [
    {
      key: 'fantasy',
      fetch: createFantasyFetcher({
        get: sleeperGet,
        getSettings: getFantasySettings,
        saveUserId: setFantasyUserId,
        getPlayers,
        getProjections: createProjectionStore({
          get: projectionsGet,
          now: () => Date.now(),
          log: message => log(message, 'Fantasy', LogLevel.WARN)
        })
      }),
      // Fast while an NFL game is live, judged from the Sports feed's games.
      interval: () =>
        fantasyInterval(
          (getFeed('sports')?.getPayload().items ?? []) as Game[],
          Date.now()
        ),
      describeError: describeFantasyError,
      // Game status and the estimate come from the Sports feed's ESPN data.
      decorate: payload =>
        decorateFantasy(
          payload as FeedPayload<FantasyView>,
          sportsSnapshot(getFeed('sports')),
          { formatTime: ts => formatDate(new Date(ts)).time }
        ),
      // No stale matchup cached before the username was removed.
      prepare: () => {
        if (!getFantasySettings().username)
          setStorageValue('feedCache.fantasy', null)
      }
    }
  ],
  handlers: [handler],
  dependsOn: ['sports'],
  settings: { panel: 'fantasy' }
}
