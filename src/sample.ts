import { addDays, isoDate, type Daily, type Todo } from "./model"

const today = isoDate(new Date())

export const sampleDailies: Daily[] = [
  {
    id: "stretch",
    title: "Stretch",
    description: "Ten minutes on the floor",
    schedule: { kind: "every-day" },
    doneOn: null,
  },
  {
    id: "language",
    title: "Language practice",
    description: "One lesson, out loud",
    schedule: { kind: "weekdays" },
    doneOn: null,
  },
  {
    id: "walk",
    title: "Walk",
    description: "Around the block",
    schedule: { kind: "days", days: [2, 4, 6] },
    doneOn: null,
  },
  {
    id: "bed",
    title: "Make the bed",
    description: "Before leaving the room",
    schedule: { kind: "every-day" },
    doneOn: today,
  },
  {
    id: "vitamins",
    title: "Vitamins",
    description: "With breakfast",
    schedule: { kind: "every-day" },
    doneOn: today,
  },
]

export const sampleTodos: Todo[] = [
  {
    id: "insurance",
    title: "Send the insurance form",
    description: "Scan the signed pages and email them",
    start: addDays(today, -2),
    due: addDays(today, 1),
    doneOn: null,
  },
  {
    id: "gift",
    title: "Buy a gift for Ana",
    description: "Something she can open on Sunday",
    start: addDays(today, -4),
    due: addDays(today, 2),
    doneOn: null,
  },
  {
    id: "dentist",
    title: "Book the dentist",
    description: "A cleaning, morning if they have it",
    start: today,
    due: addDays(today, 4),
    doneOn: null,
  },
  {
    id: "filter",
    title: "Replace the furnace filter",
    description: "The 16 by 25 size, two of them",
    start: addDays(today, -14),
    due: addDays(today, 7),
    doneOn: null,
  },
  {
    id: "letter",
    title: "Write the rental letter",
    description: "Ask for the leak to be fixed",
    start: addDays(today, -6),
    due: addDays(today, 11),
    doneOn: null,
  },
  {
    id: "passport",
    title: "Get passport photos",
    description: "The renewal window opens next month",
    start: addDays(today, 10),
    due: addDays(today, 20),
    doneOn: null,
  },
  {
    id: "library",
    title: "Return the library books",
    description: "Two novels, on the hall table",
    start: addDays(today, -20),
    due: addDays(today, -3),
    doneOn: null,
  },
  {
    id: "plants",
    title: "Repot the fern",
    description: "The roots are coming out the bottom",
    start: addDays(today, -8),
    due: addDays(today, -1),
    doneOn: addDays(today, -1),
  },
  {
    id: "receipt",
    title: "File the old receipt",
    description: "Finished more than a week ago",
    start: addDays(today, -20),
    due: addDays(today, -12),
    doneOn: addDays(today, -10),
  },
]
