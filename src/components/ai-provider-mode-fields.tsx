"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AI_PROVIDER_MODE_OPTIONS,
  aiProviderModeOption,
  type AiProviderMode,
} from "@/lib/ai-providers/adapters";

type AIProviderModeFieldsProps = {
  defaultBaseUrl?: string;
  defaultModel?: string;
  defaultProvider?: string;
  defaultSupportsPdfInput?: boolean;
  defaultSupportsVisionImages?: boolean;
  idPrefix: string;
};

function knownProviderMode(value: string | undefined): AiProviderMode {
  const normalized = value?.trim() as AiProviderMode | undefined;

  return AI_PROVIDER_MODE_OPTIONS.some((option) => option.mode === normalized)
    ? normalized!
    : "openai_compatible";
}

function CapabilityCheckbox({
  checked,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="size-4 rounded border"
      />
      {label}
    </label>
  );
}

export function AIProviderModeFields({
  defaultBaseUrl,
  defaultModel,
  defaultProvider,
  defaultSupportsPdfInput,
  defaultSupportsVisionImages,
  idPrefix,
}: AIProviderModeFieldsProps) {
  const initialMode = knownProviderMode(defaultProvider);
  const initialOption = aiProviderModeOption(initialMode);
  const [mode, setMode] = useState<AiProviderMode>(initialMode);
  const [supportsPdfInput, setSupportsPdfInput] = useState(
    defaultSupportsPdfInput ?? initialOption.supportsPdfInput,
  );
  const [supportsVisionImages, setSupportsVisionImages] = useState(
    defaultSupportsVisionImages ?? initialOption.supportsVisionImages,
  );
  const [pdfTouched, setPdfTouched] = useState(false);
  const [visionTouched, setVisionTouched] = useState(false);
  const selectedOption = aiProviderModeOption(mode);

  function selectMode(value: string) {
    const nextMode = knownProviderMode(value);
    const nextOption = aiProviderModeOption(nextMode);

    setMode(nextMode);

    if (!pdfTouched) {
      setSupportsPdfInput(nextOption.supportsPdfInput);
    }

    if (!visionTouched) {
      setSupportsVisionImages(nextOption.supportsVisionImages);
    }
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}_provider`}>Provider type / API mode</Label>
        <select
          id={`${idPrefix}_provider`}
          name="provider"
          value={mode}
          onChange={(event) => selectMode(event.currentTarget.value)}
          required
          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {AI_PROVIDER_MODE_OPTIONS.map((option) => (
            <option key={option.mode} value={option.mode}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}_base_url`}>Base URL</Label>
        <Input
          id={`${idPrefix}_base_url`}
          name="base_url"
          defaultValue={defaultBaseUrl}
          placeholder={selectedOption.baseUrlPlaceholder}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}_model`}>Model</Label>
        <Input
          id={`${idPrefix}_model`}
          name="model"
          defaultValue={defaultModel}
          placeholder={selectedOption.modelPlaceholder}
          required
        />
      </div>

      <div className="flex flex-wrap gap-4 md:col-span-2">
        <CapabilityCheckbox
          name="supports_pdf_input"
          label="Supports native/full PDF input"
          checked={supportsPdfInput}
          onChange={(checked) => {
            setPdfTouched(true);
            setSupportsPdfInput(checked);
          }}
        />
        <CapabilityCheckbox
          name="supports_vision_images"
          label="Supports page images / vision"
          checked={supportsVisionImages}
          onChange={(checked) => {
            setVisionTouched(true);
            setSupportsVisionImages(checked);
          }}
        />
      </div>
    </>
  );
}
