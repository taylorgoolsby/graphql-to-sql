import { DirectiveAnnotation } from '@graphql-tools/utils'

const STRING_TYPES = [
  'CHAR',
  'VARCHAR',
  'BINARY',
  'VARBINARY',
  'BLOB',
  'TEXT',
  'ENUM',
  'SET',
]

export interface IGenerateSqlOptions {
  databaseName: string // E.G. CREATE SCHEMA IF NOT EXISTS ${databaseName};
  tablePrefix?: string // E.G. SELECT FROM ${databaseName}.${tablePrefix}_User
  dbType?: 'mysql' | 'postgres' | 'sqlite'
}

export type Annotations = {
  typeAnnotations: TypeAnnotations
  fieldAnnotations: FieldAnnotations
}

export type TypeAnnotations = {
  [typeName: string]: DirectiveAnnotation
}

export type FieldAnnotations = {
  [typeName: string]: {
    [fieldName: string]: {
      directive: DirectiveAnnotation
      graphQLType: string
    }
  }
}

type SqlAst = {
  [name: string]: Table
}

type Table = {
  name: string
  columns: { [name: string]: Column }
  unicode?: boolean
  constraints?: string
  primaryIndices?: Column[] // attached by ast conversion
  secondaryIndices?: Column[] // attached by ast conversion
}

type Column = {
  name: string
  auto?: boolean
  default?: string
  index?: boolean
  nullable?: boolean
  primary?: boolean
  type?: string
  graphQLType: string
  unicode?: boolean
  unique?: boolean
  generated?: string
}

export function generateSql(
  annotations: Annotations,
  options: IGenerateSqlOptions
): string {
  const ast = convertIntoSqlAst(annotations, options)
  return renderCreateSchemaScript(
    ast,
    options.dbType || 'mysql',
    options.databaseName
  )
}

function convertIntoSqlAst(
  annotations: Annotations,
  options: IGenerateSqlOptions
) {
  const ast: SqlAst = {}

  let tablePrefix = ''
  if (options.tablePrefix) {
    tablePrefix = options.tablePrefix
  }
  if (tablePrefix && !tablePrefix.endsWith('_')) {
    tablePrefix += '_'
  }

  for (const typeName of Object.keys(annotations.typeAnnotations)) {
    const directive = annotations.typeAnnotations[typeName]
    const table: Table = {
      name: `${tablePrefix}${typeName}`,
      columns: {},
      ...directive.args,
    }
    ast[typeName] = table
  }

  for (const typeName of Object.keys(annotations.fieldAnnotations)) {
    const fieldAnnotations = annotations.fieldAnnotations[typeName]

    if (!ast[typeName]) {
      const table: Table = {
        name: `${tablePrefix}${typeName}`,
        columns: {},
      }
      ast[typeName] = table
    }

    for (const fieldName of Object.keys(fieldAnnotations)) {
      const directive = fieldAnnotations[fieldName].directive
      const column: Column = {
        name: fieldName,
        graphQLType: fieldAnnotations[fieldName].graphQLType,
        ...directive.args,
      }
      ast[typeName].columns[fieldName] = column
    }
  }

  setDefaults(ast, options)
  gatherIndices(ast)

  return ast
}

function setDefaults(ast: SqlAst, options: IGenerateSqlOptions): void {
  const isSqlite = options.dbType === 'sqlite'

  for (const table of Object.values(ast)) {
    for (const column of Object.values(table.columns)) {
      if (column.primary && column.nullable) {
        emitError(
          table.name,
          column.name,
          '@primary is not allowed with @nullable.'
        )
      }

      if (!column.type) {
        if (column.graphQLType === 'String') {
          emitError(
            table.name,
            column.name,
            `String types must be explicitly defined using @type.`
          )
        } else if (column.graphQLType === 'Int') {
          column.type = 'INT'
        } else if (column.graphQLType === 'Float') {
          column.type = 'DECIMAL'
        } else if (column.graphQLType === 'Boolean') {
          column.type = 'BOOLEAN'
        } else if (column.graphQLType === 'JSON') {
          column.type = 'JSON'
        } else {
          emitError(
            table.name,
            column.name,
            `A default SQL type cannot be generated for GraphQL type ${column.graphQLType}`
          )
        }
      }

      column.type = (column.type || '').toUpperCase()
      if (isSqlite) {
        if (column.type === 'JSON') {
          column.type = 'BLOB'
        } else if (column.type === 'INT') {
          column.type = 'INTEGER'
        }
      }

      if (column.auto) {
        // @ts-ignore
        if (!column.type.includes('INT') && column.type !== 'SERIAL') {
          emitError(
            table.name,
            column.name,
            `Column with "auto" must have INT or SERIAL type.`
          )
        }
        if (column.default) {
          emitError(
            table.name,
            column.name,
            '"default" is not allowed with "auto".'
          )
        }
        if (column.unicode) {
          emitError(
            table.name,
            column.name,
            '"unicode" is not allowed with "auto".'
          )
        }
        if (column.generated) {
          emitError(
            table.name,
            column.name,
            '"generated" is not allowed with "auto".'
          )
        }
      }

      if (column.unicode) {
        // @ts-ignore
        if (!STRING_TYPES.includes(stripLength(column.type))) {
          emitError(
            table.name,
            column.name,
            '@unicode can only be applied to a string type.'
          )
        }
        if (!table.unicode) {
          table.unicode = true
        }
      }

      if (column.generated && column.default) {
        emitError(
          table.name,
          column.name,
          '"default" is not allowed with "generated".'
        )
      }

      if (column.generated && column.generated.startsWith('ALWAYS AS')) {
        column.generated = `GENERATED ${column.generated}`
      }

      if (
        column.generated &&
        !column.generated.startsWith('GENERATED') &&
        !column.generated.startsWith('AS')
      ) {
        column.generated = `AS ${column.generated}`
      }
    }
  }
}

