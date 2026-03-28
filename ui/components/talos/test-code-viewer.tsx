"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type * as monaco from "monaco-editor";
import { Loader2, Pencil, Save, X, Code } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MonacoEditor } from "@/components/talos/lazy-monaco";
import { useMonacoTheme } from "@/lib/monaco";

interface TestCodeViewerProps {
  testId: string;
  code: string;
  readOnly?: boolean;
  height?: string;
  onSave?: (code: string) => void;
  onSelectionChange?: (selectedCode: string) => void;
}

export function TestCodeViewer({
  code,
  readOnly = true,
  height = "400px",
  onSave,
  onSelectionChange,
}: TestCodeViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentCode, setCurrentCode] = useState(code);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoTheme = useMonacoTheme();

  // Keep currentCode in sync when the code prop changes from outside
  useEffect(() => {
    if (!isEditing) {
      setCurrentCode(code);
    }
  }, [code, isEditing]);

  const lineCount = currentCode.split("\n").length;

  const handleEditorDidMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => {
      editorRef.current = editor;

      // Cmd+S / Ctrl+S shortcut to save
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        if (isEditing && onSave) {
          onSave(editor.getValue());
          setIsEditing(false);
        }
      });

      // Selection change
      editor.onDidChangeCursorSelection(() => {
        const selection = editor.getSelection();
        if (!selection || selection.isEmpty()) {
          onSelectionChange?.("");
          return;
        }
        const model = editor.getModel();
        if (model) {
          const selectedText = model.getValueInRange(selection);
          onSelectionChange?.(selectedText);
        }
      });
    },
    [isEditing, onSave, onSelectionChange]
  );

  const handleSave = () => {
    if (onSave) {
      onSave(currentCode);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setCurrentCode(code);
    setIsEditing(false);
  };

  const isReadOnly = readOnly && !isEditing;

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b px-4 py-2 space-y-0">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="font-mono text-xs">
            typescript
          </Badge>
          <span className="text-xs text-muted-foreground">{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button size="sm" className="h-7 bg-green-600 hover:bg-green-700 text-white" onClick={handleSave}>
                <Save className="mr-1 h-3 w-3" />
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={handleCancel}>
                <X className="mr-1 h-3 w-3" />
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setIsEditing(true)}>
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <MonacoEditor
          height={height}
          defaultLanguage="typescript"
          value={currentCode}
          theme={monacoTheme}
          onChange={(value) => setCurrentCode(value ?? "")}
          onMount={handleEditorDidMount}
          options={{
            readOnly: isReadOnly,
            minimap: { enabled: false },
            wordWrap: "on",
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: "on",
            padding: { top: 8, bottom: 8 },
          }}
          loading={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}
