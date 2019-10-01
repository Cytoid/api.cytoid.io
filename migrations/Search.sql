CREATE MATERIALIZED VIEW tags_search AS
    SELECT tag,
           count(tag),
           to_tsvector(tag) as tsv
    FROM (SELECT lower(unnest(tags)) AS tag FROM levels) AS tags
    GROUP BY tag ORDER BY count DESC;

CREATE INDEX tags_search_tsv ON tags_search USING gin(tsv);

CREATE MATERIALIZED VIEW levels_search AS
SELECT setweight(to_tsvector(levels.uid), 'C') ||
       setweight(to_tsvector(title), 'D') ||
       setweight(to_tsvector(coalesce(metadata->>'title_localized', '')), 'D') ||
       setweight(to_tsvector(description), 'A') ||
       setweight(to_tsvector(array_to_string(tags, ',', '*')), 'D') ||
       setweight(to_tsvector(coalesce(users.uid, '')), 'B') ||
       setweight(to_tsvector(coalesce(users.name, '')), 'B') as tsv,
       levels.id,
       levels.title,
       levels.uid
FROM levels
JOIN users on levels."ownerId" = users.id
WHERE published=true;

CREATE INDEX levels_search_tsv ON levels_search USING gin(tsv);
