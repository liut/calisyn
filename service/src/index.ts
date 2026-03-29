import express from 'express'
import cookieParser from 'cookie-parser'
import type { RequestProps } from './types'
import type { ChatMessage } from './llm'
import { getClient, getConfig, getTools, invokeTool, streamChat } from './llm'
import { auth, cookieName } from './middleware/auth'
import { limiter } from './middleware/limiter'
import { isNotEmptyString } from './utils/is'
import { router as authRouter } from './auth'

const app = express()
const router = express.Router()

app.use(express.static('public'))
app.use(express.json())
app.use(cookieParser())

app.all('*', (_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'authorization, Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  next()
})

interface StreamMessage {
  id: string
  csid?: string
  pmid?: string
  delta: string
  text?: string
  finishReason?: string
  toolCalls?: Array<{
    id: string
    type: string
    function: { name: string; arguments: string }
  }>
}

const writeServerSendEvent = (res, data, eid?) => {
  if (eid)
    res.write(`id: ${eid}\n`)

  res.write(`data: ${data}\n\n`)
}

const generateId = () => Math.random().toString(36).substring(2, 15)

const defaultSystemMessage = 'You are a helpful assistant.'

// Initialize LLM client on startup
try {
  getClient()
}
catch (error: any) {
  console.error('Failed to initialize LLM client:', error.message)
  process.exit(1)
}

// POST /api/chat - supports stream parameter
router.post('/chat', [auth, limiter], async (req, res) => {
  const { csid, prompt, options = {}, systemMessage, stream = false } = req.body as RequestProps

  if (stream) {
    // SSE mode: use chat-sse logic
    return handleSSEChat(req, res, { csid, prompt, options, systemMessage })
  }

  // Non-streaming mode: return full response
  try {
    const messages: ChatMessage[] = []
    messages.push({ role: 'system', content: systemMessage || defaultSystemMessage })

    messages.push({ role: 'user', content: prompt })

    const client = getClient()
    const result = await client.chat(messages)

    res.json({ type: 'Success', data: { text: result.content } })
  }
  catch (error: any) {
    console.error('Chat error:', error)
    res.json({ type: 'Fail', message: error.message })
  }
})

// POST /api/chat-sse - SSE streaming chat (legacy route, same as stream mode)
router.post('/chat-sse', [auth, limiter], async (req, res) => {
  const { csid, prompt, options = {}, systemMessage } = req.body as RequestProps
  return handleSSEChat(req, res, { csid, prompt, options, systemMessage })
})

