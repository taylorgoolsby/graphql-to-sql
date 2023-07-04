import test from 'boxtape'
import {makeExecutableSchema} from '@graphql-tools/schema'
import sqlDirective from '../lib/index.js'

const {
  sqlDirectiveTypeDefs,
  generateSql,
} = sqlDirective('sql')

test('postgres: main test', (t) => {
  const typeDefs = `
    # See graphql-directive-private
    directive @private on OBJECT | FIELD_DEFINITION

    type User @sql(unicode: true) {
      userId: String @sql(type: "BINARY(16)", primary: true)
      uniqueColumn: Int @sql(unique: true)
      databaseOnlyField: Int @sql @private

      graphqlOnlyField: String
      posts: [Post]
    }

    type Post {
      postId: Int @sql(primary: true, auto: true)
      userId: String @sql(type: "BINARY(16)", index: true)
      content: String @sql(type: "VARCHAR(300)", unicode: true, nullable: true)
      likes: Int @sql
      dateCreated: String @sql(type: "TIMESTAMP", default: "CURRENT_TIMESTAMP")
    }

    type UserPair
      @sql(
        constraints: "UNIQUE(parentUserId, childUserId),\\n  FOREIGN KEY (parentUserId) REFERENCES User(userId)"
      ) {
      userPairId: String @sql(type: "BINARY(16)", primary: true)
      parentUserId: String @sql(type: "BINARY(16)", index: true)
      childUserId: String @sql(type: "BINARY(16)", index: true)
    }
  `
  const expected = `CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE public.test_User (
  userId BINARY(16) NOT NULL,
  uniqueColumn INT NOT NULL UNIQUE,
  databaseOnlyField INT NOT NULL,
  PRIMARY KEY (userId)
);

CREATE TABLE public.test_UserPair (
  userPairId BINARY(16) NOT NULL,
  parentUserId BINARY(16) NOT NULL,
  childUserId BINARY(16) NOT NULL,
  PRIMARY KEY (userPairId),
  UNIQUE(parentUserId, childUserId),
  FOREIGN KEY (parentUserId) REFERENCES User(userId)
);
CREATE INDEX PARENTUSERIDINDEX ON public.test_UserPair (parentUserId ASC);
CREATE INDEX CHILDUSERIDINDEX ON public.test_UserPair (childUserId ASC);

CREATE TABLE public.test_Post (
  postId INT NOT NULL AUTO_INCREMENT,
  userId BINARY(16) NOT NULL,
  content VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  likes INT NOT NULL,
  dateCreated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (postId)
);
CREATE INDEX USERIDINDEX ON public.test_Post (userId ASC);`
  runTest(t, typeDefs, expected)
})

test('postgres: error no primary index', (t) => {
  const typeDefs = `
    type User @sql(unicode: true) {
      userId: String @sql(type: "BINARY(16)")
    }
  `
  t.throws(() => {
    runTest(t, typeDefs, '')
  }, /does not have a primary index/, 'throw on missing primary index')
})

test('postgres: generated', (t) => {
  const typeDefs = `
    scalar JSON

    type GeneratedTest {
      userId: String @sql(type: "BINARY(16)", primary: true)
      data: JSON @sql
      test1: String
        @sql(
          type: "VARCHAR(30)"
          generated: "GENERATED ALWAYS AS (data->>'$.test') VIRTUAL"
        )
      test2: String
        @sql(type: "VARCHAR(30)", generated: "ALWAYS AS (data->>'$.test')")
      test3: String @sql(type: "VARCHAR(30)", generated: "AS (data->>'$.test')")
      test4: String
        @sql(type: "VARCHAR(30)", generated: "(data->>'$.test')", index: true)
    }
  `
  const expected = `CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE public.test_GeneratedTest (
  userId BINARY(16) NOT NULL,
  data JSON NOT NULL,
  test1 VARCHAR(30) GENERATED ALWAYS AS (data->>'$.test') VIRTUAL NOT NULL,
  test2 VARCHAR(30) GENERATED ALWAYS AS (data->>'$.test') NOT NULL,
  test3 VARCHAR(30) AS (data->>'$.test') NOT NULL,
  test4 VARCHAR(30) AS (data->>'$.test') NOT NULL,
  PRIMARY KEY (userId)
);
CREATE INDEX TEST4INDEX ON public.test_GeneratedTest (test4 ASC);`
  runTest(t, typeDefs, expected)
})

function runTest(t, typeDefs, expected) {
  let schema = makeExecutableSchema({
    typeDefs: [sqlDirectiveTypeDefs, typeDefs],
  })
  const answer = generateSql(schema, {
    databaseName: 'public',
    tablePrefix: 'test',
    dbType: 'postgres'
  })

  if (answer !== expected) {
    console.log(answer)
  }

  t.equal(answer, expected)
}
