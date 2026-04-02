import { useState, useEffect } from "react";
import { getSettings, saveSettings } from "@/lib/storage";
import type { LlmProvider, Settings } from "@/lib/storage";

const MODELS: Record<LlmProvider, string[]> = {
  anthropic: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
  openai: ["gpt-4o", "gpt-4o-mini"],
};

export function App() {
  const [settings, setSettings] = useState<Settings>({
    apiKey: "",
    provider: "__LLM_PROVIDER__" as LlmProvider,
    model: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleProviderChange = (provider: LlmProvider) => {
    setSettings((prev) => ({
      ...prev,
      provider,
      model: MODELS[provider][0],
    }));
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--input-border)",
    background: "var(--input)",
    color: "var(--foreground)",
    fontSize: "13px",
    outline: "none",
    marginTop: "4px",
    transition: "border-color 0.15s var(--ease-out)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "16px",
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--muted-foreground)",
  };

  return (
    <div>
      <h1
        style={{
          fontSize: "18px",
          marginBottom: "20px",
          color: "var(--foreground)",
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}
      >
        __EXTENSION_NAME__ Settings
      </h1>

      <label style={labelStyle}>
        LLM Provider
        <select
          value={settings.provider}
          onChange={(e) => handleProviderChange(e.target.value as LlmProvider)}
          style={fieldStyle}
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>

      <label style={labelStyle}>
        API Key
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, apiKey: e.target.value }))
          }
          placeholder={
            settings.provider === "anthropic"
              ? "sk-ant-..."
              : "sk-..."
          }
          style={fieldStyle}
        />
      </label>

      <label style={labelStyle}>
        Model
        <select
          value={settings.model}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, model: e.target.value }))
          }
          style={fieldStyle}
        >
          {MODELS[settings.provider].map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>

      <button
        onClick={handleSave}
        style={{
          padding: "8px 24px",
          borderRadius: "6px",
          border: "none",
          background: saved ? "var(--success)" : "var(--accent)",
          color: "var(--accent-foreground)",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          transition:
            "filter 0.15s var(--ease-out), transform 0.1s var(--ease-spring)",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.filter = "brightness(1.15)")
        }
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "brightness(1)";
          e.currentTarget.style.transform = "scale(1)";
        }}
        onMouseDown={(e) =>
          (e.currentTarget.style.transform = "scale(0.96)")
        }
        onMouseUp={(e) =>
          (e.currentTarget.style.transform = "scale(1)")
        }
      >
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
