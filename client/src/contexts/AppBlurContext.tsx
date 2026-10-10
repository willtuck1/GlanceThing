import React, { createContext, useState } from 'react'

interface AppBlurContextProps {
  blurred: boolean
  setBlurred: (blurred: boolean) => void
  playerShown: boolean
  setPlayerShown: (shown: boolean) => void
}

const AppBlurContext = createContext<AppBlurContextProps>({
  blurred: false,
  setBlurred: () => {},
  playerShown: false,
  setPlayerShown: () => {}
})

interface AppBlurContextProviderProps {
  children: React.ReactNode
}

const AppBlurContextProvider = ({
  children
}: AppBlurContextProviderProps) => {
  const [blurred, setBlurred] = useState(false)
  const [playerShown, setPlayerShown] = useState(false)

  return (
    <AppBlurContext.Provider
      value={{
        blurred,
        setBlurred,
        playerShown,
        setPlayerShown
      }}
    >
      {children}
    </AppBlurContext.Provider>
  )
}

export { AppBlurContext, AppBlurContextProvider }
