export interface CalendarEvent {
  id: string
  title: string
  allDay: boolean
  startLabel: string
  endLabel: string
  dayLabel: string
  location?: string
  calendarColor: string
}
