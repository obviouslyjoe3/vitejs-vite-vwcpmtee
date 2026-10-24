// "Remind me about this message": stored per person in this browser. A reminder fires while Parley is open.
const key = (meId) => `parley:reminders:${meId}`;

export const loadReminders = (meId) => {
  try {
    const list = JSON.parse(localStorage.getItem(key(meId)) || '[]');
    return Array.isArray(list) ? list.filter((r) => r && r.id && r.room && r.at) : [];
  } catch {
    return [];
  }
};

export const saveReminders = (meId, list) => {
  try {
    localStorage.setItem(key(meId), JSON.stringify(list.slice(-100)));
  } catch {}
};

// Choices shown in the message menu. `at` is computed when picked.
export const REMIND_CHOICES = [
  ['In 20 minutes', () => Date.now() + 20 * 60_000],
  ['In 1 hour', () => Date.now() + 60 * 60_000],
  ['In 3 hours', () => Date.now() + 3 * 60 * 60_000],
  [
    'Tomorrow, 9 am',
    () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    },
  ],
];