function gatherIndices(ast: SqlAst): void {
  for (const table of Object.values(ast)) {
    for (const column of Object.values(table.columns)) {
      if (column.primary) {
        table.primaryIndices = table.primaryIndices || []
        table.primaryIndices.push(column)
      } else if (column.index) {
        table.secondaryIndices = table.secondaryIndices || []
        table.secondaryIndices.push(column)
      }
    }
    if (!table.primaryIndices || table.primaryIndices?.length === 0) {
      emitError(
        table.name,
        '',
        `Table ${table.name} does not have a primary index.`
      )
    }
  }
}

function renderCreateSchemaScript(
  ast: SqlAst,
  dbType: string,
  databaseName: string | null | undefined
): string {
  const isSqlite = dbType === 'sqlite'

  if (isSqlite) {
    databaseName = null
  }

  let dbPart = ''
  if (databaseName) {
    dbPart = `\`${databaseName}\`.`
  }

  const autoIncrementClause = isSqlite ? 'AUTOINCREMENT' : 'AUTO_INCREMENT'
  let hasSqliteAutoIncrement = false

  const tableDefinitions: string[] = []

  for (const table of Object.values(ast)) {
    const columnDefinitions: string[] = []
    for (const column of Object.values(table.columns)) {
      const unicodeClause =
        !!column.unicode && !isSqlite
          ? 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci '
          : ''
      const generatedClause = !!column.generated ? `${column.generated} ` : ''
      const nullClause = !!column.nullable ? 'NULL ' : 'NOT NULL '
      const defaultClause = !!column.default ? `DEFAULT ${column.default} ` : ''
      const autoClause =
        !!column.auto && column.type !== 'SERIAL'
          ? autoIncrementClause + ' '
          : ''
      const uniqueClause = !!column.unique ? `UNIQUE ` : ''
      if (isSqlite && column.auto) {
        columnDefinitions.push(
          `\`${column.name}\` ${column.type} INTEGER PRIMARY KEY AUTOINCREMENT`.trim()
        )
        hasSqliteAutoIncrement = true
      } else {
        columnDefinitions.push(
          `\`${column.name}\` ${column.type} ${unicodeClause}${generatedClause}${nullClause}${defaultClause}${autoClause}${uniqueClause}`.trim()
        )
      }
    }

    const primaryKeyNames =
      table.primaryIndices && table.primaryIndices.length
        ? table.primaryIndices.map((column) => `\`${column.name}\``).join(', ')
        : ''

    let indexDefinitions =
      dbType === 'mysql'
        ? (table.secondaryIndices || []).map((column) => {
            return `INDEX \`${column.name.toUpperCase()}INDEX\` (\`${
              column.name
            }\` ASC)`
          })
        : (table.secondaryIndices || []).map((column) => {
            return `CREATE INDEX IF NOT EXISTS \`${column.name.toUpperCase()}INDEX\` ON ${dbPart}\`${
              table.name
            }\` (\`${column.name}\` ASC)`
          })
    if (indexDefinitions.length > 0) {
      indexDefinitions = [''].concat(indexDefinitions)
    }

    const constraints = table.constraints ? ',\n  ' + table.constraints : ''

    const unicodeModifier =
      table.unicode && !isSqlite
        ? ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
        : ''

    if (dbType === 'mysql') {
      tableDefinitions.push(
        `CREATE TABLE IF NOT EXISTS ${dbPart}\`${table.name}\` (
  ${columnDefinitions.join(',\n  ')},
  PRIMARY KEY (${primaryKeyNames})${indexDefinitions.join(
          ',\n  '
        )}${constraints}
)${unicodeModifier};`
      )
    } else if (dbType === 'postgres' || dbType === 'sqlite') {
      if (!hasSqliteAutoIncrement) {
        tableDefinitions.push(
          `CREATE TABLE IF NOT EXISTS ${dbPart}\`${table.name}\` (
  ${columnDefinitions.join(',\n  ')},
  PRIMARY KEY (${primaryKeyNames})${constraints}
)${indexDefinitions.join(';\n')};`
        )
      } else {
        tableDefinitions.push(
          `CREATE TABLE IF NOT EXISTS ${dbPart}\`${table.name}\` (
  ${columnDefinitions.join(',\n  ')},
  ${constraints}
)${indexDefinitions.join(';\n')};`
        )
      }
    }
  }

  let render = databaseName
    ? `CREATE SCHEMA IF NOT EXISTS ${databaseName};\n\n` +
      tableDefinitions.join('\n\n')
    : tableDefinitions.join('\n\n')

  if (dbType === 'postgres') {
    render = render.replace(/`/g, '')
  }

  return render
}

function emitError(
  tableName: string,
  columnName: string,
  message: string
): void {
  throw new Error(`[${tableName} : ${columnName}]: ${message}`)
}

function stripLength(type: string): string {
  return type.split('(')[0]
}
