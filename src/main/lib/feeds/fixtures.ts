import { CalendarEvent, Game, Task } from './types.js'

export const calendarFixture: CalendarEvent[] = [
  {
    id: 'ev1',
    title: 'Team standup',
    allDay: false,
    startLabel: '09:30',
    endLabel: '09:45',
    dayLabel: 'Today',
    location: 'Zoom',
    calendarColor: '#4285f4'
  },
  {
    id: 'ev2',
    title: 'Dentist',
    allDay: false,
    startLabel: '14:00',
    endLabel: '15:00',
    dayLabel: 'Today',
    location: '12 Example Street',
    calendarColor: '#0b8043'
  },
  {
    id: 'ev3',
    title: 'Birthday: Sam',
    allDay: true,
    startLabel: '',
    endLabel: '',
    dayLabel: 'Tomorrow',
    calendarColor: '#d50000'
  },
  {
    id: 'ev4',
    title: 'Project review',
    allDay: false,
    startLabel: '11:00',
    endLabel: '12:00',
    dayLabel: 'Tomorrow',
    calendarColor: '#4285f4'
  }
]

export const todoFixture: Task[] = [
  { id: 't1', listId: 'l1', title: 'Buy groceries', done: false },
  {
    id: 't2',
    listId: 'l1',
    title: 'Send invoice',
    done: false,
    dueLabel: 'Thu 9 Oct'
  },
  { id: 't3', listId: 'l1', title: 'Book flights', done: false },
  { id: 't4', listId: 'l1', title: 'Renew passport', done: true }
]

export const sportsFixture: Game[] = [
  {
    id: 'g1',
    league: 'nba',
    home: { key: 'nba:BOS', abbr: 'BOS', name: 'Celtics', score: 88 },
    away: { key: 'nba:LAL', abbr: 'LAL', name: 'Lakers', score: 84 },
    state: 'in',
    detail: 'Q3 4:12'
  },
  {
    id: 'g2',
    league: 'nfl',
    home: { key: 'nfl:KC', abbr: 'KC', name: 'Chiefs', score: 27 },
    away: { key: 'nfl:BUF', abbr: 'BUF', name: 'Bills', score: 24 },
    state: 'post',
    detail: 'Final'
  },
  {
    id: 'g3',
    league: 'nba',
    home: { key: 'nba:GSW', abbr: 'GSW', name: 'Warriors', score: null },
    away: { key: 'nba:DEN', abbr: 'DEN', name: 'Nuggets', score: null },
    state: 'pre',
    detail: '7:30 PM'
  }
]
