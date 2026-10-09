export interface ClientModule {
  id: string
  label: string
  render: (active: boolean) => React.ReactNode
}
