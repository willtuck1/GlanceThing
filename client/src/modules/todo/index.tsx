import Todo from './Todo.tsx'

import type { ClientModule } from '../types.ts'

export const module: ClientModule = {
  id: 'todo',
  label: 'Todo',
  render: active => <Todo active={active} />
}
