import test from 'boxtape'
import {makeExecutableSchema} from '@graphql-tools/schema'
import sqlDirective from '../lib/index.js'

const {
  sqlDirectiveTypeDefs,
  generateSql,
} = sqlDirective('sql')

test('main test', (t) => {
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

CREATE TABLE IF NOT EXISTS \`public\`.\`test_User\` (
  \`userId\` BINARY(16) NOT NULL,
  \`uniqueColumn\` INT NOT NULL UNIQUE,
  \`databaseOnlyField\` INT NOT NULL,
  PRIMARY KEY (\`userId\`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`public\`.\`test_UserPair\` (
  \`userPairId\` BINARY(16) NOT NULL,
  \`parentUserId\` BINARY(16) NOT NULL,
  \`childUserId\` BINARY(16) NOT NULL,
  PRIMARY KEY (\`userPairId\`),
  INDEX \`PARENTUSERIDINDEX\` (\`parentUserId\` ASC),
  INDEX \`CHILDUSERIDINDEX\` (\`childUserId\` ASC),
  UNIQUE(parentUserId, childUserId),
  FOREIGN KEY (parentUserId) REFERENCES User(userId)
);

CREATE TABLE IF NOT EXISTS \`public\`.\`test_Post\` (
  \`postId\` INT NOT NULL AUTO_INCREMENT,
  \`userId\` BINARY(16) NOT NULL,
  \`content\` VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  \`likes\` INT NOT NULL,
  \`dateCreated\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`postId\`),
  INDEX \`USERIDINDEX\` (\`userId\` ASC)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  runTest(t, typeDefs, expected)
})

test('mysql: error no primary index', (t) => {
  const typeDefs = `
    type User @sql(unicode: true) {
      userId: String @sql(type: "BINARY(16)")
    }
  `
  t.throws(() => {
    runTest(t, typeDefs, '')
  }, /does not have a primary index/, 'throw on missing primary index')
})

test('mysql: generated', (t) => {
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

CREATE TABLE IF NOT EXISTS \`public\`.\`test_GeneratedTest\` (
  \`userId\` BINARY(16) NOT NULL,
  \`data\` JSON NOT NULL,
  \`test1\` VARCHAR(30) GENERATED ALWAYS AS (data->>'$.test') VIRTUAL NOT NULL,
  \`test2\` VARCHAR(30) GENERATED ALWAYS AS (data->>'$.test') NOT NULL,
  \`test3\` VARCHAR(30) AS (data->>'$.test') NOT NULL,
  \`test4\` VARCHAR(30) AS (data->>'$.test') NOT NULL,
  PRIMARY KEY (\`userId\`),
  INDEX \`TEST4INDEX\` (\`test4\` ASC)
);`
  runTest(t, typeDefs, expected)
})

test('mysql: multi-column primary key', (t) => {
  const typeDefs = `
    type Version {
      version: String @sql(type: "VARCHAR(100)", primary: true)
      runtimeEnv: String @sql(type: "VARCHAR(100)", primary: true)
    }
  `
  const expected = `CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE IF NOT EXISTS \`public\`.\`test_Version\` (
  \`version\` VARCHAR(100) NOT NULL,
  \`runtimeEnv\` VARCHAR(100) NOT NULL,
  PRIMARY KEY (\`version\`, \`runtimeEnv\`)
);`
  runTest(t, typeDefs, expected)
})

function runTest(t, typeDefs, expected) {
  let schema = makeExecutableSchema({
    typeDefs: [sqlDirectiveTypeDefs, typeDefs],
  })
  const answer = generateSql({schema}, {
    databaseName: 'public',
    tablePrefix: 'test',
    dbType: 'mysql'
  })

  if (answer !== expected) {
    console.log(answer)
  }

  t.equal(answer, expected)
}
