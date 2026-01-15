import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

export interface PrismaOperation {
  model: 'User' | 'Trainer' | 'Athlete' | 'Session'
  method: 'create' | 'update' | 'updateMany' | 'delete' | 'deleteMany' | 'findMany' | 'findFirst'
  args: Record<string, unknown>
  description: string
}

export interface AdminParseResult {
  operations: PrismaOperation[]
  humanReadableSummary: string
  clarificationNeeded: string | null
  isQuery: boolean
}

export interface UndoOperation {
  model: string
  method: string
  args: Record<string, unknown>
}

export interface AdminExecutionResult {
  success: boolean
  message: string
  data?: Record<string, unknown>
  results?: unknown[]
  undoOperations?: UndoOperation[]
}

const HASH_PLACEHOLDER = '$HASH_PLACEHOLDER$'
const PASSWORD_PREFIX = '$PASSWORD:'

async function processArgs(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const processed = JSON.parse(JSON.stringify(args))

  // Replace password hash placeholder with actual hash
  if (processed.data?.passwordHash === HASH_PLACEHOLDER) {
    processed.data.passwordHash = await hashPassword('trainer123')
  }
  // Handle custom password: $PASSWORD:thepassword$
  else if (typeof processed.data?.passwordHash === 'string' &&
           processed.data.passwordHash.startsWith(PASSWORD_PREFIX)) {
    const passwordValue = processed.data.passwordHash.slice(PASSWORD_PREFIX.length, -1) // Remove prefix and trailing $
    processed.data.passwordHash = await hashPassword(passwordValue)
  }

  // Convert date strings to Date objects for Prisma
  const convertDates = (obj: Record<string, unknown>): Record<string, unknown> => {
    for (const key in obj) {
      const value = obj[key]
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        obj[key] = new Date(value)
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        convertDates(value as Record<string, unknown>)
      }
    }
    return obj
  }

  return convertDates(processed)
}

// Generate undo operations for an action
async function generateUndoOperations(
  op: PrismaOperation,
  result: unknown
): Promise<UndoOperation[]> {
  const undoOps: UndoOperation[] = []

  try {
    switch (op.method) {
      case 'create': {
        // Undo create = delete
        const created = result as { id: string }
        if (created?.id) {
          undoOps.push({
            model: op.model,
            method: 'delete',
            args: { where: { id: created.id } },
          })
        }
        break
      }

      case 'delete': {
        // Can't easily undo deletes without storing the full record
        // For now, we don't support undoing deletes
        break
      }

      case 'update': {
        // Undo update = restore previous values
        const where = (op.args as { where?: Record<string, unknown> }).where
        const data = (op.args as { data?: Record<string, unknown> }).data
        if (where && data) {
          // Fetch the current values before the update happened
          // This is called AFTER the update, so we can't get original values
          // We'd need to fetch before executing - for now, limited undo
          const previousKeys = Object.keys(data)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const model = (db as any)[op.model.toLowerCase()] as Record<string, (args: unknown) => Promise<unknown>>
          const current = await model.findFirst({ where }) as Record<string, unknown>
          if (current) {
            const previousData: Record<string, unknown> = {}
            for (const key of previousKeys) {
              previousData[key] = current[key]
            }
            // Note: This gets the NEW values, not the old ones
            // True undo would require storing state before execution
          }
        }
        break
      }

      case 'updateMany': {
        // For updateMany on sessions (cancel/uncancel), we can reverse boolean fields
        const where = (op.args as { where?: Record<string, unknown> }).where
        const data = (op.args as { data?: Record<string, unknown> }).data
        if (where && data && op.model === 'Session') {
          // If we cancelled sessions, undo = uncancel
          if (data.cancelled === true) {
            undoOps.push({
              model: 'Session',
              method: 'updateMany',
              args: {
                where: { ...where, cancelled: true },
                data: { cancelled: false },
              },
            })
          }
          // If we uncancelled, undo = cancel
          else if (data.cancelled === false) {
            undoOps.push({
              model: 'Session',
              method: 'updateMany',
              args: {
                where: { ...where, cancelled: false },
                data: { cancelled: true },
              },
            })
          }
          // If we reassigned trainerId, harder to undo without tracking original
        }
        break
      }
    }
  } catch (error) {
    console.error('Error generating undo operations:', error)
  }

  return undoOps
}

export async function executeAdminAction(
  parseResult: AdminParseResult
): Promise<AdminExecutionResult> {
  const { operations, clarificationNeeded, humanReadableSummary, isQuery } = parseResult

  if (clarificationNeeded) {
    return {
      success: false,
      message: clarificationNeeded,
    }
  }

  if (!operations || operations.length === 0) {
    return {
      success: false,
      message: 'No operations to execute',
    }
  }

  const results: unknown[] = []
  const allUndoOps: UndoOperation[] = []

  try {
    for (const op of operations) {
      const { model, method, args, description } = op
      console.log(`Executing: ${model}.${method}`, description)

      const processedArgs = await processArgs(args)

      // Get the Prisma model
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prismaModel = (db as any)[model.toLowerCase()] as Record<string, (args: unknown) => Promise<unknown>>

      if (!prismaModel || typeof prismaModel[method] !== 'function') {
        throw new Error(`Invalid operation: ${model}.${method}`)
      }

      const result = await prismaModel[method](processedArgs)
      results.push(result)

      // Generate undo operations
      const undoOps = await generateUndoOperations(op, result)
      allUndoOps.push(...undoOps)
    }

    // Format response based on whether it's a query or mutation
    if (isQuery && results.length > 0) {
      const queryResult = results[0]
      if (Array.isArray(queryResult)) {
        return {
          success: true,
          message: `${humanReadableSummary}\n\nFound ${queryResult.length} result(s).`,
          results,
          data: { count: queryResult.length, items: queryResult },
        }
      }
      return {
        success: true,
        message: humanReadableSummary,
        results,
        data: { result: queryResult },
      }
    }

    return {
      success: true,
      message: humanReadableSummary,
      results,
      undoOperations: allUndoOps.length > 0 ? allUndoOps : undefined,
    }
  } catch (error) {
    console.error('Error executing admin action:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      message: `Failed to execute: ${errorMessage}`,
    }
  }
}
