export const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function scheduleReview(card, grade, now = Date.now()) {
  let interval = Number(card.interval) || 0,
    ease = Number(card.ease) || 2.5,
    repetitions = Number(card.repetitions) || 0;
  if (grade === "again") {
    interval = 0;
    repetitions = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    repetitions++;
    if (grade === "hard") {
      interval = Math.max(1, Math.round(interval * 1.2));
      ease = Math.max(1.3, ease - 0.15);
    } else if (grade === "easy") {
      interval = interval ? Math.round(interval * ease * 1.3) : 4;
      ease = Math.min(3.5, ease + 0.15);
    } else
      interval =
        repetitions === 1
          ? 1
          : repetitions === 2
            ? 6
            : Math.max(1, Math.round(interval * ease));
  }
  return {
    ...card,
    interval,
    ease,
    repetitions,
    dueAt: new Date(
      now + (grade === "again" ? 600000 : interval * 86400000),
    ).toISOString(),
    lastReviewedAt: new Date(now).toISOString(),
  };
}
export function metrics(lessons, progress, attempts, sessions) {
  const completed = lessons.filter((l) =>
    progress.some((p) => p.lessonId === l.id && p.completed),
  ).length;
  const correct = attempts.filter((a) => a.correct).length;
  const days = new Set(
    sessions.filter((s) => s.minutes > 0).map((s) => s.date),
  );
  let streak = 0,
    d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return {
    completed,
    total: lessons.length,
    percent: lessons.length
      ? Math.round((completed / lessons.length) * 100)
      : 0,
    accuracy: attempts.length
      ? Math.round((correct / attempts.length) * 100)
      : null,
    attempts: attempts.length,
    minutes: sessions.reduce((s, v) => s + (Number(v.minutes) || 0), 0),
    streak,
  };
}
export const dueCards = (cards) =>
  cards
    .filter(
      (c) =>
        !c.needsDefinition &&
        (!c.dueAt || new Date(c.dueAt).getTime() <= Date.now()),
    )
    .sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));
export function normalizeText(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
export function searchLessons(lessons, query) {
  const terms = normalizeText(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return lessons
    .map((l) => ({
      lesson: l,
      score: terms.reduce(
        (v, t) =>
          v +
          (normalizeText(l.title).includes(t) ? 5 : 0) +
          (normalizeText(l.content).includes(t) ? 1 : 0),
        0,
      ),
    }))
    .filter((v) =>
      terms.every((t) =>
        normalizeText(v.lesson.title + " " + v.lesson.content).includes(t),
      ),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((x) => x.lesson);
}
