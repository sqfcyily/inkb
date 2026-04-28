import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Settings, FileText, Trash2, ArrowDownToLine, Link, File, FileEdit, X, RefreshCw, AlertTriangle, Info, CheckCircle, Eye, Edit3, Sparkles, Sun, Moon, Monitor, Folder, ChevronDown, PlusCircle, ListFilter, Search } from 'lucide-react'
import { useI18n } from './I18nProvider'
import NoteEditor from './NoteEditor'
import { RagChatPanel } from './RagChatPanel'

const API_URL =
  (import.meta as any)?.env?.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:${(import.meta as any)?.env?.VITE_API_PORT || 31777}`

interface Note {
  id: string
  title: string
  content?: string
  snippet?: string
  updatedAt: string
  createdAt: string
  category?: string
  weight?: number
}

function App() {
  const { t, langChoice, setLangChoice } = useI18n()

  const [notes, setNotes] = useState<Note[]>([])
  const [categories, setCategories] = useState<string[]>(['Default'])
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const categoryMenuRef = useRef<HTMLDivElement>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryModalMode, setCategoryModalMode] = useState<'new' | 'rename'>('new')
  const [categoryModalValue, setCategoryModalValue] = useState('')
  const [categoryModalOldName, setCategoryModalOldName] = useState<string | null>(null)
  const [categoryModalError, setCategoryModalError] = useState<string | null>(null)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Note[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('All')

  // Editor State
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [aiCompareOpen, setAiCompareOpen] = useState(false)
  const [aiCompareOriginal, setAiCompareOriginal] = useState('')
  const [aiCompareDraft, setAiCompareDraft] = useState('')
  const [aiCompareNoteId, setAiCompareNoteId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Delete Modal State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null)
  const [deleteCategoryConfirmOpen, setDeleteCategoryConfirmOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null)

  const [themeChoice, setThemeChoice] = useState<'system' | 'light' | 'dark'>(() => {
    const v = localStorage.getItem('theme')
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  })
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => {
    const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
    const resolve = () => themeChoice === 'system' ? (media?.matches ? 'dark' : 'light') : themeChoice
    return resolve()
  })
  const themeMountedRef = useRef(false)

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false)
  const [importType, setImportType] = useState<'url' | 'file' | 'memo'>('url')
  const [importUrl, setImportUrl] = useState('')
  const [importMemo, setImportMemo] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settings, setSettings] = useState<{
    baseURL: string
    chatModel: string
    hasApiKey: boolean
    embeddingBaseURL: string
    embeddingModel: string
    hasEmbeddingApiKey: boolean
  } | null>(null)
  const [settingsBaseURL, setSettingsBaseURL] = useState('')
  const [settingsChatModel, setSettingsChatModel] = useState('')
  const [settingsApiKey, setSettingsApiKey] = useState('')
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isTestingChatSettings, setIsTestingChatSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'general' | 'git' | 'llm'>('general')

  const [notesGitRemoteUrl, setNotesGitRemoteUrl] = useState('')
  const [notesGitBranch, setNotesGitBranch] = useState('main')
  const gitRemoteInputRef = useRef<HTMLInputElement>(null)

  // Git Sync State
  const [gitStatus, setGitStatus] = useState<{ dirtyCount: number, hasConflicts: boolean }>({ dirtyCount: 0, hasConflicts: false })
  const [isSyncing, setIsSyncing] = useState(false)
  const [showConflictModal, setShowConflictModal] = useState(false)

  // Toast State
  type ToastType = 'info' | 'success' | 'error' | 'warning'
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)
  
  // Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('isSidebarOpen')
    return saved !== null ? saved === 'true' : true
  })

  // Rag Chat Panel State
  const [isRagPanelOpen, setIsRagPanelOpen] = useState(() => {
    const saved = localStorage.getItem('isRagPanelOpen')
    return saved !== null ? saved === 'true' : false
  })

  useEffect(() => {
    localStorage.setItem('isSidebarOpen', isSidebarOpen.toString())
  }, [isSidebarOpen])

  useEffect(() => {
    localStorage.setItem('isRagPanelOpen', isRagPanelOpen.toString())
  }, [isRagPanelOpen])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    localStorage.setItem('theme', themeChoice)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const resolve = () => themeChoice === 'system' ? (media.matches ? 'dark' : 'light') : themeChoice

    const apply = (withTransition: boolean) => {
      if (withTransition) {
        document.documentElement.setAttribute('data-theme-transition', 'true')
        window.setTimeout(() => document.documentElement.removeAttribute('data-theme-transition'), 300)
      }
      const next = resolve()
      document.documentElement.setAttribute('data-theme', next)
      setEffectiveTheme(next)
    }

    apply(themeMountedRef.current)
    themeMountedRef.current = true

    if (themeChoice !== 'system') return
    const handler = () => apply(false)
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [themeChoice])

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings`)
      if (!res.ok) throw new Error('Failed to fetch settings')
      const data = await res.json()
      setSettings(data)
      setSettingsBaseURL(data.baseURL || '')
      setSettingsChatModel(data.chatModel || '')
      setSettingsApiKey('')
    } catch (err) {
      console.error(err)
      showToast(t('failedToLoadSettings'), 'error')
    }
  }, [showToast, t])

  const fetchGitConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/git/config`)
      if (!res.ok) throw new Error('Failed to fetch git config')
      const data = await res.json()
      setNotesGitRemoteUrl(data.notesGitRemoteUrl || '')
      setNotesGitBranch(data.notesGitBranch || 'main')
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    if (showSettingsModal) {
      fetchSettings()
      fetchGitConfig()
    }
  }, [showSettingsModal, fetchSettings, fetchGitConfig])


  // Fetch all notes

  const fetchGitStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/git/status`)
      if (res.ok) {
        const data = await res.json()
        setGitStatus(data)
      }
    } catch (err) {
      console.error('Failed to fetch git status', err)
    }
  }, [])

  const handleSync = async () => {
    setIsSyncing(true)
    showToast(t('syncing'), 'info')
    try {
      const res = await fetch(`${API_URL}/api/git/sync`, { method: 'POST' })
      if (res.status === 409) {
        setShowConflictModal(true)
        showToast(t('syncConflictDetected'), 'error')
      } else if (res.status === 412) {
        const data = await res.json().catch(() => ({} as any))
        if (data?.error === 'GIT_REMOTE_REQUIRED') {
          showToast(t('gitRemoteRequired'), 'warning')
          setShowSettingsModal(true)
          window.setTimeout(() => gitRemoteInputRef.current?.focus(), 50)
          return
        }
        throw new Error('Sync failed')
      } else if (!res.ok) {
        throw new Error('Sync failed')
      } else {
        showToast(t('syncSuccess'), 'success')
        fetchGitStatus()
        fetchNotes()
      }
    } catch (err) {
      console.error(err)
      showToast(t('syncFailed'), 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  const fetchNotes = async () => {
    try {
      const res = await fetch(`${API_URL}/notes`)
      const data = await res.json()
      setNotes(data)
    } catch (err) {
      console.error('Failed to fetch notes', err)
    }
  }

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/categories`)
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      console.error('Failed to fetch categories', err)
    }
  }

  useEffect(() => {
    fetchNotes()
    fetchCategories()
    fetchGitStatus()
  }, [fetchGitStatus])

  useEffect(() => {
    if (selectedCategory === 'All') return
    if (!categories.includes(selectedCategory)) setSelectedCategory('All')
  }, [categories, selectedCategory])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true)
      try {
        const [semanticRes, keywordRes] = await Promise.all([
          fetch(`${API_URL}/api/search/semantic?q=${encodeURIComponent(searchQuery)}&limit=5`).catch(() => null),
          fetch(`${API_URL}/api/search?q=${encodeURIComponent(searchQuery)}`).catch(() => null)
        ])

        const semanticResults = semanticRes?.ok ? await semanticRes.json() : []
        const keywordResults = keywordRes?.ok ? await keywordRes.json() : []

        const mergedMap = new Map()
        let weightCounter = 0;
        
        // Prioritize keyword results (FTS usually gives better exact matches with highlights)
        if (Array.isArray(keywordResults)) {
          for (const r of keywordResults) {
            mergedMap.set(r.id, { ...r, weight: weightCounter++ })
          }
        }

        // Fill in semantic results
        if (Array.isArray(semanticResults)) {
          for (const r of semanticResults) {
            if (r.noteId && !mergedMap.has(r.noteId)) {
              // Convert semantic result format to match keyword result format for UI
              mergedMap.set(r.noteId, {
                id: r.noteId,
                title: r.title,
                snippet: r.text.length > 100 ? r.text.substring(0, 100) + '...' : r.text,
                createdAt: new Date().toISOString(), // fallback date
                weight: weightCounter++
              })
            }
          }
        }

        setSearchResults(Array.from(mergedMap.values()))
      } catch (err) {
        console.error('Failed to search', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery])
  
  // Create note
  const createNote = useCallback(async () => {
    try {
      const currentCategory = selectedCategory !== 'All' ? selectedCategory : (activeNote?.category || 'Default')
      const res = await fetch(`${API_URL}/notes`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: currentCategory })
      })
      const data = await res.json()
      setNotes((prev) => [data, ...prev])
      setActiveNoteId(data.id)
    } catch (err) {
      console.error('Failed to create note', err)
      showToast(t('failedToCreateNote'), 'error')
    }
  }, [showToast, t, activeNote, selectedCategory])

  // Global Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        createNote()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        showToast(t('noteSavedLocally'), 'success')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createNote, showToast, t])

  // Fetch active note details
  useEffect(() => {
    if (!activeNoteId) {
      setActiveNote(null)
      return
    }
    const fetchNote = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`${API_URL}/notes/${activeNoteId}`)
        const data = await res.json()
        setActiveNote(data)
      } catch (err) {
        console.error('Failed to fetch note', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchNote()
  }, [activeNoteId])

  const closeImportModal = useCallback(() => {
    setShowImportModal(false)
    setImportUrl('')
    setImportMemo('')
    setImportFile(null)
  }, [])

  // Handle Import
  const handleImport = async () => {
    setIsImporting(true)
    const typeLabel = importType === 'url' ? t('url') : importType === 'file' ? t('file') : t('memo')
    showToast(t('importing', { type: typeLabel }), 'info')
    try {
      const currentCategory = selectedCategory !== 'All' ? selectedCategory : (activeNote?.category || 'Default')
      let res: Response;
      if (importType === 'url') {
        res = await fetch(`${API_URL}/api/ingest/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: importUrl, category: currentCategory })
        })
      } else if (importType === 'memo') {
        res = await fetch(`${API_URL}/api/ingest/memo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: importMemo, category: currentCategory })
        })
      } else {
        if (!importFile) throw new Error('No file selected')
        const formData = new FormData()
        formData.append('file', importFile)
        formData.append('category', currentCategory)
        res = await fetch(`${API_URL}/api/ingest/file`, {
          method: 'POST',
          body: formData
        })
      }

      if (!res.ok) throw new Error('Import failed')
      const data = await res.json()
      setNotes((prev) => [data, ...prev])
      setActiveNoteId(data.id)
      closeImportModal()
      showToast(t('importSuccess'), 'info')
      setTimeout(() => setToast(null), 5000)
      
      setTimeout(() => {
        if (data.id) {
          fetch(`${API_URL}/notes/${data.id}`)
            .then(r => r.json())
            .then(updatedNote => {
              setActiveNote(updatedNote)
              showToast(t('aiReady'), 'info')
              setTimeout(() => setToast(null), 3000)
            })
        }
      }, 5000)
      
    } catch (err) {
      console.error('Import failed:', err)
      showToast(t('importFailed'), 'error')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setIsImporting(false)
    }
  }

  // Delete note
  const confirmDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setNoteToDelete(id)
    setDeleteConfirmOpen(true)
  }

  const deleteNote = async () => {
    if (!noteToDelete) return
    try {
      await fetch(`${API_URL}/notes/${noteToDelete}`, { method: 'DELETE' })
      setNotes((prev) => prev.filter(n => n.id !== noteToDelete))
      setSearchResults((prev) => prev.filter(n => n.id !== noteToDelete))
      if (activeNoteId === noteToDelete) setActiveNoteId(null)
    } catch (err) {
      console.error('Failed to delete note', err)
    } finally {
      setDeleteConfirmOpen(false)
      setNoteToDelete(null)
    }
  }

  const deleteCategory = async () => {
    if (!categoryToDelete) return
    try {
      await fetch(`${API_URL}/categories/${encodeURIComponent(categoryToDelete)}`, { method: 'DELETE' })
      setCategories(prev => prev.filter(c => c !== categoryToDelete))
      if (selectedCategory === categoryToDelete) setSelectedCategory('All')
    } catch (err) {
      console.error('Failed to delete category', err)
    } finally {
      setDeleteCategoryConfirmOpen(false)
      setCategoryToDelete(null)
    }
  }

  // Auto-save logic
  const handleContentChange = useCallback((val: string) => {
    if (!activeNote) return
    setActiveNote((prev) => prev ? { ...prev, content: val } : null)
  }, [activeNote])

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeNote) return
    setActiveNote((prev) => prev ? { ...prev, title: e.target.value } : null)
  }, [activeNote])

  const openNewCategoryModal = useCallback(() => {
    setCategoryModalMode('new')
    setCategoryModalValue('')
    setCategoryModalOldName(null)
    setCategoryModalError(null)
    setCategoryModalOpen(true)
  }, [])

  const openRenameCategoryModal = useCallback((oldName: string) => {
    setCategoryModalMode('rename')
    setCategoryModalValue(oldName)
    setCategoryModalOldName(oldName)
    setCategoryModalError(null)
    setCategoryModalOpen(true)
  }, [])

  const applyCategoryToActiveNote = useCallback((category: string) => {
    if (!activeNote) return
    setActiveNote(prev => prev ? { ...prev, category } : null)
  }, [activeNote])

  const validateCategoryName = useCallback((raw: string) => {
    const name = raw.trim()
    if (!name) return { ok: false, name, error: t('categoryNameInvalid') }
    if (name.includes('/') || name.includes('\\')) return { ok: false, name, error: t('categoryNameInvalid') }
    if (name === '.' || name === '..') return { ok: false, name, error: t('categoryNameInvalid') }
    return { ok: true, name, error: null as any }
  }, [t])

  const submitCategoryModal = useCallback(async () => {
    const v = validateCategoryName(categoryModalValue)
    if (!v.ok) {
      setCategoryModalError(v.error)
      return
    }

    if (categoryModalMode === 'new') {
      if (categories.includes(v.name)) {
        setCategoryModalError(t('categoryNameExists'))
        return
      }
      setCategories(prev => prev.includes(v.name) ? prev : [...prev, v.name])
      applyCategoryToActiveNote(v.name)
      setCategoryModalOpen(false)
      setCategoryMenuOpen(false)
      return
    }

    const oldName = categoryModalOldName
    if (!oldName || oldName === 'Default') {
      setCategoryModalOpen(false)
      return
    }

    if (oldName === v.name) {
      setCategoryModalOpen(false)
      return
    }
    if (categories.includes(v.name)) {
      setCategoryModalError(t('categoryNameExists'))
      return
    }

    try {
      await fetch(`${API_URL}/categories/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: v.name })
      })
      await fetchCategories()
      await fetchNotes()
      setActiveNote(prev => prev && (prev.category || 'Default') === oldName ? { ...prev, category: v.name } : prev)
      setNotes(prev => prev.map(n => (n.category || 'Default') === oldName ? { ...n, category: v.name } : n))
      setCategoryModalOpen(false)
      setCategoryMenuOpen(false)
    } catch (err) {
      console.error(err)
    }
  }, [API_URL, applyCategoryToActiveNote, categories, categoryModalMode, categoryModalOldName, categoryModalValue, fetchCategories, fetchNotes, t, validateCategoryName])

  useEffect(() => {
    if (!categoryMenuOpen) return
    const onDown = (e: MouseEvent) => {
      const el = categoryMenuRef.current
      if (el && !el.contains(e.target as any)) setCategoryMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCategoryMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [categoryMenuOpen])

  useEffect(() => {
    if (!activeNote) return
    const timer = setTimeout(async () => {
      try {
        await fetch(`${API_URL}/notes/${activeNote.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: activeNote.title,
            content: activeNote.content || '',
            category: activeNote.category
          })
        })
        setNotes((prev) => prev.map(n => n.id === activeNote.id ? { ...n, title: activeNote.title, category: activeNote.category, updatedAt: new Date().toISOString() } : n))
        fetchGitStatus()
      } catch (err) {
        console.error('Failed to save note', err)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [activeNote?.content, activeNote?.title, activeNote?.category])

  const [sortMode, setSortMode] = useState<'created_desc' | 'created_asc' | 'title_asc' | 'title_desc'>(() => {
    return (localStorage.getItem('sortMode') as any) || 'created_desc'
  })

  const handleSortChange = (mode: 'created_desc' | 'created_asc' | 'title_asc' | 'title_desc') => {
    setSortMode(mode)
    localStorage.setItem('sortMode', mode)
  }

  const listNotes = useMemo(() => {
    let filtered = searchQuery.trim()
      ? searchResults
      : (selectedCategory === 'All'
          ? notes
          : notes.filter(n => (n.category || 'Default') === selectedCategory))
          
    return [...filtered].sort((a, b) => {
      if (searchQuery.trim()) {
        return (a.weight || 0) - (b.weight || 0)
      }
      switch (sortMode) {
        case 'created_desc': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'created_asc': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'title_asc': return (a.title || t('untitled')).localeCompare(b.title || t('untitled'))
        case 'title_desc': return (b.title || t('untitled')).localeCompare(a.title || t('untitled'))
        default: return 0
      }
    })
  }, [notes, searchQuery, searchResults, selectedCategory, sortMode, t])

  const cycleTheme = () => {
    setThemeChoice(v => v === 'system' ? 'light' : v === 'light' ? 'dark' : 'system')
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg)] text-[var(--text)] overflow-hidden font-sans">
      <div className="mac-toolbar mac-glass relative z-[20000]">
        <div className="flex items-center gap-3 min-w-0 min-w-[150px] select-none group cursor-default">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="mac-icon-btn shrink-0"
            title={t('toggleSidebar')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
          <div className="shrink-0 w-[40px] h-[40px] grid grid-cols-2 grid-rows-2 gap-[2px] p-[2px] bg-transparent">
            <div className="w-full h-full rounded-[6px] bg-[#2BB1AC] flex items-center justify-center text-[13px] font-black text-white">I</div>
            <div className="w-full h-full rounded-[6px] bg-[#E94372] flex items-center justify-center text-[13px] font-black text-white">N</div>
            <div className="w-full h-full rounded-[6px] bg-[#4C4F54] flex items-center justify-center text-[13px] font-black text-[#FACC31]">K</div>
            <div className="w-full h-full rounded-[6px] bg-gradient-to-br from-[#F5D7A1] to-[#D59883] flex items-center justify-center text-[13px] font-black text-[#6B442A]">B</div>
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            <div className="text-[18px] font-black tracking-tighter leading-none uppercase bg-clip-text text-transparent bg-gradient-to-br from-[var(--text)] to-[var(--muted)] truncate">
              {t('appTitle')}
            </div>
            <div className="text-[10px] font-bold tracking-widest text-[var(--muted)] uppercase truncate mt-1 opacity-80">
              {selectedCategory === 'All' ? t('allNotes') : selectedCategory}
            </div>
          </div>
        </div>

        <div className="flex-1 px-6 min-w-0 flex justify-center">
          <div className="relative w-full max-w-xl flex items-center">
            <input
              type="text"
              ref={searchInputRef}
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mac-input w-full pl-[36px] pr-3"
            />
            <Search className="absolute left-3 text-[var(--muted)]" size={16} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 min-w-[150px] justify-end">
          <button 
            onClick={() => setIsRagPanelOpen(!isRagPanelOpen)} 
            className={`mac-icon-btn ${isRagPanelOpen ? 'text-[#0071e3]' : ''}`} 
            title="Knowledge Chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>

          <button onClick={createNote} className="mac-btn mac-btn-primary inline-flex items-center gap-2" title={t('newNote')}>
            <Plus size={16} />
            <span className="hidden sm:inline">{t('newNote')}</span>
          </button>

          <button onClick={() => setShowImportModal(true)} className="mac-icon-btn" title={t('import')}>
            <ArrowDownToLine size={18} />
          </button>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="mac-icon-btn relative"
            title={t('syncNotes')}
          >
            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
            {gitStatus.dirtyCount > 0 && !isSyncing && (
              <span className="absolute -top-1.5 -right-1.5 bg-[var(--sk-focus-color)] text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border border-[var(--border-subtle)]">
                {gitStatus.dirtyCount}
              </span>
            )}
            {gitStatus.hasConflicts && (
              <span className="absolute -bottom-1 -right-1 text-red-500 bg-[var(--toolbar-bg)] rounded-full border border-[var(--border-subtle)]">
                <AlertTriangle size={14} />
              </span>
            )}
          </button>

          <button onClick={cycleTheme} className="mac-icon-btn" title={t('theme')}>
            {themeChoice === 'system' ? <Monitor size={18} /> : themeChoice === 'light' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button onClick={() => setShowSettingsModal(true)} className="mac-icon-btn" title={t('settings')}>
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className={`mac-sidebar mac-glass min-w-0 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isSidebarOpen ? 'w-56 border-r border-[var(--border)]' : 'w-0 opacity-0 overflow-hidden border-0'}`}>
          <div className="p-3">
            <button
              type="button"
              onClick={() => setSelectedCategory('All')}
              className={`w-full mac-btn ${selectedCategory === 'All' ? 'mac-btn-secondary' : 'mac-btn-ghost'} justify-start gap-2`}
            >
              <FileText size={16} />
              <span className="flex-1 text-left">{t('allNotes')}</span>
              <span className="text-[11px] text-[var(--muted)]">{notes.length}</span>
            </button>
          </div>

          <div className="px-3 pb-2 text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
            {t('categoryName')}
          </div>

          <div className="flex-1 overflow-auto px-2 pb-3">
            {categories.map(cat => {
              const count = notes.filter(n => (n.category || 'Default') === cat).length
              const isActive = selectedCategory === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full mac-btn ${isActive ? 'mac-btn-secondary' : 'mac-btn-ghost'} justify-start gap-2 mb-1`}
                >
                  <Folder size={16} />
                  <span className="flex-1 text-left truncate">{cat}</span>
                  <span className="text-[11px] text-[var(--muted)]">{count}</span>
                </button>
              )
            })}
          </div>

          <div className="p-3 border-t border-[var(--border-subtle)]">
            <button onClick={openNewCategoryModal} className="w-full mac-btn mac-btn-secondary inline-flex items-center gap-2 justify-center">
              <PlusCircle size={16} />
              {t('newCategory')}
            </button>
          </div>
        </div>

        <div className="mac-list mac-glass w-80 min-w-0">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between h-15">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                {searchQuery.trim() ? t('searchPlaceholder') : (selectedCategory === 'All' ? t('allNotes') : selectedCategory)}
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                {isSearching ? t('searching') : `${listNotes.length} ${t('notes')}`}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {selectedCategory !== 'All' && selectedCategory !== 'Default' && !searchQuery.trim() && (
                <>
                  <button
                    className="mac-icon-btn"
                    title={t('renameCategory')}
                    onClick={() => openRenameCategoryModal(selectedCategory)}
                  >
                    <Edit3 size={18} />
                  </button>
                  {listNotes.length === 0 && (
                    <button
                      className="mac-icon-btn text-red-500 hover:text-red-600"
                      title={t('deleteCategory')}
                      onClick={() => {
                        setCategoryToDelete(selectedCategory)
                        setDeleteCategoryConfirmOpen(true)
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </>
              )}

              {!searchQuery.trim() && (
                <div className="relative group pb-2 -mb-2">
                  <button className="mac-icon-btn hover:bg-[var(--panel-bg-hover)]" title={t('sortBy')}>
                    <ListFilter size={16} className="text-[var(--muted)]" />
                  </button>
                  <div className="absolute right-0 top-[calc(100%-8px)] mt-1 w-56 bg-[var(--panel-bg-2)]/95 backdrop-blur-2xl border border-[var(--border)] shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-xl p-1.5 z-[99999] hidden group-hover:block transition-all origin-top-right">
                    <div className="px-2 py-1.5 text-[11px] font-semibold text-[var(--muted)] tracking-wider">
                      {t('sortBy')}
                    </div>
                    <div className="space-y-0.5">
                      <button 
                        onClick={() => handleSortChange('created_desc')}
                        className={`w-full px-2 py-1.5 text-left text-[13px] font-medium rounded-md flex items-center justify-between transition-colors ${sortMode === 'created_desc' ? 'bg-[var(--sk-focus-color)] text-white' : 'text-[var(--text)] hover:bg-[var(--sk-focus-color)] hover:text-white'}`}
                      >
                        {t('sortCreatedDesc')}
                        {sortMode === 'created_desc' && <CheckCircle size={14} className="opacity-100" />}
                      </button>
                      <button 
                        onClick={() => handleSortChange('created_asc')}
                        className={`w-full px-2 py-1.5 text-left text-[13px] font-medium rounded-md flex items-center justify-between transition-colors ${sortMode === 'created_asc' ? 'bg-[var(--sk-focus-color)] text-white' : 'text-[var(--text)] hover:bg-[var(--sk-focus-color)] hover:text-white'}`}
                      >
                        {t('sortCreatedAsc')}
                        {sortMode === 'created_asc' && <CheckCircle size={14} className="opacity-100" />}
                      </button>
                      <div className="h-px bg-[var(--border-subtle)] my-1 mx-2"></div>
                      <button 
                        onClick={() => handleSortChange('title_asc')}
                        className={`w-full px-2 py-1.5 text-left text-[13px] font-medium rounded-md flex items-center justify-between transition-colors ${sortMode === 'title_asc' ? 'bg-[var(--sk-focus-color)] text-white' : 'text-[var(--text)] hover:bg-[var(--sk-focus-color)] hover:text-white'}`}
                      >
                        {t('sortTitleAsc')}
                        {sortMode === 'title_asc' && <CheckCircle size={14} className="opacity-100" />}
                      </button>
                      <button 
                        onClick={() => handleSortChange('title_desc')}
                        className={`w-full px-2 py-1.5 text-left text-[13px] font-medium rounded-md flex items-center justify-between transition-colors ${sortMode === 'title_desc' ? 'bg-[var(--sk-focus-color)] text-white' : 'text-[var(--text)] hover:bg-[var(--sk-focus-color)] hover:text-white'}`}
                      >
                        {t('sortTitleDesc')}
                        {sortMode === 'title_desc' && <CheckCircle size={14} className="opacity-100" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {!isSearching && listNotes.length === 0 ? (
              <div className="p-6 text-center text-[var(--muted)] text-sm">
                {searchQuery.trim() ? t('noResults') : t('noNotesYet')}
              </div>
            ) : (
              listNotes.map(note => (
                <div
                  key={note.id}
                  onClick={() => setActiveNoteId(note.id)}
                  className={`px-4 py-3 border-b border-[var(--border-subtle)] cursor-pointer transition-colors group relative ${
                    activeNoteId === note.id ? 'bg-[var(--panel-bg)]' : 'hover:bg-[var(--panel-bg-hover)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[var(--text)] truncate">{note.title || t('untitled')}</div>
                      {searchQuery.trim() ? (
                        note.snippet ? (
                          <div
                            className="text-xs text-[var(--muted)] mt-1 line-clamp-2 [&>mark]:bg-[var(--sk-focus-color)]/25 [&>mark]:text-[var(--text)] [&>mark]:rounded-sm [&>mark]:px-0.5"
                            dangerouslySetInnerHTML={{ __html: note.snippet }}
                          />
                        ) : (
                          <div className="text-xs text-[var(--muted)] mt-1">{new Date(note.createdAt).toLocaleDateString()}</div>
                        )
                      ) : (
                        <div className="text-xs text-[var(--muted)] mt-1">{new Date(note.createdAt).toLocaleDateString()}</div>
                      )}
                    </div>
                    <button
                      onClick={(e) => confirmDeleteNote(note.id, e)}
                      className="mac-icon-btn opacity-0 group-hover:opacity-100"
                      title={t('delete')}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mac-editor flex-1 min-w-0">
          {isLoading || isImporting ? (
            <div className="flex-1 flex flex-col p-8 gap-4 animate-pulse">
              <div className="h-10 bg-[var(--panel-bg)] rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-[var(--panel-bg)] rounded w-full"></div>
              <div className="h-4 bg-[var(--panel-bg)] rounded w-5/6"></div>
              <div className="h-4 bg-[var(--panel-bg)] rounded w-4/6"></div>
              <div className="h-4 bg-[var(--panel-bg)] rounded w-full"></div>
              <div className="h-4 bg-[var(--panel-bg)] rounded w-3/4"></div>
            </div>
          ) : activeNote ? (
            <>
              <div className="mac-toolbar mac-glass justify-between gap-4 h-15 min-h-15">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input
                    type="text"
                    value={activeNote.title}
                    onChange={handleTitleChange}
                    placeholder={t('noteTitlePlaceholder')}
                    className="bg-transparent text-lg font-semibold text-[var(--text)] placeholder-[var(--muted)] focus:outline-none flex-1 min-w-0"
                  />

                  <div ref={categoryMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setCategoryMenuOpen(v => !v)}
                      className="mac-btn mac-btn-secondary inline-flex items-center gap-2"
                    >
                      <Folder size={16} className="text-[var(--muted)]" />
                      <span className="font-medium">{activeNote.category || 'Default'}</span>
                      <ChevronDown size={16} className={`transition-transform ${categoryMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {categoryMenuOpen && (
                      <div className="absolute left-0 mt-2 w-72 rounded-xl border border-[var(--border)] bg-[var(--panel-bg-2)] shadow-2xl overflow-hidden z-[99999]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                          {t('categoryName')}
                        </div>
                        <div className="max-h-72 overflow-auto">
                          {categories.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                applyCategoryToActiveNote(c)
                                setCategoryMenuOpen(false)
                              }}
                              className={`w-full px-3 py-2 flex items-center justify-between text-left text-sm transition-colors ${
                                (activeNote.category || 'Default') === c
                                  ? 'bg-[var(--panel-bg)] text-[var(--text)]'
                                  : 'text-[var(--text)] hover:bg-[var(--panel-bg-hover)]'
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <Folder size={14} className="opacity-70" />
                                {c}
                              </span>
                              {(activeNote.category || 'Default') === c && (
                                <CheckCircle size={14} className="text-[var(--sk-focus-color)]" />
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-[var(--border)] bg-[var(--panel-bg)] p-2 flex gap-2">
                          <button
                            type="button"
                            onClick={openNewCategoryModal}
                            className="flex-1 mac-btn mac-btn-primary inline-flex items-center justify-center gap-2"
                          >
                            <PlusCircle size={16} />
                            {t('newCategory')}
                          </button>
                          {(activeNote.category || 'Default') !== 'Default' && (
                            <button
                              type="button"
                              onClick={() => openRenameCategoryModal(activeNote.category || 'Default')}
                              className="mac-icon-btn"
                            >
                              <Edit3 size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      if (!activeNote) return
                      const noteId = activeNote.id
                      const original = activeNote.content || ''
                      setIsGeneratingAI(true)
                      setAiCompareNoteId(noteId)
                      setAiCompareOriginal(original)
                      setAiCompareDraft('')
                      setAiCompareOpen(true)
                      
                      abortControllerRef.current = new AbortController()
                      
                      try {
                        const res = await fetch(`${API_URL}/api/ai/summarize`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: activeNote.id }),
                          signal: abortControllerRef.current.signal
                        })
                        
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}))
                          throw new Error(data.error || 'Request failed')
                        }

                        const reader = res.body?.getReader()
                        if (!reader) throw new Error('No readable stream')

                        const decoder = new TextDecoder('utf-8')
                        let draft = ''
                        
                        while (true) {
                          const { done, value } = await reader.read()
                          if (done) break
                          
                          const chunk = decoder.decode(value, { stream: true })
                          const lines = chunk.split('\n')
                          
                          for (const line of lines) {
                            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                              try {
                                const data = JSON.parse(line.slice(6))
                                if (data.error) throw new Error(data.error)
                                if (data.text) {
                                  draft += data.text
                                  setAiCompareDraft(draft)
                                }
                              } catch (e) {
                                // Ignore parse errors for incomplete chunks
                              }
                            }
                          }
                        }
                        
                        showToast(t('aiGenerated'), 'success')
                      } catch (err: any) {
                        if (err.name === 'AbortError') {
                          console.log('AI generation aborted')
                        } else {
                          console.error(err)
                          setAiCompareOpen(false)
                          showToast(err.message || 'Failed to generate', 'error')
                        }
                      } finally {
                        setIsGeneratingAI(false)
                        abortControllerRef.current = null
                      }
                    }}
                    disabled={isGeneratingAI}
                    className="mac-btn mac-btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Sparkles size={16} className="text-[var(--sk-focus-color)]" />
                    <span className="hidden sm:inline">{isGeneratingAI ? t('generatingAi') : t('aiSummary')}</span>
                  </button>

                  <div className="flex p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-bg)] hidden">
                    <button
                      onClick={() => setIsPreviewMode(false)}
                      className={`mac-btn ${!isPreviewMode ? 'mac-btn-secondary' : 'mac-btn-ghost'} h-9`}
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => setIsPreviewMode(true)}
                      className={`mac-btn ${isPreviewMode ? 'mac-btn-secondary' : 'mac-btn-ghost'} h-9`}
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <div className="mac-surface h-full overflow-hidden border-0!">
                  <NoteEditor 
                    key={activeNote.id}
                    content={activeNote.content || ''} 
                    onChange={handleContentChange}
                    theme={effectiveTheme}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--muted)]">
              <div className="w-20 h-20 bg-[var(--panel-bg)] rounded-2xl flex items-center justify-center mb-5 border border-[var(--border-subtle)]">
                <FileText size={36} className="text-[var(--muted)]" />
              </div>
              <div className="text-lg font-semibold text-[var(--text)] mb-1">{t('noNoteSelected')}</div>
              <div className="text-sm text-[var(--muted)]">{t('pressToSearchOrCreate', { k: 'Cmd+K', n: 'Cmd+N' })}</div>
            </div>
          )}
        </div>
        
        {/* Right Docked Rag Panel */}
        <RagChatPanel isOpen={isRagPanelOpen} onClose={() => setIsRagPanelOpen(false)} apiUrl={API_URL} />
      </div>

      {categoryModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
            <div className="bg-[var(--panel-bg-2)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-[var(--border)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--panel-bg)]">
                <div className="flex items-center gap-2">
                  <Folder size={18} className="text-[var(--muted)]" />
                  <div className="text-base font-semibold text-[var(--text)]">
                    {categoryModalMode === 'new' ? t('newCategory') : t('renameCategory')}
                  </div>
                </div>
                <button
                  onClick={() => setCategoryModalOpen(false)}
                  className="mac-icon-btn"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                className="p-5 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  submitCategoryModal()
                }}
              >
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[var(--text)]">{t('categoryName')}</label>
                  <input
                    autoFocus
                    value={categoryModalValue}
                    onChange={(e) => {
                      setCategoryModalValue(e.target.value)
                      setCategoryModalError(null)
                    }}
                    className="mac-input w-full"
                  />
                  {categoryModalError && (
                    <div className="text-xs text-red-400">{categoryModalError}</div>
                  )}
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCategoryModalOpen(false)}
                    className="mac-btn mac-btn-secondary"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="mac-btn mac-btn-primary"
                  >
                    {t('save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {showConflictModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[var(--panel-bg-2)] rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-red-500/50 flex flex-col animate-in zoom-in-95 duration-200">
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={32} className="text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-[var(--text)] mb-2">{t('conflictTitle')}</h2>
                <p className="text-[var(--muted)] text-sm mb-6">
                  {t('conflictDesc')}
                </p>
                <div className="bg-[var(--input-bg)] p-4 rounded-lg text-left mb-6 font-mono border border-[var(--input-border)]">
                  <span className="text-blue-400">$</span> <span className="text-gray-200">git status</span><br/>
                  <span className="text-[var(--muted)] text-xs mt-2 block"># {t('conflictHint')}</span>
                </div>
                <button 
                  onClick={() => setShowConflictModal(false)}
                  className="w-full mac-btn mac-btn-secondary"
                >
                  {t('understand')}
                </button>
              </div>
            </div>
          </div>
        )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4">
          <div className="bg-[var(--panel-bg-2)] rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-[var(--border)] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-[var(--panel-bg)]">
              <h2 className="text-lg font-medium text-[var(--text)] flex items-center gap-2">
                <ArrowDownToLine size={18} />
                {t('importContent')}
              </h2>
              <button onClick={closeImportModal} className="mac-icon-btn">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex border-b border-[var(--border)]">
              <button 
                onClick={() => setImportType('url')}
                className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${importType === 'url' ? 'bg-[var(--panel-bg)] text-blue-500 border-b-2 border-blue-500' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-bg)]'}`}
              >
                <Link size={16} /> {t('url')}
              </button>
              <button 
                onClick={() => setImportType('file')}
                className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${importType === 'file' ? 'bg-[var(--panel-bg)] text-blue-500 border-b-2 border-blue-500' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-bg)]'}`}
              >
                <File size={16} /> {t('file')}
              </button>
              <button 
                onClick={() => setImportType('memo')}
                className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${importType === 'memo' ? 'bg-[var(--panel-bg)] text-blue-500 border-b-2 border-blue-500' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-bg)]'}`}
              >
                <FileEdit size={16} /> {t('memo')}
              </button>
            </div>

            <div className="p-6">
              {importType === 'url' && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('webPageUrl')}</label>
                  <input 
                    type="url" 
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://example.com/article"
                    className="mac-input w-full"
                  />
                </div>
              )}
              
              {importType === 'file' && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('uploadDocument')}</label>
                  <div 
                    className="border-2 border-dashed border-[var(--input-border)] rounded-lg p-8 text-center hover:bg-[var(--panel-bg)] transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept=".txt,.md,.doc,.docx,.pdf"
                      className="hidden"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    />
                    <File className="mx-auto text-[var(--muted)] mb-3" size={32} />
                    {importFile ? (
                      <p className="text-sm text-blue-400 font-medium">{importFile.name}</p>
                    ) : (
                      <>
                        <p className="text-sm text-[var(--text)] mb-1">{t('clickToBrowse')}</p>
                        <p className="text-xs text-[var(--muted)]">{t('supportedFormats')}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
              
              {importType === 'memo' && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('quickMemo')}</label>
                  <textarea 
                    value={importMemo}
                    onChange={(e) => setImportMemo(e.target.value)}
                    placeholder="Type or paste your text here..."
                    rows={6}
                    className="mac-textarea w-full resize-none"
                  />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--panel-bg)] flex justify-end gap-3">
              <button 
                onClick={closeImportModal}
                className="mac-btn mac-btn-ghost"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={handleImport}
                disabled={isImporting || (importType === 'url' && !importUrl) || (importType === 'file' && !importFile) || (importType === 'memo' && !importMemo)}
                className="mac-btn mac-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isImporting ? t('processing') : t('importAction')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--panel-bg-2)] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[var(--border)] flex flex-col md:flex-row h-[500px] animate-in zoom-in-95 duration-200">
            <div className="w-full md:w-48 bg-[var(--panel-bg)] border-b md:border-b-0 md:border-r border-[var(--border)] flex flex-col">
              <div className="p-4 border-b border-[var(--border)]">
                <h2 className="text-lg font-medium text-[var(--text)] flex items-center gap-2">
                  <Settings size={18} />
                  {t('settingsTitle')}
                </h2>
              </div>
              <div className="p-2 flex-1 space-y-1">
                <button
                  onClick={() => setSettingsTab('general')}
                  className={`w-full mac-btn ${settingsTab === 'general' ? 'mac-btn-secondary' : 'mac-btn-ghost'} justify-start`}
                >
                  {t('tabGeneral')}
                </button>
                <button
                  onClick={() => setSettingsTab('git')}
                  className={`w-full mac-btn ${settingsTab === 'git' ? 'mac-btn-secondary' : 'mac-btn-ghost'} justify-start`}
                >
                  {t('tabGit')}
                </button>
                <button
                  onClick={() => setSettingsTab('llm')}
                  className={`w-full mac-btn ${settingsTab === 'llm' ? 'mac-btn-secondary' : 'mac-btn-ghost'} justify-start`}
                >
                  {t('tabLLM')}
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col bg-[var(--panel-bg-2)] overflow-hidden">
              <div className="p-6 flex-1 overflow-y-auto">
                {settingsTab === 'general' && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-[var(--text)]">{t('theme')}</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setThemeChoice('system')}
                          className={`flex-1 mac-btn ${themeChoice === 'system' ? 'mac-btn-secondary' : 'mac-btn-ghost'} gap-2`}
                        >
                          <Monitor size={16} /> {t('themeSystem')}
                        </button>
                        <button
                          onClick={() => setThemeChoice('light')}
                          className={`flex-1 mac-btn ${themeChoice === 'light' ? 'mac-btn-secondary' : 'mac-btn-ghost'} gap-2`}
                        >
                          <Sun size={16} /> {t('themeLight')}
                        </button>
                        <button
                          onClick={() => setThemeChoice('dark')}
                          className={`flex-1 mac-btn ${themeChoice === 'dark' ? 'mac-btn-secondary' : 'mac-btn-ghost'} gap-2`}
                        >
                          <Moon size={16} /> {t('themeDark')}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-[var(--text)]">{t('language')}</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLangChoice('auto')}
                          className={`flex-1 mac-btn ${langChoice === 'auto' ? 'mac-btn-secondary' : 'mac-btn-ghost'}`}
                        >
                          {t('languageAuto')}
                        </button>
                        <button
                          onClick={() => setLangChoice('zh')}
                          className={`flex-1 mac-btn ${langChoice === 'zh' ? 'mac-btn-secondary' : 'mac-btn-ghost'}`}
                        >
                          {t('languageZh')}
                        </button>
                        <button
                          onClick={() => setLangChoice('en')}
                          className={`flex-1 mac-btn ${langChoice === 'en' ? 'mac-btn-secondary' : 'mac-btn-ghost'}`}
                        >
                          {t('languageEn')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === 'git' && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-[var(--text)]">{t('gitSync')}</div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('notesRepoUrl')}</label>
                        <input
                          ref={gitRemoteInputRef}
                          type="text"
                          value={notesGitRemoteUrl}
                          onChange={(e) => setNotesGitRemoteUrl(e.target.value)}
                          placeholder="https://github.com/your-org/notes.git"
                          className="mac-input w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('branch')}</label>
                        <input
                          type="text"
                          value={notesGitBranch}
                          onChange={(e) => setNotesGitBranch(e.target.value)}
                          placeholder="main"
                          className="mac-input w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === 'llm' && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-[var(--text)]">{t('llm')}</div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('baseUrl')}</label>
                        <input
                          type="text"
                          value={settingsBaseURL}
                          onChange={(e) => setSettingsBaseURL(e.target.value)}
                          placeholder="https://api.openai.com/v1"
                          className="mac-input w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('chatModel')}</label>
                        <input
                          type="text"
                          value={settingsChatModel}
                          onChange={(e) => setSettingsChatModel(e.target.value)}
                          placeholder="gpt-4o-mini"
                          className="mac-input w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('apiKey')}</label>
                        <input
                          type="password"
                          value={settingsApiKey}
                          onChange={(e) => setSettingsApiKey(e.target.value)}
                          placeholder={settings?.hasApiKey ? t('apiKeyLeaveBlank') : t('apiKeyEnter')}
                          className="mac-input w-full"
                        />
                        <div className="mt-2 text-xs text-[var(--muted)]">
                          {t('apiKey')}: {settings?.hasApiKey ? t('apiKeyConfigured') : t('apiKeyNotConfigured')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-[var(--border)] bg-[var(--panel-bg)] flex justify-between gap-3">
                {settingsTab === 'llm' && (
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setIsTestingChatSettings(true)
                        showToast(t('testing'), 'info')
                        try {
                          const body: any = {
                            baseURL: settingsBaseURL,
                            chatModel: settingsChatModel
                          }
                          if (settingsApiKey) body.apiKey = settingsApiKey
                          const res = await fetch(`${API_URL}/api/settings/test`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                          })
                          const data = await res.json().catch(() => ({}))
                          if (!res.ok) {
                            showToast(data?.error || t('connectionTestFailed'), 'error')
                            return
                          }
                          showToast(t('connectionOk'), 'success')
                        } catch (err) {
                          console.error(err)
                          showToast(t('connectionTestFailed'), 'error')
                        } finally {
                          setIsTestingChatSettings(false)
                        }
                      }}
                      disabled={isTestingChatSettings}
                      className="mac-btn mac-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestingChatSettings ? t('testing') : t('test')}
                    </button>
                  </div>
                )}
                {settingsTab !== 'llm' && (
                  <div />
                )}

                <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="mac-btn mac-btn-ghost"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={async () => {
                    setIsSavingSettings(true)
                    showToast(t('saving'), 'info')
                    try {
                      const body: any = {
                        baseURL: settingsBaseURL,
                        chatModel: settingsChatModel,
                      }
                      if (settingsApiKey) body.apiKey = settingsApiKey
                      const res = await fetch(`${API_URL}/api/settings`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                      })
                      const data = await res.json().catch(() => ({}))
                      if (!res.ok) {
                        showToast(data?.error || t('saveFailed'), 'error')
                        return
                      }

                      const gitRes = await fetch(`${API_URL}/api/git/config`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notesGitRemoteUrl, notesGitBranch })
                      })
                      const gitData = await gitRes.json().catch(() => ({}))
                      if (!gitRes.ok) {
                        showToast(gitData?.error || t('saveFailed'), 'error')
                        return
                      }

                      setSettings(data)
                      setSettingsApiKey('')
                      setNotesGitRemoteUrl(gitData.notesGitRemoteUrl || '')
                      setNotesGitBranch(gitData.notesGitBranch || 'main')
                      showToast(t('saved'), 'success')
                      setShowSettingsModal(false)
                    } catch (err) {
                      console.error(err)
                      showToast(t('saveFailed'), 'error')
                    } finally {
                      setIsSavingSettings(false)
                    }
                  }}
                  disabled={isSavingSettings}
                  className="mac-btn mac-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSavingSettings ? t('saving') : t('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {aiCompareOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="mac-modal mac-glass w-full max-w-6xl h-[80vh] flex flex-col overflow-hidden">
            <div className="mac-toolbar mac-glass justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[var(--sk-focus-color)]" />
                <div className="text-sm font-semibold">{t('aiCompareTitle')}</div>
              </div>
              <button
                onClick={() => {
                  if (abortControllerRef.current) abortControllerRef.current.abort()
                  setAiCompareOpen(false)
                }}
                className="mac-icon-btn"
                title={t('cancel')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 p-4">
              <div className="flex gap-4 h-full">
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="px-1 pb-2 text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                    {t('aiCompareOriginal')}
                  </div>
                  <div className="mac-surface flex-1 min-h-0 overflow-hidden">
                    <div className="h-full overflow-auto p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {aiCompareOriginal}
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="px-1 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                      {t('aiCompareDraft')}
                    </span>
                    {isGeneratingAI && (
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--sk-focus-color)] bg-[var(--sk-focus-color)]/10 px-2 py-0.5 rounded-full">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--sk-focus-color)] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--sk-focus-color)]"></span>
                        </span>
                        {t('generatingAi')}
                      </span>
                    )}
                  </div>
                  <div className="mac-surface flex-1 min-h-0 overflow-hidden relative">
                    <div className="h-full overflow-auto p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {aiCompareDraft}
                      {isGeneratingAI && (
                        <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-[var(--sk-focus-color)] animate-pulse" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--toolbar-bg)] mac-glass flex justify-end gap-3">
              <button
                onClick={() => {
                  if (abortControllerRef.current) abortControllerRef.current.abort()
                  setAiCompareOpen(false)
                }}
                className="mac-btn mac-btn-ghost"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => {
                  if (!activeNote || (aiCompareNoteId && activeNote.id !== aiCompareNoteId)) {
                    showToast(t('aiCompareNoteChanged'), 'warning')
                    setAiCompareOpen(false)
                    return
                  }
                  setActiveNote(prev => prev ? { ...prev, content: aiCompareDraft } : prev)
                  setAiCompareOpen(false)
                  showToast(t('aiCompareApplied'), 'success')
                }}
                disabled={isGeneratingAI}
                className="mac-btn mac-btn-primary disabled:opacity-50"
              >
                {t('aiCompareReplace')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="mac-modal w-full max-w-[320px] bg-[var(--panel-bg-2)] border border-[var(--border)] shadow-2xl p-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <AlertTriangle className="text-red-500" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-[var(--text)] mb-2">{t('deleteConfirmTitle')}</h3>
            <p className="text-[13px] text-[var(--text-secondary)] mb-6 leading-relaxed">
              {t('deleteConfirmDesc')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false)
                  setNoteToDelete(null)
                }}
                className="flex-1 mac-btn mac-btn-secondary"
              >
                {t('cancel')}
              </button>
              <button
                onClick={deleteNote}
                className="flex-1 mac-btn bg-red-500 text-white hover:bg-red-600 border-transparent shadow-sm"
              >
                {t('deleteConfirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteCategoryConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="mac-modal w-full max-w-[320px] bg-[var(--panel-bg-2)] border border-[var(--border)] shadow-2xl p-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <AlertTriangle className="text-red-500" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-[var(--text)] mb-2">{t('deleteCategoryConfirmTitle')}</h3>
            <p className="text-[13px] text-[var(--text-secondary)] mb-6 leading-relaxed">
              {t('deleteCategoryConfirmDesc')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteCategoryConfirmOpen(false)
                  setCategoryToDelete(null)
                }}
                className="flex-1 mac-btn mac-btn-secondary"
              >
                {t('cancel')}
              </button>
              <button
                onClick={deleteCategory}
                className="flex-1 mac-btn bg-red-500 text-white hover:bg-red-600 border-transparent shadow-sm"
              >
                {t('deleteConfirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-2xl text-sm z-[999999] flex items-center gap-3 transition-all animate-in fade-in slide-in-from-bottom-5 ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' :
          toast.type === 'success' ? 'bg-green-500/90 text-white' :
          toast.type === 'warning' ? 'bg-yellow-500/90 text-white' :
          'bg-blue-600/90 text-white'
        }`}>
          {toast.type === 'error' && <AlertTriangle size={18} />}
          {toast.type === 'success' && <CheckCircle size={18} />}
          {toast.type === 'info' && <Info size={18} />}
          {toast.type === 'warning' && <AlertTriangle size={18} />}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

    </div>
  )
}

export default App
