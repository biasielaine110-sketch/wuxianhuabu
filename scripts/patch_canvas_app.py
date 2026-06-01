from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
lines = (root / "CanvasApp.tsx").read_text(encoding="utf-8").splitlines()

# 1-based inclusive ranges to delete (process bottom-up)
ranges = [
    (6284, 7027),  # renderNode
    (1593, 1606),  # isGpt* helpers
    (1223, 1479),  # preset select components
    (798, 989),    # preset catalog
]

for start, end in ranges:
    del lines[start - 1 : end]

text = "\n".join(lines)

# Add imports after canvasNodeRenderState import block
insert_marker = "import type { CanvasNodeRenderState } from './canvas/canvasNodeRenderState';"
if insert_marker not in text:
    raise SystemExit("marker not found")

insert_block = """import type { CanvasNodeRenderState } from './canvas/canvasNodeRenderState';
import { renderCanvasNode } from './canvas/renderCanvasNode';
import { useSyncRenderStateOverlay } from './canvas/useSyncRenderStateOverlay';
import {
  COMMON_TEMPLATE_KEY,
  PRESET_DOMAIN_TAB_OPTIONS,
  I2I_PRESET_CATEGORY_OPTIONS,
  T2I_PRESET_CATEGORY_OPTIONS,
  settingsPresetDomain,
  settingsPresetCategory,
  i2iPresetListForCategory,
  t2iPresetListForCategory,
  defaultPresetDomain,
} from './canvas/promptPresetCatalog';
import type { T2iPresetCategoryId } from './canvas/promptPresetCatalog';
import {
  isGptImage2CanvasModelId,
  isManxueGeminiImageModel,
  isManxueGptImage2Model,
} from './canvas/canvasModelUtils';"""

text = text.replace(insert_marker, insert_block, 1)

# Replace renderStateOverlayRef pattern
old_overlay = "  const renderStateOverlayRef = useRef<Partial<CanvasNodeRenderState>>({});"
new_overlay = "  const renderStateOverlayRef = useSyncRenderStateOverlay(() => ({"
if old_overlay not in text:
    raise SystemExit("overlay ref not found")

text = text.replace(old_overlay, new_overlay, 1)

old_assign = "  renderStateOverlayRef.current = {"
new_assign_end = "  }));"
if old_assign not in text:
    raise SystemExit("overlay assign not found")

# Find assignment block and change closing
idx = text.index(old_assign)
# replace first line
text = text[:idx] + old_assign.replace(".current = ", " ") + text[idx + len(old_assign) :]
# find matching closing `};` before handleSendMessageRef
close_marker = "\n\n  const handleSendMessageRef"
close_idx = text.index(close_marker)
# walk back to find `  };` before handleSendMessageRef
segment = text[:close_idx]
last_close = segment.rfind("  };")
if last_close == -1:
    raise SystemExit("close not found")
text = text[:last_close] + "  }));" + text[last_close + 5 :]

# Replace renderNode definition
render_start = "  const renderNode = (node: CanvasNode) => {"
render_end = "  const stableRenderNode = useCallback((node: CanvasNode) => renderNodeRef.current(node), []);"

if render_start in text:
    rs = text.index(render_start)
    re = text.index(render_end) + len(render_end)
    replacement = """  const renderNode = (node: CanvasNode) =>
    renderCanvasNode(node, renderCanvasNodeStateRef.current);
  renderNodeRef.current = renderNode;
  const stableRenderNode = useCallback((node: CanvasNode) => renderNodeRef.current(node), []);"""
    text = text[:rs] + replacement + text[re:]

# Add nodesRef/edgesRef to overlay if missing
if "nodesRef," not in text.split("renderStateOverlayRef")[1].split("}));")[0]:
    text = text.replace(
        "    canvasViewportRef,\n    beginNodeResize,",
        "    canvasViewportRef,\n    nodesRef,\n    edgesRef,\n    beginNodeResize,",
        1,
    )

(root / "CanvasApp.tsx").write_text(text + "\n", encoding="utf-8")
print("patched CanvasApp.tsx", len(text.splitlines()), "lines")
