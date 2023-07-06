// generate-sql.js
import sqlDirective from './lib/index.js'
import gql from 'graphql-tag'

const {
  sqlDirectiveTypeDefs,
  generateSql
} = sqlDirective('sql')

const typeDefs = gql`
  directive @sql (
    unicode: Boolean
    auto: Boolean
    default: String
    index: Boolean
    nullable: Boolean
    primary: Boolean
    type: String
    unique: Boolean
    generated: String
    constraints: String
  ) on OBJECT | FIELD_DEFINITION 
  
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

  type UserPair @sql(constraints: "UNIQUE(parentUserId, childUserId),\\n  FOREIGN KEY (parentUserId) REFERENCES User(userId)") {
    userPairId: String @sql(type: "BINARY(16)", primary: true)
    parentUserId: String @sql(type: "BINARY(16)", index: true)
    childUserId: String @sql(type: "BINARY(16)", index: true)
  }
`

const sql = generateSql({typeDefs: [typeDefs, sqlDirectiveTypeDefs]}, {
  databaseName: 'public', // for postgres, keeping public is recommended.
  tablePrefix: 'test', // or test_
  dbType: 'mysql' // or postgres
})
console.log('sql', sql)