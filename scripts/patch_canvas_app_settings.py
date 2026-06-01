from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
lines = (root / "CanvasApp.tsx").read_text(encoding="utf-8").splitlines()

# Remove CANVAS_SHORTCUT_HELP_ROWS block 1161-1182 (1-based)
del lines[1160:1182]

# Remove shortcuts panel 6258-6305 -> after first deletion, line numbers shift
# Original 6258 - 22 = 6236
start = None
for i, line in enumerate(lines):
    if "{showShortcutsPanel && (" in line:
        start = i
        break
if start is None:
    raise SystemExit("shortcuts panel not found")
end = start
while end < len(lines) and "      )}" not in lines[end]:
    end += 1
del lines[start : end + 1]

# Remove settings modal - find comment
start = None
for i, line in enumerate(lines):
    if "Unified Settings Modal" in line:
        start = i - 1 if lines[i - 1].strip() == "" else i
        break
if start is None:
    raise SystemExit("settings modal not found")
end = start
depth = 0
found = False
for j in range(start, len(lines)):
    if "settingsCreditsPwdModal.open && (" in lines[j]:
        found = True
    if found and lines[j].strip() == ")}" :
        end = j
        break
# include credits pwd modal block until closing )}
for j in range(start, len(lines)):
    if lines[j].strip() == ")}" and j > start + 50:
        # might be end of credits modal - look for pattern after settingsCreditsPwdModal
        pass
# simpler: delete from start to line before Fullscreen Image Modal
end = start
for j in range(start, len(lines)):
    if "Fullscreen Image Modal" in lines[j]:
        end = j - 2
        break
del lines[start:end]

text = "\n".join(lines)

# Add imports after CanvasShortcutsPanel path
if "CanvasSettingsModal" not in text:
    text = text.replace(
        "import { CanvasStage } from './canvas/CanvasStage';",
        "import { CanvasStage } from './canvas/CanvasStage';\nimport { CanvasShortcutsPanel } from './canvas/CanvasShortcutsPanel';\nimport { CanvasSettingsModal } from './canvas/CanvasSettingsModal';",
        1,
    )

# Replace shortcuts panel usage
shortcuts_usage = """      <CanvasShortcutsPanel open={showShortcutsPanel} onClose={() => setShowShortcutsPanel(false)} />

"""
if "{showShortcutsPanel && (" not in text:
    # insert before mode switch comment
    marker = "      {/* 模式切换按钮"
    text = text.replace(marker, shortcuts_usage + marker, 1)

# Build settings modal replacement - insert before Fullscreen
settings_block = """      <CanvasSettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        settingsPresetDomainTab={settingsPresetDomainTab}
        setSettingsPresetDomainTab={setSettingsPresetDomainTab}
        settingsPresetCategoryTab={settingsPresetCategoryTab}
        setSettingsPresetCategoryTab={setSettingsPresetCategoryTab}
        settingsT2iPresetCategoryTab={settingsT2iPresetCategoryTab}
        setSettingsT2iPresetCategoryTab={setSettingsT2iPresetCategoryTab}
        settingsPresetAuthSession={settingsPresetAuthSession}
        setSettingsPresetAuthSession={setSettingsPresetAuthSession}
        settingsPresetPwdModal={settingsPresetPwdModal}
        setSettingsPresetPwdModal={setSettingsPresetPwdModal}
        settingsCreditsAuthSession={settingsCreditsAuthSession}
        setSettingsCreditsAuthSession={setSettingsCreditsAuthSession}
        settingsCreditsPwdModal={settingsCreditsPwdModal}
        setSettingsCreditsPwdModal={setSettingsCreditsPwdModal}
        downloadPathSettings={downloadPathSettings}
        setDownloadPathSettings={setDownloadPathSettings}
        downloadDirLabels={downloadDirLabels}
        refreshDownloadDirLabels={refreshDownloadDirLabels}
        creditPricingRows={creditPricingRows}
        setCreditPricingRows={setCreditPricingRows}
        apiKeyInput={apiKeyInput}
        setApiKeyInput={setApiKeyInput}
        aiProvider={aiProvider}
        setAiProvider={setAiProvider}
        openAiBaseInput={openAiBaseInput}
        deepSeekKeyInput={deepSeekKeyInput}
        setDeepSeekKeyInput={setDeepSeekKeyInput}
        deepSeekBaseInput={deepSeekBaseInput}
        junlanBaseInput={junlanBaseInput}
        junlanKeyInput={junlanKeyInput}
        setJunlanKeyInput={setJunlanKeyInput}
        codesonlineBaseInput={codesonlineBaseInput}
        codesonlineKeyInput={codesonlineKeyInput}
        setCodesonlineKeyInput={setCodesonlineKeyInput}
        codesonlineChatKeyInput={codesonlineChatKeyInput}
        setCodesonlineChatKeyInput={setCodesonlineChatKeyInput}
        manxueBaseInput={manxueBaseInput}
        manxueKeyInput={manxueKeyInput}
        setManxueKeyInput={setManxueKeyInput}
        minimaxBaseInput={minimaxBaseInput}
        minimaxKeyInput={minimaxKeyInput}
        setMiniMaxKeyInput={setMiniMaxKeyInput}
        aiidBaseInput={aiidBaseInput}
        aiidKeyInput={aiidKeyInput}
        setAiidKeyInput={setAiidKeyInput}
        promptPresets={promptPresets}
        setPromptPresets={setPromptPresets}
        promptPresetDomainOverrides={promptPresetDomainOverrides}
        setPromptPresetDomainOverrides={setPromptPresetDomainOverrides}
        promptPresetCategoryOverrides={promptPresetCategoryOverrides}
        setPromptPresetCategoryOverrides={setPromptPresetCategoryOverrides}
        canvasBgStyle={canvasBgStyle}
        setCanvasBgStyle={setCanvasBgStyle}
        canvasBgColor={canvasBgColor}
        setCanvasBgColor={setCanvasBgColor}
        executePresetCopy={executePresetCopy}
        executePresetAdd={executePresetAdd}
        executePresetRename={executePresetRename}
        executePresetDelete={executePresetDelete}
        confirmSettingsPresetPassword={confirmSettingsPresetPassword}
        confirmSettingsCreditsPassword={confirmSettingsCreditsPassword}
      />

"""

marker = "      {/* Fullscreen Image Modal */}"
if marker in text and "CanvasSettingsModal" in text and "<CanvasSettingsModal" not in text:
    text = text.replace(marker, settings_block + marker, 1)

# Remove SettingsPresetPwdIntent type from CanvasApp if present
text = text.replace(
    """type SettingsPresetPwdIntent =
  | { type: 'copy'; content: string }
  | { type: 'rename'; name: string }
  | { type: 'delete'; name: string }
  | { type: 'add' };


""",
    "",
)

(root / "CanvasApp.tsx").write_text(text + "\n", encoding="utf-8")
print("patched CanvasApp", len(text.splitlines()), "lines")
