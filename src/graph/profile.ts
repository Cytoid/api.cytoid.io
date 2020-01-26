import { gql } from 'apollo-server-koa'
import {FieldNode, GraphQLResolveInfo} from 'graphql'
import {getManager, SelectQueryBuilder} from 'typeorm'
import Profile from '../models/profile'
import User from '../models/user'

export const typeDefs = gql`
type ProfileExp {
  basicExp: Int!
  levelExp: Int!
  totalExp: Int!
  currentLevel: Int!
  nextLevelExp: Int!
  currentLevelExp: Int!
}
type ProfileGrades {
  MAX: Int!
  SS: Int!
  S: Int!
  A: Int!
  B: Int!
  C: Int!
  D: Int!
  F: Int!
}
type ProfileActivity {
  totalRankedPlays: Int!
  clearedNotes: Int!
  maxCombo: Int!
  averageRankedAccuracy: Float!
  totalRankedScore: Int!
  totalPlayTime: Float!
}
type ProfileTimeSeries {
  accu_rating: Float!
  accu_accuracy: Float!,
  week: Int!
  year: Int!
  accuracy: Float!
  rating: Float!
  count: Int!
}
type Profile {
  id: ID! @column
  user: User @column(name: "userId") @relation(name: "users", field: "user")
  birthday: Date @column
  bio: String @column
  headerPath: String @column

  rating: Float!
  exp: ProfileExp!
  grades: ProfileGrades!
  activity: ProfileActivity!
  timeseries: [ProfileTimeSeries!]!
}

extend type Query {
  profile(id: ID, uid: String): Profile @toOne(name: "profiles")
}

`

const db = getManager()
export const resolvers = {
  Profile: {
    rating(parent: Profile) {
      return db.query('select user_rating($1)', [ parent.id ])
        .then((result) => parseFloat(result[0].user_rating) || 0)
    },
    exp(parent: Profile) {
      return db.query(`
WITH scores AS (
 SELECT (charts."notesCount" * (charts.difficulty / 15.0) +
  levels.duration / 60.0 * 100.0) * (CASE WHEN records.ranked THEN 1 ELSE 0.5 END) AS base,
  records.score as score,
  levels.id as level
 FROM records
 JOIN charts on records."chartId" = charts.id
 JOIN levels on charts."levelId" = levels.id
 WHERE records."ownerId" = $1
  AND charts.difficulty BETWEEN 1 AND 16
),
chart_scores AS (
 SELECT max(pow(scores.score / 1000000.0, 2) * (scores.base * 1.5)) as level_score,
        sum(sqrt(scores.score / 1000000.0) * scores.base) as level_total_basic_exp
 FROM scores
 GROUP BY scores.level
)
SELECT round(sum(level_total_basic_exp)) as basic_exp,
       round(sum(chart_scores.level_score)) as level_exp
FROM chart_scores;`, [parent.id])
      .then((result) => {
        const basicExp = result[0].basic_exp || 0
        const levelExp = result[0].level_exp || 0
        const totalExp = basicExp + levelExp
        const currentLevel = Math.floor((Math.sqrt(6 * totalExp + 400) + 10) / 30)
        function levelToExp(levelNum: number) {
          return Math.round(50 * ((1 / 3) * Math.pow(3 * levelNum - 1, 2) - (4 / 3)))
        }
        return {
          basicExp,
          levelExp,
          totalExp,
          currentLevel,
          nextLevelExp: levelToExp(currentLevel + 1),
          currentLevelExp: levelToExp(currentLevel),
        }
      })
    },
    grades(parent: Profile) {
      return db.query(`SELECT case
when records.score >= 1000000 then 'MAX'
when records.score >= 999500 then 'SSS'
when records.score >= 990000 then 'SS'
when records.score >= 950000 then 'S'
when records.score >= 900000 then 'A'
when records.score >= 800000 then 'B'
when records.score >= 700000 then 'C'
when records.score >= 600000 then 'D'
else 'F'
end as grade,
count(records) as count
from records
where records."ownerId" = $1
group by grade;`, [parent.id])
        .then((gradeObjs) => {
          const grades: any = {}
          for (const grade of gradeObjs) {
            grades[grade.grade] = parseInt(grade.count, 10)
          }
          return grades
        })
    },
    activity(parent: Profile, args: never, context: never, info: GraphQLResolveInfo) {
      const fieldNode = info.fieldNodes.find((node) => node.name.value === info.fieldName)
      const queries = {
        totalRankedPlays: 'count(records) filter (WHERE records.ranked=true) as "totalRankedPlays"',
        clearedNotes: 'sum(chart."notesCount") as "clearedNotes"',
        maxCombo: `max((records.details -> 'maxCombo')::integer) as "maxCombo"`,
        averageRankedAccuracy: 'avg(records.accuracy) filter (WHERE records.ranked=true) as "averageRankedAccuracy"',
        totalRankedScore: 'sum(records.score) filter (WHERE records.ranked=true) as "totalRankedScore"',
        totalPlayTime: 'sum(level.duration) as "totalPlayTime"',
      }
      const selections: Array<keyof typeof queries> = fieldNode
        .selectionSet
        .selections
        .map((selection) => (selection as FieldNode).name.value) as Array<keyof typeof queries>

      return db.createQueryBuilder().select(selections.map((name) => queries[name]))
        .from('records', 'records')
        .innerJoin('charts', 'chart', 'records."chartId" = chart.id')
        .innerJoin('levels', 'level', 'level.id=chart."levelId"')
        .where('records."ownerId"=:id', { id: parent.id })
        .execute()
        .then((results: any) => {
          const activities = results[0]
          activities.totalRankedPlays = parseInt(activities.totalRankedPlays, 10)
          activities.clearedNotes = parseInt(activities.clearedNotes, 10)
          activities.totalRankedScore = parseInt(activities.totalRankedScore, 10)
          activities.averageRankedAccuracy = parseFloat(activities.averageRankedAccuracy)
          return activities
        })
    },
    timeseries(parent: Profile) {
      return db.query(`\
SELECT (sum(t.rating * t.count) OVER w) / (sum(t.count) OVER w) as accu_rating,
       (sum(t.accuracy * t.count) OVER w) / (sum(t.count) OVER w) as accu_accuracy,
       t.*
FROM (
         SELECT extract(week from r.date) as week,
                extract(isoyear from r.date) as year,
                avg(accuracy) as accuracy,
                avg(rating) as rating,
                count(*)::integer
         FROM records r
         WHERE r."ownerId" = $1
         GROUP BY year, week
         ORDER BY year, week
     ) as t
     WINDOW w AS (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);`, [ parent.id ])
        .then((rows) => {
          for (const row of rows) {
            row.accu_rating = parseFloat(row.accu_rating)
            row.accu_accuracy = parseFloat(row.accu_accuracy)
            row.accuracy = parseFloat(row.accuracy)
            row.rating = parseFloat(row.rating)
          }
          return rows
        })
    },
  },
  Query: {
    profile(
      parent: never,
      args: {
        id: string,
        uid: string,
      },
      context: { queryBuilder: SelectQueryBuilder<Profile> },
    ) {
      context.queryBuilder.addSelect('profiles.id')
      if (args.id) {
        return context.queryBuilder.where({id: args.id})
      }
      if (!context.queryBuilder
        .expressionMap
        .joinAttributes
        .find((join) => (join.entityOrProperty === 'profiles.user'))) {
        context.queryBuilder.leftJoin('profiles.user', 'users')
      }
      return context.queryBuilder
        .where('users.uid=:uid', args)
    },
  },
}
