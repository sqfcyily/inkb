import React, { useRef, useEffect } from 'react'

export const RagChatPanel: React.FC<{
  isOpen: boolean
  onClose: () => void
  apiUrl: string
}> = ({ isOpen, onClose, apiUrl }) => {
  const [messages, setMessages] = React.useState<any[]>([])
  const [input, setInput] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Auto focus input when opened
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Custom submit to inject context
  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    // Find context using Hybrid Search (Semantic + Fulltext Fallback)
    let contextStr = ''
    try {
      // 1. Parallel fetch from both semantic and keyword search
      const [semanticRes, keywordRes] = await Promise.all([
        fetch(`${apiUrl}/api/search/semantic?q=${encodeURIComponent(input)}&limit=3`).catch(() => null),
        fetch(`${apiUrl}/api/search?q=${encodeURIComponent(input)}`).catch(() => null)
      ])

      const semanticResults = semanticRes?.ok ? await semanticRes.json() : []
      const keywordResults = keywordRes?.ok ? await keywordRes.json() : []

      // 2. Merge and deduplicate results
      // We prioritize semantic results if available, then pad with keyword results
      const mergedMap = new Map()
      
      // Add semantic results first
      if (Array.isArray(semanticResults)) {
        for (const r of semanticResults) {
          if (r.noteId && !mergedMap.has(r.noteId)) {
            mergedMap.set(r.noteId, r)
          }
        }
      }

      // Add keyword results (FTS snippet might not have full text, but we can use what we have or fetch full if needed. 
      // For now we just use the snippet or title if full text is not readily available in the list API)
      if (Array.isArray(keywordResults)) {
        for (const r of keywordResults) {
          // If we already have this note from semantic search, skip it
          if (!mergedMap.has(r.id)) {
            // Note: FTS search returns {id, title, snippet}. We'll use snippet as text.
            mergedMap.set(r.id, {
              title: r.title,
              text: r.snippet ? r.snippet.replace(/<[^>]*>?/gm, '') : '' // strip HTML tags from snippet
            })
          }
        }
      }

      // 3. Take top 4 unique documents
      const finalResults = Array.from(mergedMap.values()).slice(0, 4)

      if (finalResults.length > 0) {
        contextStr = finalResults
          .filter(r => r.text && r.text.trim().length > 0)
          .map(r => `[Source: ${r.title}]\n${r.text}`)
          .join('\n\n')
      }
    } catch (e) {
      console.error('Failed to fetch context', e)
    }

    const originalInput = input
    const enhancedInput = contextStr 
      ? `Answer the user question based on the following context. If the answer is not in the context, just answer based on your knowledge.\n\nCONTEXT:\n${contextStr}\n\nQuestion: ${originalInput}`
      : originalInput

    // Add user message to UI immediately with original input (we override the default handleSubmit)
    const newUserMsg = { id: Date.now().toString(), role: 'user' as const, content: originalInput }
    setMessages([...messages, newUserMsg])
    
    // Create an invisible system message or enhanced user message for the API
    const apiMessages = [...messages, { role: 'user', content: enhancedInput }]
    
    // Reset input
    setInput('')
    setIsLoading(true)

    // Call API manually to stream response since we modified the input
    try {
      const response = await fetch(`${apiUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages })
      })

      if (!response.ok) throw new Error('Network response was not ok')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      
      let aiContent = ''
      const aiMsgId = (Date.now() + 1).toString()
      setMessages((prev: any[]) => [...prev, { id: aiMsgId, role: 'assistant', content: '' }])

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.text) {
                  aiContent += data.text
                  setMessages((prev: any[]) => 
                    prev.map((m: any) => m.id === aiMsgId ? { ...m, content: aiContent } : m)
                  )
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[40000] bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Floating Glass Panel */}
      <div className="fixed top-4 right-4 bottom-4 w-[400px] z-[40001] flex flex-col overflow-hidden rounded-2xl bg-[var(--panel-bg)]/80 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-[var(--border)]/50 transition-transform">
        
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--border)]/30 shrink-0">
          <div className="font-semibold text-[15px] tracking-tight">Knowledge Chat</div>
          <button 
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--border)] transition-colors text-[var(--muted)] hover:text-[var(--text)]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 10L10 2M2 2L10 10" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--muted)] space-y-3">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
              <p className="text-sm">Ask anything about your notes</p>
            </div>
          ) : (
            messages.map((m: any) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`
                  max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed
                  ${m.role === 'user' 
                    ? 'bg-[#0071e3] text-white rounded-br-sm' 
                    : 'bg-[var(--border)]/30 text-[var(--text)] rounded-bl-sm'}
                `}>
                  {m.content || (
                    <span className="inline-flex gap-1 items-center h-5">
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '0ms' }}/>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '150ms' }}/>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '300ms' }}/>
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 shrink-0 bg-gradient-to-t from-[var(--panel-bg)] to-transparent">
          <form 
            onSubmit={onFormSubmit}
            className="relative flex items-center bg-[var(--bg)] rounded-full border border-[var(--border)] shadow-sm focus-within:ring-2 ring-[#0071e3]/30 transition-all"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              placeholder="Message..."
              className="w-full bg-transparent border-none py-3 pl-5 pr-12 text-[14px] focus:outline-none placeholder:text-[var(--muted)]"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 w-8 h-8 flex items-center justify-center rounded-full bg-[#0071e3] text-white disabled:opacity-50 disabled:bg-[var(--border)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>
        </div>

      </div>
    </>
  )
}