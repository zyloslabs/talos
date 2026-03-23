"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineModelPicker } from "@/components/talos/inline-model-picker";
import { generateTest, getApplications, type TalosApplication, type GeneratedTest } from "@/lib/api";
import { Wand2, X, Loader2, Check, RotateCcw } from "lucide-react";

type WizardStep = "describe" | "configure" | "generating" | "review";

export interface GenerateTestDialogProps {
  applicationId?: string;
  open: boolean;
  onClose: () => void;
  onAccept?: (test: GeneratedTest) => void;
}

export function GenerateTestDialog({ applicationId, open, onClose, onAccept }: GenerateTestDialogProps) {
  const [step, setStep] = useState<WizardStep>("describe");
  const [prompt, setPrompt] = useState("");
  const [selectedApp, setSelectedApp] = useState(applicationId ?? "");
  const [model, setModel] = useState("");
  const [testType, setTestType] = useState("e2e");
  const [generated, setGenerated] = useState<GeneratedTest | null>(null);

  const { data: apps } = useQuery({ queryKey: ["applications"], queryFn: getApplications });

  const genMutation = useMutation({
    mutationFn: () => generateTest({ applicationId: selectedApp, prompt, model: model || undefined, testType }),
    onSuccess: (data) => { setGenerated(data); setStep("review"); },
    onError: () => setStep("configure"),
  });

  const handleGenerate = () => {
    setStep("generating");
    genMutation.mutate();
  };

  const handleAccept = () => {
    if (generated && onAccept) onAccept(generated);
    onClose();
  };

  const handleReset = () => {
    setStep("describe");
    setPrompt("");
    setGenerated(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Generate Test with AI</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {/* Step Indicator */}
        <div className="flex gap-2 p-4 border-b">
          {(["describe", "configure", "generating", "review"] as WizardStep[]).map((s, i) => (
            <div key={s} className={`flex items-center gap-1 text-xs ${step === s ? "text-primary font-medium" : "text-muted-foreground"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${step === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {i + 1}
              </span>
              <span className="capitalize">{s}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {step === "describe" && (
            <>
              <div>
                <label className="text-sm font-medium">What would you like to test?</label>
                <textarea
                  className="w-full min-h-[120px] mt-2 p-3 border rounded-md text-sm bg-background"
                  placeholder="Describe the test scenario in natural language..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep("configure")} disabled={!prompt.trim()}>Next</Button>
              </div>
            </>
          )}

          {step === "configure" && (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Application</label>
                  <select
                    className="w-full mt-1 p-2 border rounded text-sm bg-background"
                    value={selectedApp}
                    onChange={(e) => setSelectedApp(e.target.value)}
                  >
                    <option value="">Select application...</option>
                    {(apps as TalosApplication[] | undefined)?.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Test Type</label>
                  <div className="flex gap-2 mt-1">
                    {["e2e", "smoke", "regression", "accessibility"].map((t) => (
                      <Button key={t} size="sm" variant={testType === t ? "default" : "outline"} onClick={() => setTestType(t)}>
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Model</label>
                  <div className="mt-1">
                    <InlineModelPicker value={model} onChange={setModel} />
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep("describe")}>Back</Button>
                <Button onClick={handleGenerate} disabled={!selectedApp}>Generate</Button>
              </div>
            </>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating test code...</p>
              <p className="text-xs text-muted-foreground">This may take a moment</p>
            </div>
          )}

          {step === "review" && generated && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{generated.name}</h3>
                  <span className="text-xs text-muted-foreground">Confidence: {Math.round(generated.confidence * 100)}%</span>
                </div>
                <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
                  {generated.code}
                </pre>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={handleReset}>
                  <RotateCcw className="h-3 w-3 mr-1" />Start Over
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>Reject</Button>
                  <Button onClick={handleAccept}>
                    <Check className="h-3 w-3 mr-1" />Accept
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
