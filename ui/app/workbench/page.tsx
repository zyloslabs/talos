"use client";

import { useState, useCallback, useRef } from "react";
import { NavTabs } from "@/components/talos/nav-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileEdit, Eye, Save, FileText, FolderOpen } from "lucide-react";

export default function WorkbenchPage() {
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("untitled.md");
  const [activeTab, setActiveTab] = useState("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [content, filename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newContent = content.substring(0, start) + "  " + content.substring(end);
      setContent(newContent);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }, [content, handleSave]);

  const handleFileOpen = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.txt,.json,.yaml,.yml,.csv";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setFilename(file.name);
      const reader = new FileReader();
      reader.onload = () => setContent(reader.result as string);
      reader.readAsText(file);
    };
    input.click();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <NavTabs />
      <main className="flex-1 container py-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileEdit className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Workbench</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleFileOpen}>
              <FolderOpen className="h-4 w-4 mr-1" />Open
            </Button>
            <Button variant="outline" size="sm" onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" />{saved ? "Saved!" : "Save"}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <input
            className="text-sm font-mono bg-transparent border-b border-dashed focus:border-primary outline-none px-1 py-0.5"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          />
          <span className="text-xs text-muted-foreground ml-auto">
            {content.split("\n").length} lines | {content.length} chars
          </span>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="mb-2">
            <TabsTrigger value="edit"><FileEdit className="h-4 w-4 mr-1" />Edit</TabsTrigger>
            <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-1" />Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="flex-1">
            <textarea
              ref={textareaRef}
              className="w-full h-full min-h-[500px] p-4 border rounded font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Start writing... (Ctrl/Cmd+S to save, Tab for indent)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
          </TabsContent>

          <TabsContent value="preview" className="flex-1">
            <Card className="min-h-[500px]">
              <CardContent className="prose prose-sm dark:prose-invert max-w-none pt-6">
                <MarkdownPreview content={content} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  if (!content) {
    return <p className="text-muted-foreground italic">Nothing to preview. Start typing in the editor.</p>;
  }

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${codeKey++}`} className="bg-muted p-3 rounded text-xs overflow-x-auto">
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-2xl font-bold mt-4 mb-2">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-xl font-bold mt-3 mb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-lg font-semibold mt-2 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(<li key={i} className="ml-4">{line.slice(2)}</li>);
    } else if (line.startsWith("> ")) {
      elements.push(<blockquote key={i} className="border-l-4 border-muted-foreground/30 pl-3 italic text-muted-foreground">{line.slice(2)}</blockquote>);
    } else if (line.startsWith("---")) {
      elements.push(<hr key={i} className="my-4" />);
    } else if (line.trim() === "") {
      elements.push(<br key={i} />);
    } else {
      elements.push(<p key={i}>{line}</p>);
    }
  }

  if (inCodeBlock && codeLines.length > 0) {
    elements.push(
      <pre key={`code-${codeKey}`} className="bg-muted p-3 rounded text-xs overflow-x-auto">
        <code>{codeLines.join("\n")}</code>
      </pre>
    );
  }

  return <>{elements}</>;
}
