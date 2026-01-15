import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

interface UndoOperation {
  model: string
  method: string
  args: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin only' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { undoOperations } = body as { undoOperations?: UndoOperation[] }

    if (!undoOperations || undoOperations.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No undo operations available for this action',
      })
    }

    // Execute undo operations
    for (const op of undoOperations) {
      const { model, method, args } = op
      console.log(`Undo: ${model}.${method}`, args)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prismaModel = (db as any)[model.toLowerCase()] as Record<string, (args: unknown) => Promise<unknown>>

      if (!prismaModel || typeof prismaModel[method] !== 'function') {
        throw new Error(`Invalid undo operation: ${model}.${method}`)
      }

      await prismaModel[method](args)
    }

    return NextResponse.json({
      success: true,
      message: 'Action undone successfully',
    })
  } catch (error) {
    console.error('Undo error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
