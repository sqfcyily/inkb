import { useEffect, useRef, useState } from "react";
import { 
  EditorRoot, 
  EditorContent, 
  EditorCommand, 
  EditorCommandItem, 
  EditorCommandEmpty, 
  EditorCommandList,
  Command,
  renderItems,
  createSuggestionItems
} from "novel";
import { Markdown } from "tiptap-markdown";
import StarterKit from "@tiptap/starter-kit";

const suggestionItems = createSuggestionItems([
  {
    title: "Heading 1",
    description: "Big section heading.",
    searchTerms: ["title", "big", "large"],
    icon: <div className="text-sm font-bold w-6 h-6 flex items-center justify-center border rounded">H1</div>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading.",
    searchTerms: ["subtitle", "medium"],
    icon: <div className="text-sm font-bold w-6 h-6 flex items-center justify-center border rounded">H2</div>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading.",
    searchTerms: ["subtitle", "small"],
    icon: <div className="text-sm font-bold w-6 h-6 flex items-center justify-center border rounded">H3</div>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Text",
    description: "Just start typing with plain text.",
    searchTerms: ["p", "paragraph"],
    icon: <div className="text-sm font-bold w-6 h-6 flex items-center justify-center border rounded">P</div>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleNode("paragraph", "paragraph").run();
    },
  },
  {
    title: "Bullet List",
    description: "Create a simple bulleted list.",
    searchTerms: ["unordered", "point"],
    icon: <div className="text-sm font-bold w-6 h-6 flex items-center justify-center border rounded">•</div>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a list with numbering.",
    searchTerms: ["ordered"],
    icon: <div className="text-sm font-bold w-6 h-6 flex items-center justify-center border rounded">1.</div>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Quote",
    description: "Capture a quote.",
    searchTerms: ["blockquote"],
    icon: <div className="text-sm font-bold w-6 h-6 flex items-center justify-center border rounded">"</div>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Code",
    description: "Capture a code snippet.",
    searchTerms: ["codeblock"],
    icon: <div className="text-sm font-bold w-6 h-6 flex items-center justify-center border rounded">&lt;/&gt;</div>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  }
]);

const slashCommand = Command.configure({
  suggestion: {
    items: () => suggestionItems,
    render: renderItems,
  },
});

export default function NoteEditor({ content, onChange, theme }: { content: string, onChange: (content: string) => void, theme: 'light' | 'dark' }) {
  const lastContentRef = useRef(content);
  const [editor, setEditor] = useState<any>(null);

  useEffect(() => {
    if (editor && content !== lastContentRef.current) {
      editor.commands.setContent(content);
      lastContentRef.current = content;
    }
  }, [content, editor]);

  return (
    <div className={`h-full w-full overflow-auto ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="min-h-full py-10 px-4 max-w-5xl mx-auto">
        <EditorRoot>
          <EditorContent
            initialContent={content as any}
            extensions={[StarterKit, slashCommand, Markdown] as any}
            onUpdate={({ editor }) => {
              const md = editor.storage.markdown.getMarkdown();
              lastContentRef.current = md;
              onChange(md);
            }}
            onCreate={({ editor }) => {
              setEditor(editor);
            }}
            className="w-full min-h-[500px] prose dark:prose-invert max-w-none focus:outline-none"
          >
            <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 px-1 py-2 shadow-md transition-all">
              <EditorCommandEmpty className="px-2 text-gray-500">No results</EditorCommandEmpty>
              <EditorCommandList>
                {suggestionItems.map((item) => (
                  <EditorCommandItem
                    value={item.title}
                    onCommand={(val) => item.command?.(val)}
                    className="flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-700 cursor-pointer"
                    key={item.title}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      {item.icon}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                    </div>
                  </EditorCommandItem>
                ))}
              </EditorCommandList>
            </EditorCommand>
          </EditorContent>
        </EditorRoot>
      </div>
    </div>
  );
}
