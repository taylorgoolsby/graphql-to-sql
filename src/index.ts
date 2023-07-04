import { mapSchema, MapperKind, getDirectives } from '@graphql-tools/utils'
import { GraphQLSchema } from 'graphql'
import {
  Annotations,
  FieldAnnotations,
  generateSql,
  IGenerateSqlOptions,
  TypeAnnotations,
} from './generateSql.js'

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
      schema: GraphQLSchema,
      options: IGenerateSqlOptions
    ): string => {
      const annotations = visit(schema)
      return generateSql(annotations, options)
    },
  }
}
