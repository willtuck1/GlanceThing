export const TUTORIAL_SEEN_KEY = 'connectorTutorialSeen'

export const TUTORIAL_STEPS: { title: string; body: string }[] = [
  {
    title: 'What is a connector?',
    body: 'A connector is a tab on your Car Thing that shows data from a web address. For example, a tab for the weather in your town or the status of a website.'
  },
  {
    title: 'Pick a preset or paste an address',
    body: 'Press "Add connector". Choose a ready-made preset if there is one for your service. Otherwise paste the web address of your data.'
  },
  {
    title: 'Fill in the fields',
    body: 'Give the tab a name. If the service needs a key, open the preset\'s sign-up link to get one. Never share your key. It stays on this computer.'
  },
  {
    title: 'Pick what to show',
    body: 'Press "Fetch sample" to load the data. Then click the items in the tree to choose which ones to show on the tab.'
  },
  {
    title: 'Test it',
    body: 'Press "Test" to see a preview of the tab. If it looks wrong, change your picks and test again.'
  },
  {
    title: 'Save',
    body: 'Press "Save". The connector now appears in the list and the tab is sent to your Car Thing.'
  },
  {
    title: 'Show or reorder the tab',
    body: 'Open Settings, then Tabs. There you can show or hide your new tab and move it up or down in the order.'
  }
]

export function nextStep(i: number, n: number): number {
  return Math.min(i + 1, Math.max(n - 1, 0))
}

export function prevStep(i: number): number {
  return Math.max(i - 1, 0)
}

export function isLastStep(i: number, n: number): boolean {
  return i >= n - 1
}

export function shouldAutoOpen(seen: unknown): boolean {
  return !(seen === true || seen === 'true')
}
