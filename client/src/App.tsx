import { useContext, useEffect, useMemo, useRef, useState } from 'react'

import { AppBlurContext } from '@/contexts/AppBlurContext.tsx'
import { SocketContext } from '@/contexts/SocketContext.tsx'
import { TabsContext } from '@/contexts/TabsContext.tsx'

import FullescreenPlayer from './components/FullscreenPlayer/FullscreenPlayer.tsx'
import LoadingScreen from '@/components/LoadingScreen/LoadingScreen.tsx'
import UpdateScreen from './components/UpdateScreen/UpdateScreen.tsx'
import Statusbar from '@/components/Statusbar/Statusbar.tsx'
import TabPager, { TabPage } from '@/components/TabPager/TabPager.tsx'
import Menu from '@/components/Menu/Menu.tsx'
import { modules } from '@/modules/registry.ts'
import { pagerKeyForFirstReply } from '@/components/TabPager/keys.ts'
import { visibleIds } from '@/modules/tabs.ts'

import styles from './App.module.css'

const allPages: TabPage[] = modules.map(m => ({
  key: m.id,
  render: m.render
}))
const allIds = modules.map(m => m.id)

const App: React.FC = () => {
  const { blurred } = useContext(AppBlurContext)
  const { ready } = useContext(SocketContext)
  const tabs = useContext(TabsContext)
  const [playerShown, setPlayerShown] = useState(false)

  const idKey = visibleIds(tabs, allIds).join(',')
  // Decided once, on the first host reply; later changes keep the tab.
  const pagerKey = useRef<'default' | 'host'>('default')
  const decided = useRef(false)
  if (tabs && !decided.current) {
    decided.current = true
    pagerKey.current = pagerKeyForFirstReply(idKey.split(','), allIds)
  }
  const pages = useMemo(
    () =>
      idKey
        .split(',')
        .map(id => allPages.find(p => p.key === id))
        .filter((p): p is TabPage => !!p),
    [idKey]
  )

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlayerShown(s => !s)
      }
    }

    document.addEventListener('keydown', listener)

    return () => {
      document.removeEventListener('keydown', listener)
    }
  })

  return (
    <>
      <div className={styles.app} data-blurred={blurred || !ready}>
        <Statusbar />
        {/* Remounts once, only if the host's first tab settings differ from
            the default, so the pager starts on the first visible tab. */}
        <TabPager key={pagerKey.current} pages={pages} />
        <FullescreenPlayer shown={playerShown} setShown={setPlayerShown} />
      </div>
      <LoadingScreen />
      <UpdateScreen />
      <Menu />
    </>
  )
}

export default App
