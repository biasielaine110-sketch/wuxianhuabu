from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
lines = (root / "CanvasApp.tsx").read_text(encoding="utf-8").splitlines()

catalog = lines[797:989]
catalog_body = "\n".join(catalog)
replacements = [
    ("type I2iPresetCategoryId", "export type I2iPresetCategoryId"),
    ("type T2iPresetCategoryId", "export type T2iPresetCategoryId"),
    ("const I2I_PRESET_CATEGORY_OPTIONS", "export const I2I_PRESET_CATEGORY_OPTIONS"),
    ("const COMMON_TEMPLATE_KEY", "export const COMMON_TEMPLATE_KEY"),
    ("const T2I_PRESET_CATEGORY_OPTIONS", "export const T2I_PRESET_CATEGORY_OPTIONS"),
    ("const I2I_PRESETS_BY_CATEGORY", "export const I2I_PRESETS_BY_CATEGORY"),
    ("const I2I_PRESET_FLAT", "export const I2I_PRESET_FLAT"),
    ("const T2I_PRESETS_BY_CATEGORY", "export const T2I_PRESETS_BY_CATEGORY"),
    ("const T2I_PRESET_FLAT", "export const T2I_PRESET_FLAT"),
    ("function t2iCategoryForPreset", "export function t2iCategoryForPreset"),
    ("function i2iCategoryForPreset", "export function i2iCategoryForPreset"),
    ("function settingsPresetCategory", "export function settingsPresetCategory"),
    ("const PRESET_DOMAIN_TAB_OPTIONS", "export const PRESET_DOMAIN_TAB_OPTIONS"),
    ("const DEFAULT_CHAT_PRESET_KEYS", "export const DEFAULT_CHAT_PRESET_KEYS"),
    ("const DEFAULT_T2I_PRESET_KEYS", "export const DEFAULT_T2I_PRESET_KEYS"),
    ("const DEFAULT_I2I_PRESET_KEYS", "export const DEFAULT_I2I_PRESET_KEYS"),
    ("function defaultPresetDomain", "export function defaultPresetDomain"),
    ("function settingsPresetDomain", "export function settingsPresetDomain"),
    ("function i2iPresetListForCategory", "export function i2iPresetListForCategory"),
    ("const STORYBOARD_PRESET_KEYS", "export const STORYBOARD_PRESET_KEYS"),
    ("function isStoryboardPreset", "export function isStoryboardPreset"),
    ("function t2iPresetListForCategory", "export function t2iPresetListForCategory"),
]
for old, new in replacements:
    catalog_body = catalog_body.replace(old, new, 1)

# Drop local PresetDomainId type — imported from canvasNodeRenderState
out_lines = []
skip = False
for line in catalog_body.splitlines():
    if line.strip().startswith("type PresetDomainId"):
        skip = True
        continue
    if skip:
        if line.strip() == "];":
            skip = False
        continue
    out_lines.append(line)

catalog_header = (
    "import type { PresetDomainId, I2iPresetCategoryId } from './canvasNodeRenderState';\n\n"
    "export type T2iPresetCategoryId = 'storyboard';\n\n"
)
(root / "canvas" / "promptPresetCatalog.ts").write_text(
    catalog_header + "\n".join(out_lines) + "\n", encoding="utf-8"
)

i2i = lines[1222:1351]
i2i_text = "\n".join(i2i).replace(
    "function I2iPresetCategorySelect", "export function I2iPresetCategorySelect"
)
i2i_header = """import React from 'react';
import type { PresetDomainId, I2iPresetCategoryId } from './canvasNodeRenderState';
import {
  COMMON_TEMPLATE_KEY,
  I2I_PRESET_CATEGORY_OPTIONS,
  I2I_PRESET_FLAT,
  i2iPresetListForCategory,
  settingsPresetCategory,
} from './promptPresetCatalog';

"""
(root / "canvas" / "I2iPresetCategorySelect.tsx").write_text(i2i_header + i2i_text + "\n", encoding="utf-8")

t2i = lines[1352:1479]
t2i_text = "\n".join(t2i).replace(
    "function T2iPresetCategorySelect", "export function T2iPresetCategorySelect"
)
t2i_header = """import React from 'react';
import type { PresetDomainId } from './canvasNodeRenderState';
import {
  COMMON_TEMPLATE_KEY,
  T2I_PRESET_CATEGORY_OPTIONS,
  T2I_PRESET_FLAT,
  T2iPresetCategoryId,
  t2iCategoryForPreset,
  t2iPresetListForCategory,
} from './promptPresetCatalog';

"""
(root / "canvas" / "T2iPresetCategorySelect.tsx").write_text(t2i_header + t2i_text + "\n", encoding="utf-8")
print("extracted preset modules")
