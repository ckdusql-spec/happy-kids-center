'use client'

import { getDayLabel } from '@/lib/dateUtils'
import type { ScheduleEntry } from '@/types/schedule'
import ScheduleCell from './ScheduleCell'

interface Props {
  selectedDate: string
  timeSlots: string[]
  entries: ScheduleEntry[]
}

export default function ScheduleGrid({ selectedDate, timeSlots, entries }: Props) {
  const findEntry = (timeSlot: string, roomNumber: number) =>
    entries.find(
      (e) => e.date === selectedDate && e.timeSlot === timeSlot && e.roomNumber === roomNumber,
    )

  return (
    <div className="space-y-3">
      <div className="text-lg font-semibold">
        {selectedDate} {getDayLabel(selectedDate)}
      </div>

      <table className="w-full border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">시간</th>
            {[1, 2, 3, 4, 5, 6, 7].map((room) => (
              <th key={room} className="border p-2">{room}번교실</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((time) => (
            <tr key={time}>
              <td className="border p-2">{time}</td>
              {[1, 2, 3, 4, 5, 6, 7].map((room) => (
                <td key={`${time}-${room}`} className="border p-2 align-top">
                  <ScheduleCell
                    date={selectedDate}
                    timeSlot={time}
                    roomNumber={room}
                    entry={findEntry(time, room)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}