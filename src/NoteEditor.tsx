import { useEffect, useState, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

export default function NoteEditor({ content, onChange, theme }: { content: string, onChange: (content: string) => void, theme: 'light' | 'dark' }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const editor = useCreateBlockNote();
  const lastContentRef = useRef(content);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const blocks = await editor.tryParseMarkdownToBlocks(content || "");
      if (isMounted) {
        editor.replaceBlocks(editor.document, blocks);
        setIsLoaded(true);
        lastContentRef.current = content;
      }
    }
    load();
    return () => { isMounted = false; };
  }, [editor]); // Load initially

  // Listen for external content changes (e.g., AI replace)
  useEffect(() => {
    if (isLoaded && content !== lastContentRef.current) {
      async function updateExternal() {
        const blocks = await editor.tryParseMarkdownToBlocks(content || "");
        editor.replaceBlocks(editor.document, blocks);
        lastContentRef.current = content;
      }
      updateExternal();
    }
  }, [content, isLoaded, editor]);

  if (!isLoaded) return null;

  return (
    <div className="h-full w-full overflow-auto">
      <div className="min-h-full py-10 px-4 max-w-5xl mx-auto">
        <BlockNoteView
          editor={editor}
          theme={theme}
          onChange={async () => {
            const md = await editor.blocksToMarkdownLossy(editor.document);
            lastContentRef.current = md;
            onChange(md);
          }}
        />
      </div>
    </div>
  );
}
