declare namespace Chat {

	interface Tool {
		name: string
		arguments?: string
		id?: string
	}

	interface Chat {
		dateTime: string
		text: string
		inversion?: boolean
		error?: boolean
		loading?: boolean
		conversationOptions?: ConversationRequest | null
		requestOptions: { prompt: string; options?: ConversationRequest | null }
		toolCalling?: boolean
		toolCalls?: Tool[]
		toolCallId?: string
		toolCallResult?: string
	}

	interface History {
		title: string
		isEdit: boolean
		csid: string
	}

	interface ChatState {
		active: string | null
		usingContext: boolean;
		history: History[]
		chat: { csid: string; data: Chat[] }[]
	}

	interface ConversationRequest {
		conversationId?: string
		parentMessageId?: string
	}

	interface ConversationResponse {
		conversationId: string
		detail: {
			choices: { finish_reason: string; index: number; logprobs: any; text: string }[]
			created: number
			id: string
			model: string
			object: string
			usage: { completion_tokens: number; prompt_tokens: number; total_tokens: number }
		}
		id: string
		parentMessageId: string
		role: string
		text: string
	}
}
