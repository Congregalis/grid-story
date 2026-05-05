WITH books_to_shift AS (
  SELECT "book_id"
  FROM "chapter"
  GROUP BY "book_id"
  HAVING MIN("order") = 0
)
UPDATE "chapter"
SET "order" = "order" + 1
WHERE "book_id" IN (SELECT "book_id" FROM books_to_shift);
