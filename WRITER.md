# Adding a daily lesson (for any writer, human or bot)

There is one way to add a lesson: `scripts/add-lesson.js`. It adds exactly one
lesson and never rewrites, reorders or removes the lessons already there. Do not
write `lessons.json` yourself, and never push a whole new copy of it.

1. Put the new lesson, as one JSON object, in its own file, for example
   `new-lesson.json`. It needs the same fields as the other lessons: `date`
   (YYYY-MM-DD), `title`, `image`, `imageAlt`, `fallback`, `source`, `quote`,
   `lesson`, `today` and 1 to 3 `lanes`. `sourceUrl` and the Spanish `_es`
   fields are recommended. Make sure the file holds real text: check it opens
   as JSON before you go on.
2. From the repo root, run:

   ```
   node scripts/add-lesson.js new-lesson.json
   ```

   It prints `added 2026-10-15: 63 -> 64`. If it prints an error (a missing
   field, a date that already has a lesson, or a file that is not JSON), stop
   and fix the lesson file. Nothing was changed.
3. Then commit and push only `lessons.json`:

   ```
   git add lessons.json
   git commit -m "Add 2026-10-15 lesson: <title>"
   git push
   ```

Do not commit `new-lesson.json`. If a push ever breaks `lessons.json` (bad JSON,
fewer lessons, or a lesson that fails the schema), the lessons.json guard
workflow rejects it and puts back the last good list plus any valid new lesson.
