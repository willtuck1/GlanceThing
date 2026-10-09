import { app } from 'electron'
import fs from 'fs'
import path from 'path'

import { log, LogLevel, safeParse } from '../utils.js'
import { createPlayerStore, PlayersFile } from './players.js'
import { sleeperGet } from './sleeper.js'

// The slim player list lives next to storage.json, outside it, so the
// settings file stays small.
function filePath() {
  return path.join(app.getPath('userData'), 'sleeper-players.json')
}

function read(): PlayersFile | null {
  try {
    const file = filePath()
    if (!fs.existsSync(file)) return null
    return safeParse(fs.readFileSync(file, 'utf8')) as PlayersFile | null
  } catch {
    return null
  }
}

function write(file: PlayersFile) {
  try {
    fs.writeFileSync(filePath(), JSON.stringify(file), 'utf8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`Couldn't save the Sleeper player list: ${msg}`, 'Fantasy', LogLevel.WARN)
  }
}

export const getPlayers = createPlayerStore({
  download: () => sleeperGet('/players/nfl'),
  read,
  write,
  now: () => Date.now(),
  log: message => log(message, 'Fantasy', LogLevel.WARN)
})
