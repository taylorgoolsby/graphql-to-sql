import {
  mapSchema,
  MapperKind,
  getDirectives,
  TypeSource,
} from '@graphql-tools/utils'
import { GraphQLSchema } from 'graphql'
import {
  Annotations,
  FieldAnnotations,
  generateSql,
  IGenerateSqlOptions,
  TypeAnnotations,
} from './generateSql.js'
import { makeExecutableSchema } from '@graphql-tools/schema'

export function customDirectiveDeclaration(
  customDirectiveName: string
): string {
  return `directive @${customDirectiveName}(
    unicode: Boolean
    auto: Boolean
    default: String
    hide: Boolean
    index: Boolean
    nullable: Boolean
    primary: Boolean
    type: String
    unique: Boolean
    generated: String
    constraints: String
  ) on OBJECT | FIELD_DEFINITION`
}

export default function sqlDirective(directiveName: string = 'sql') {
  function visit(schema: GraphQLSchema): Annotations {
    const typeAnnotations: TypeAnnotations = {}
    const fieldAnnotations: FieldAnnotations = {}

    mapSchema(schema, {
      [MapperKind.TYPE]: (type) => {
        const directives = getDirectives(schema, type)
        const directive = directives?.find((d) => d.name === directiveName)
        if (directive) {
          typeAnnotations[type.name] = directive
        }

        return type
      },
      [MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
        const directives = getDirectives(schema, fieldConfig)
        const directive = directives?.find((d) => d.name === directiveName)
        if (directive) {
          if (!fieldAnnotations[typeName]) {
            fieldAnnotations[typeName] = {}
          }
          fieldAnnotations[typeName][fieldName] = {
            directive,
            graphQLType: fieldConfig.type.toString(),
          }
        }

        return fieldConfig
      },
    })

    return {
      typeAnnotations,
      fieldAnnotations,
    }
  }

  return {
    sqlDirectiveTypeDefs: customDirectiveDeclaration(directiveName),
    generateSql: (
      input: {
        schema?: GraphQLSchema
        typeDefs?: TypeSource
      },
      options: IGenerateSqlOptions
    ): string => {
      let schema
      if (input.schema) {
        schema = input.schema
      } else if (input.typeDefs) {
        schema = makeExecutableSchema({
          typeDefs: input.typeDefs,
        })
      } else {
        throw new Error(
          'Either schema or typeDefs should be specified as input.'
        )
      }

      const annotations = visit(schema)
      return generateSql(annotations, options)
    },
  }
}