// Shared SSE chat handler
async function handleSSEChat(req: express.Request, res: express.Response, params: {
  csid?: string
  prompt: string
  options?: { conversationId?: string; parentMessageId?: string }
  systemMessage?: string
}) {
  const { csid, prompt, options = {}, systemMessage } = params

  const headers: Record<string, string> = {
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Access-Control-Allow-Origin': '*',
  }

  const ncsid: string = csid || Date.now().toString(36)
  if (!csid)
    headers['Conversation-ID'] = ncsid

  res.writeHead(200, headers)

  try {
    const messages: ChatMessage[] = []
    messages.push({ role: 'system', content: systemMessage || defaultSystemMessage })

    // TODO: load history from storage if csid exists
    messages.push({ role: 'user', content: prompt })

    // Get tools for this request
    const tools = getTools()
    const MAX_TOOL_ITERATIONS = 5

    let eventId = 0
    let iteration = 0

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++
      let iterationDone = false
      let fullContent = ''
      let assistantMessage: ChatMessage | null = null

      for await (const chunk of streamChat(messages, tools)) {
        fullContent += chunk.delta

        // Only send delta to client (not for tool_calls chunks which have no text)
        if (chunk.delta) {
          const streamMessage: StreamMessage = {
            id: generateId(),
            csid: ncsid,
            delta: chunk.delta,
            finishReason: chunk.finishReason,
          }
          writeServerSendEvent(res, JSON.stringify(streamMessage), String(eventId++))
        }

        // Check if LLM wants to call tools (OpenAI uses 'tool_calls', Anthropic uses 'tool_use')
        if ((chunk.finishReason === 'tool_calls' || chunk.finishReason === 'tool_use') && chunk.toolCalls && chunk.toolCalls.length > 0) {
          // Build assistant message with tool calls
          assistantMessage = {
            role: 'assistant',
            content: fullContent,
            toolCalls: chunk.toolCalls,
          }

          // Execute each tool call and add results to messages
          // First add the assistant message with tool calls
          messages.push(assistantMessage)

          for (const tc of chunk.toolCalls) {
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(tc.function.arguments)
            }
            catch {
              args = {}
            }

            const result = await invokeTool(tc.function.name, args)

            messages.push({
              role: 'tool',
              content: result.content,
              toolCallId: tc.id,
            })

            // Send tool result as a special event
            const toolResultMessage: StreamMessage = {
              id: generateId(),
              csid: ncsid,
              delta: '',
              text: `[tool] ${tc.function.name}: ${result.content.slice(0, 200)}${result.content.length > 200 ? '...' : ''}`,
            }
            writeServerSendEvent(res, JSON.stringify(toolResultMessage), String(eventId++))

            // Send tool call event
            const toolCallMessage: StreamMessage = {
              id: generateId(),
              csid: ncsid,
              delta: '',
              toolCalls: [{
                id: tc.id,
                type: tc.type,
                function: tc.function,
              }],
            }
            writeServerSendEvent(res, JSON.stringify(toolCallMessage), String(eventId++))
          }

          iterationDone = true
          break
        }

        // Normal completion (no tool calls)
        if (chunk.done) {
          if (fullContent && !assistantMessage)
            messages.push({ role: 'assistant', content: fullContent })

          // Send final done event
          const doneMessage: StreamMessage = {
            id: generateId(),
            csid: ncsid,
            delta: '',
            finishReason: 'stop',
          }
          writeServerSendEvent(res, JSON.stringify(doneMessage), String(eventId++))
          iterationDone = true
          break
        }
      }

      if (iterationDone && !assistantMessage) {
        // No tool calls, we're done
        break
      }
    }
  }
  catch (error: any) {
    console.error('SSE chat error:', error)
    res.write(JSON.stringify({ error: error.message }))
  }
  finally {
    res.end()
  }
}

// GET /api/config - get chat config
router.get('/config', auth, async (req, res) => {
  try {
    const config = getConfig()
    res.send({
      type: 'Success',
      data: {
        provider: config.provider,
        model: config.model,
        timeoutMs: config.timeout,
        usage: '-', // TODO: implement usage tracking
      },
    })
  }
  catch (error: any) {
    res.send({ type: 'Fail', message: error.message })
  }
})

// GET /api/session - get session info
router.get('/session', async (req, res) => {
  try {
    const user = req.cookies[cookieName]
    const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY
    const hasAuth = isNotEmptyString(AUTH_SECRET_KEY)
    res.send({
      status: 'Success',
      message: '',
      data: {
        auth: hasAuth,
        user,
      },
    })
  }
  catch (error: any) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body as { token: string }
    if (!token)
      throw new Error('Secret key is empty')

    if (process.env.AUTH_SECRET_KEY !== token)
      throw new Error('密钥无效 | Secret key is invalid')

    res.send({ status: 'Success', message: 'Verify successfully', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: (error as Error).message, data: null })
  }
})

const apiPrefix = process.env.API_PREFIX || '/api'

app.use('', router)
app.use(apiPrefix, router)
app.use(`${apiPrefix}/auth`, authRouter)
app.set('trust proxy', 1)

const port = process.env.SERVICE_PORT || 3002
app.listen(port, () => globalThis.console.log(`Server is running on port ${port}`))
