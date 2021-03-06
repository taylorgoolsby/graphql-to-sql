import { SchemaDirectiveVisitor } from 'graphql-tools'
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLField,
  GraphQLDirective,
  DirectiveLocation,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql'
import { addTable, addColumn, ITable, IColumn } from './makeSqlSchema'

export interface IGetSchemaDirectivesInput {
  directiveName?: string
}

export interface IGetSchemaDirectivesOutput {
  [directiveName: string]: typeof SchemaDirectiveVisitor
}

export function getSchemaDirectives({
  directiveName = 'sql',
}: IGetSchemaDirectivesInput = {}): IGetSchemaDirectivesOutput {
  class SqlDirective extends SchemaDirectiveVisitor {
    public static getDirectiveDeclaration(
      name: string,
      schema: GraphQLSchema
    ): GraphQLDirective {
      return new GraphQLDirective({
        name,
        locations: [
          DirectiveLocation.OBJECT,
          DirectiveLocation.FIELD_DEFINITION,
        ],
        args: {
          unicode: {
            type: GraphQLBoolean,
          },
          auto: {
            type: GraphQLBoolean,
          },
          default: {
            type: GraphQLString,
          },
          hide: {
            type: GraphQLBoolean,
          },
          index: {
            type: GraphQLBoolean,
          },
          nullable: {
            type: GraphQLBoolean,
          },
          primary: {
            type: GraphQLBoolean,
          },
          type: {
            type: GraphQLString,
          },
          unique: {
            type: GraphQLBoolean,
          },
        },
      })
    }
    public visitObject(object: GraphQLObjectType) {
      const tableName = object.name

      const sqlTable: ITable = {
        name: tableName,
        columns: {},
        ...this.args,
      }
      addTable(sqlTable)
      // console.log('visitObject', tableName, this.args)
    }
    public visitFieldDefinition(field: GraphQLField<any, any>, details: any) {
      if (!this.args.hide) {
        const tableName = details.objectType.name
        const columnName = field.name

        const sqlColumn: IColumn = {
          name: columnName,
          graphQLType: field.type.toString(),
          ...this.args,
        }
        addColumn(tableName, sqlColumn)
      }
      // console.log('visitFieldDefinition', tableName, columnName, this.args)
    }
  }

  return {
    [directiveName]: SqlDirective,
  }
}

// todo handle hide by using Schema Transforms to filter types marked with hide

export const directiveDeclaration = `directive @sql(
  unicode: Boolean
  auto: Boolean
  default: String
  hide: Boolean
  index: Boolean
  nullable: Boolean
  primary: Boolean
  type: String
  unique: Boolean
) on OBJECT | FIELD_DEFINITION`
