import React, { useRef, useEffect } from 'react'

export const RagChatPanel: React.FC<{
  isOpen: boolean
  onClose: () => void
  apiUrl: string
  activeNote: any
}> = ({ isOpen, onClose, apiUrl, activeNote }) => {
  const [messages, setMessages] = React.useState<any[]>([])
  const [input, setInput] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)

  const [attachedNote, setAttachedNote] = React.useState<any>(null)
  const [mode, setMode] = React.useState<'chat' | 'global' | 'doc'>('chat')
  const docAutoAttachRef = useRef(false)
  const lastNonDocModeRef = useRef<'chat' | 'global'>('chat')

  const handleModeChange = (nextMode: 'chat' | 'global' | 'doc') => {
    if (nextMode === 'doc') {
      if (!activeNote && !attachedNote) return
      if (mode !== 'doc') {
        lastNonDocModeRef.current = mode === 'global' ? 'global' : 'chat'
      }
      docAutoAttachRef.current = !attachedNote
    } else {
      lastNonDocModeRef.current = nextMode
      docAutoAttachRef.current = false
    }
    setMode(nextMode)
  }

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

  useEffect(() => {
    if (!docAutoAttachRef.current) return
    if (mode !== 'doc') return
    if (attachedNote) {
      docAutoAttachRef.current = false
      return
    }
    if (!activeNote) return
    setAttachedNote(activeNote)
    docAutoAttachRef.current = false
  }, [activeNote, attachedNote, mode])

  // Custom submit to inject context
  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    let contextStr = ''
    
    if (mode === 'doc') {
      if (!attachedNote?.content) {
        const aiMsgId = Date.now().toString()
        setMessages((prev: any[]) => [
          ...prev,
          { id: aiMsgId, role: 'assistant', content: 'Attach a note first to ask about the current document.' }
        ])
        return
      }
      contextStr = `[Source: ${attachedNote.title || 'Untitled'}]\n${attachedNote.content}`
    } else if (mode === 'global') {
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

  return (
    <>
      <div 
        className={`flex flex-col shrink-0 bg-[var(--panel-bg)] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          isOpen ? 'w-80 lg:w-96 opacity-100 border-l border-[var(--border)]' : 'w-0 opacity-0 overflow-hidden !border-none'
        }`}
      >
        
        {/* Header */}
        <div className="h-15 flex items-center justify-between px-4 border-b border-[var(--border)] shrink-0">
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
          {mode === 'doc' && attachedNote ? (
            <div className="mb-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--sk-focus-color)]/10 text-[var(--sk-focus-color)] rounded-lg border border-[var(--sk-focus-color)]/20 text-xs font-medium max-w-full">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span className="truncate">{attachedNote.title || 'Untitled Note'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachedNote(null)
                    setMode(lastNonDocModeRef.current)
                  }}
                  className="ml-1 p-0.5 rounded-full hover:bg-[var(--sk-focus-color)]/15 transition-colors shrink-0"
                  title="Cancel"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M2 10L10 2M2 2L10 10" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="inline-flex rounded-lg bg-[var(--bg)] border border-[var(--border)] p-0.5">
                <button
                  type="button"
                  onClick={() => handleModeChange('chat')}
                  className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors ${
                    mode === 'chat'
                      ? 'bg-[var(--panel-bg)] text-[var(--text)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  AI
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('global')}
                  className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors ${
                    mode === 'global'
                      ? 'bg-[var(--panel-bg)] text-[var(--text)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  全局检索
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('doc')}
                  disabled={!activeNote && !attachedNote}
                  className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors ${
                    mode === 'doc'
                      ? 'bg-[var(--panel-bg)] text-[var(--text)]'
                      : (!activeNote && !attachedNote)
                          ? 'text-[var(--muted)] opacity-40 cursor-not-allowed'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  当前文档
                </button>
              </div>
            </div>
          )}

          <form 
            onSubmit={onFormSubmit}
            className="relative flex items-center bg-[var(--bg)] rounded-xl border border-[var(--border)] shadow-sm focus-within:ring-2 ring-[#0071e3]/30 transition-all"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              placeholder={
                mode === 'doc'
                  ? (attachedNote ? `Ask about ${attachedNote.title || 'this note'}...` : 'Attach a note to ask about the current document...')
                  : (mode === 'global' ? 'Search all notes and ask...' : 'Message...')
              }
              className="w-full bg-transparent border-none py-3 pl-4 pr-12 text-[14px] focus:outline-none placeholder:text-[var(--muted)]"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading || (mode === 'doc' && !attachedNote)}
              className="absolute right-2 w-8 h-8 flex items-center justify-center rounded-lg bg-[#0071e3] text-white disabled:opacity-50 disabled:bg-[var(--border)] transition-colors"
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
