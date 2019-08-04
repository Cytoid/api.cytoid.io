CREATE TABLE "leaderboard"
(
    "id"     uuid PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
    "rating" numeric(10, 8) NOT NULL
);
CREATE index leaderboard_rating on leaderboard ("rating");

-- Util: Calculate the performance rating based on accuracy
CREATE FUNCTION
    performance_rating(accuracy numeric(9,8)) returns double precision AS
$$
SELECT CASE
           WHEN accuracy < 0.7 THEN ((|/ (accuracy / 0.7)) * 0.5)
           WHEN accuracy < 0.97 THEN 0.7 - 0.2 * log((1.0 - accuracy) / 0.03)
           WHEN accuracy < 0.997 THEN 0.7 - 0.16 * log((1.0 - accuracy) / 0.03)
           WHEN accuracy < 0.9997 THEN 0.78 - 0.08 * log((1.0 - accuracy) / 0.03)
           ELSE accuracy * 200.0 - 199.0 END;
$$ LANGUAGE SQL;

-- Trigger: Update the rating column of records using performance
-- rating and difficulty when records are updated/inserted
CREATE FUNCTION records_ratings_trigger() RETURNS trigger AS
$$
BEGIN
    NEW.rating = performance_rating(NEW.accuracy) * GREATEST(0, LEAST(charts.difficulty, 16))
                  FROM charts
                  WHERE charts.id = NEW."chartId";
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER records_ratings_update
    BEFORE INSERT OR UPDATE
    ON records
    FOR EACH ROW
EXECUTE PROCEDURE records_ratings_trigger();

-- Trigger: When difficulty changes, update all records of this chart
CREATE OR REPLACE FUNCTION charts_difficulty_records_rating_trigger() RETURNS trigger AS
$$
BEGIN
    UPDATE records
    SET rating = performance_rating(accuracy) * GREATEST(0, LEAST(NEW.difficulty, 16))
    WHERE "chartId" = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER charts_difficulty_update_records_rating
    AFTER UPDATE
    ON charts
    FOR EACH ROW
    WHEN (NEW.difficulty != OLD.difficulty)
EXECUTE PROCEDURE charts_difficulty_records_rating_trigger();


-- Util: Do a full calculation of the user rating.
CREATE FUNCTION user_rating(uid uuid) RETURNS numeric(10,8) as
$$ select avg(rating)
from ((select rating
       from records
       where "ownerId" = uid AND ranked = true
       order by id desc
       limit 10)
      union all
      (select max(rating) as rating
       from records
       where "ownerId" = uid AND ranked = true
       group by "chartId"
       order by rating desc
       limit 30)) a;
    $$
    LANGUAGE SQL;


-- Trigger: Update the user rating in the leaderboard when records changes
CREATE OR REPLACE FUNCTION leaderboard_update_user() RETURNS trigger AS
$$
DECLARE
  _rating numeric(10,8);
BEGIN
    _rating = user_rating(NEW."ownerId");
    INSERT INTO leaderboard ("id", "rating") VALUES (NEW."ownerId", _rating)
    ON CONFLICT ("id") DO UPDATE
    SET rating = _rating;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leaderboard_update_user
    AFTER UPDATE OR INSERT
    ON records
    FOR EACH ROW
    WHEN (NEW.ranked = true)
EXECUTE PROCEDURE leaderboard_update_user();
