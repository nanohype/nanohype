import { useEffect, useState } from "react";
import type { Settings } from "@/lib/storage";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "@/lib/storage";
import { saveGatewaySettings } from "./save";

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((err) => {
        // Nothing holds this promise, and the options page is the only place a
        // user can repair their settings — so a storage read that fails keeps
        // the defaults on screen and says why, rather than rejecting into
        // nowhere and leaving a page that never populates.
        console.error("Could not load settings", err);
        setProblem(
          `The saved settings could not be loaded: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }, []);

  const handleSave = async () => {
    setProblem("");
    const outcome = await saveGatewaySettings(settings, {
      requestOrigin: (origin) => chrome.permissions.request({ origins: [origin] }),
      saveSettings,
    });
    if ("problem" in outcome) {
      setProblem(outcome.problem);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--input-border)",
    background: "var(--input)",
    color: "var(--foreground)",
    fontSize: "13px",
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
        Model gateway endpoint
        <input
          type="url"
          value={settings.endpoint}
          onChange={(e) => setSettings((prev) => ({ ...prev, endpoint: e.target.value }))}
          placeholder="http://localhost:8080"
          style={fieldStyle}
        />
      </label>

      <label style={labelStyle}>
        Route
        <input
          type="text"
          value={settings.route}
          onChange={(e) => setSettings((prev) => ({ ...prev, route: e.target.value }))}
          placeholder={DEFAULT_SETTINGS.route}
          style={fieldStyle}
        />
      </label>

      {problem ? (
        <p role="alert" style={{ ...labelStyle, color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}

      <button
        type="button"
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
          transition: "filter 0.15s var(--ease-out), transform 0.1s var(--ease-spring)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.15)")}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "brightness(1)";
          e.currentTarget.style.transform = "scale(1)";
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
