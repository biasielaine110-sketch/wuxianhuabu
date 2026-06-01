from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
path = root / "CanvasApp.tsx"
lines = path.read_text(encoding="utf-8").splitlines()

def find_line(sub: str, start=0) -> int:
    for i in range(start, len(lines)):
        if sub in lines[i]:
            return i
    raise SystemExit(f"not found: {sub!r}")

# Remove unified settings block
s = find_line("// Unified Settings (API + Presets)")
e = find_line("saveCreditPricingRows(creditPricingRows);", s)
# include closing }, [creditPricingRows]); and blank line
while e < len(lines) and "}, [creditPricingRows]);" not in lines[e]:
    e += 1
del lines[s : e + 2]

# Remove prompt category overrides + preset handlers + escape effects
s = find_line("/** 设置里对预设")
e = find_line("}, [settingsCreditsPwdModal.open]);", s)
del lines[s : e + 1]

# Insert hook call after loadChatPromptPresets effect
insert_at = find_line("void loadChatPromptPresets().then")
while insert_at < len(lines) and lines[insert_at].strip() != "}, []);":
    insert_at += 1
insert_at += 2  # after blank line following effect

hook_block = [
    "",
    "  const {",
    "    showSettingsModal,",
    "    setShowSettingsModal,",
    "    settingsTab,",
    "    setSettingsTab,",
    "    promptPresetDomainOverrides,",
    "    promptPresetCategoryOverrides,",
    "    settingsModalProps,",
    "  } = useCanvasSettingsPanelState({",
    "    promptPresets,",
    "    setPromptPresets,",
    "    canvasBgStyle,",
    "    setCanvasBgStyle,",
    "    canvasBgColor,",
    "    setCanvasBgColor,",
    "  });",
]
lines[insert_at:insert_at] = hook_block

text = "\n".join(lines)

# Imports
text = text.replace(
    "import { CanvasSettingsModal } from './canvas/CanvasSettingsModal';",
    "import { useCanvasSettingsPanelState } from './canvas/useCanvasSettingsPanelState';",
    1,
)

if "CanvasSettingsModalLazy" not in text:
    text = text.replace(
        "const VideoNodeSettingsPanel = lazy(() =>",
        "const CanvasSettingsModalLazy = lazy(() =>\n"
        "  import('./canvas/CanvasSettingsModal').then((m) => ({ default: m.CanvasSettingsModal }))\n"
        ");\n"
        "const VideoNodeSettingsPanel = lazy(() =>",
        1,
    )

# Replace verbose CanvasSettingsModal props with spread
start = text.find("      <CanvasSettingsModal\n")
if start == -1:
    raise SystemExit("CanvasSettingsModal JSX not found")
end = text.find("      />\n", start)
if end == -1:
    raise SystemExit("CanvasSettingsModal closing not found")
end += len("      />\n")
replacement = """      {showSettingsModal ? (
        <Suspense fallback={null}>
          <CanvasSettingsModalLazy
            open
            onClose={() => setShowSettingsModal(false)}
            {...settingsModalProps}
          />
        </Suspense>
      ) : null}

"""
text = text[:start] + replacement + text[end:]

# Remove PRESET_SETTINGS_GUARD_PASSWORD if unused
if "PRESET_SETTINGS_GUARD_PASSWORD" not in text.split("const PRESET_SETTINGS_GUARD_PASSWORD")[1:]:
    text = text.replace("const PRESET_SETTINGS_GUARD_PASSWORD = 'zhangbiwen666';\n\n", "")

path.write_text(text + "\n", encoding="utf-8")
print("patched", path.name, len(text.splitlines()), "lines")
