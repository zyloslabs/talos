"use client";

import dynamic from "next/dynamic";

export const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
