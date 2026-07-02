/** 画布内置预设（图生图 / 文生图）；AI 对话模板通过 loadChatPromptPresets 异步合并 */
export const INITIAL_I2I_PROMPT_PRESETS: Record<string, string> = {
  '角色4视图':
    '电影级古风写实摄影、ARRI Alexa 65实拍、中式古典美学、真实物理材质、自然光影，一张2x2的四宫格人物设定图。左上角：从头到脚完整全身的正面站立；右上角：从头到脚完整全身的侧面站立；左下角：从头到脚完整全身的背面站立；右下角：面部特写。所有视角的人物发型、服装细节和配饰必须保持绝对一致。纯白背景，无多余杂物。皮肤毛孔细节、胶片颗粒感、非CG、Raw photo、极致高清8K。 --ar 9:16',
  '场景四视图':
    '根据参考图直接生成2x2场景宫格图，图 1 (左上，主视图)：呈现完整的 [环境背景]，[核心主体] 位于其中，光影和透视角度尽可能还原用户提供的参考图。图 2 (右上，正面聚焦视图)：调整为更正面的透视角度，拉近并聚焦于 [核心主体]，展现空间深度。图 3 (左下，高处俯视透视图)：高角度的透视图，从上方斜看 [核心主体] 和周围的地面/环境。图 4 (右下，正交平面顶视图)：完美的垂直正上方的正交平面图，展示 [核心主体] 在地面上的精确形状和位置，完全消除透视变形。一致性与限制要求（绝对强制）：四个视角必须在同一张图片中生成。必须与原图保持绝对统一的 [艺术风格]、[光影类型]、材质纹理和物体特征。每个宫格标注1-4的数字。严禁在画面中生成任何其他字母、对话、指示线或多余的 UI 标记。',
  '角色6视图':
    '主体为真实照片风格角色设定图，白色背景，画面分为两部分：画面左侧-三张全身视图，依次为人物站立正面、侧面、背面（严格参考图片形象，禁止照搬原图动作）；画面右侧-四张多角度面部特写：依次为-正脸：-3/4左侧脸-3/4右侧脸-头部背面。并且在每张面部特写以半透明水印加大标注"虚拟模型面部(方向)"：保持好角色本体的现有特征，例如脸型、发色、身材等归属于人体特征的内容。图片风格为真人照片质感，禁止转绘为漫画或其它风格。',
  '角色8视图':
    '8格角色多角度设定表，手中武器去掉，上排4张头部特写（正面、四分之三侧面、纯侧面、背面），下排4张全身站姿（正面、四分之三侧面、纯侧面、背面，同时下排4张的人脸五官需要全部抹除掉），保持角色设计完全统一，极简纯白背景，干净网格布局+细黑线分割，超写实，8K超高清，电影级光影，专业角色参考图，比例一致无变形，焦点清晰，棚拍肖像质感，并在每格左上角标注格数数字。',
  '角色无头视图':
    '上下分屏排版。上半部分：面部特写。下半部分：角色三视图（正视图、侧视图、背视图）。注意：下半部分的三个身体必须完全无头（仅保留脖子以下）。中性灰背景，图片风格为真人照片质感，禁止转绘为漫画或其它风格。',
  '角色细节图':
    '专业游戏角色设定参考图，标准三视图+细节特写排版，左侧3张全身站姿（正面、左侧面、背面），右侧4行3列细节分镜，保持角色设计完全统一，极简纯白背景，细黑线分割网格，超写实人像摄影，8K分辨率，锐度拉满，电影级柔光，角色100%一致，无变形无穿模，包含头部多角度、面部五官、服装面料、拉链细节、背包细节、鞋履细节、手部细节，专业3D建模参考图，棚拍质感，并在每格左上角标注格数数字。',
  '角色身高比例图':
    '帮我生成全身身高比例图，角色均正视面向镜头。',
  '角色刷光':
    '角色图上半部分(面部)和下半(全身)部分的光线设定都按照场景图中的光线以及色相色温来做设定。不要改变角色人设图的构图,背景白色。',
  '场景9视图':
    '根据所有画面中保持外观、比例、材质、颜色和风格的完美一致性的原则。生成一个(16:9比例)设计的电影级专业3X3(共9张)的电影分镜网格。共9个面板。每个面板标记1-9的数字，该网格需采用3D电影截图风格。每一帧都是根据场景下不同角度，不同面的场景图。AI自动选择所有摄像机角度和构图。确保电影级布光、一致的调色、真实的景深以及连贯的环境演变。无重复镜头。',
  '场景九视图':
    '请根据提供的图片做出这个场景的不同角度图片，创作一个由九个画面组成的九宫格3*3排列画幅16:9。每个画面需精心设计以体现不同的景别和技术手法，包括但不限于特写、远景、俯拍、仰拍和运动镜头。场景中没有人物，用不同镜头角度展现。每个宫格标注1-9的数字。',
  '场景9宫格_1人':
    '{style} style scene concept art, multi-view reference sheet, no characters, {name}, {description}, high quality, ultra detailed, cinematic lighting\n\n【模板用途】\n为「{name}」生成一张「同一场景 · 多机位」标准化概念设定图集，供影视分镜、AIGC 控图、3D / 原画设计参考。整张为一张完整图片，内部均分为 3 行 × 3 列共 9 个等尺寸分格，每格是同一核心场景在不同摄影机位下的画面。\n\n【画幅与风格 · 自适应（不锁死）】\n- 整体画幅比例自适应当前生成设置 / 参考图：16:9、4:3、3:2、1:1、竖版等任意比例都按本模板套用，不强制特定画幅。\n- 每个分格形状由整体画幅均分而来（宽画幅→横向矩形，方画幅→接近正方，竖画幅→竖向矩形），不对单格形状做硬性限制。\n- 整体画风、色彩、光影、世界观完全由风格设定与场景描述 / 参考图驱动，本模板不锁定任何特定美术风格。\n\n【九宫格版式（核心结构）】\n- 一张完整图片内部均匀切分为 3 行 × 3 列共 9 个等尺寸分格，分格之间有清晰、统一的分隔线。\n- 不允许合并、缺格、多格、错位、大小不一；不做随机拼贴、不做连续大场景、不做漫画长条。\n- 9 个分格表现「同一个核心场景」的不同机位视角，不是 9 个不同场景；每格只改变机位 / 景别 / 角度 / 距离，不改变场景核心设计、世界观、风格、光影与配色。\n\n【九机位顺序】\n- 第一行：正面全景 ｜ 正面近景 ｜ 侧面全景\n- 第二行：侧面近景 ｜ 背面全景 ｜ 背面近景\n- 第三行：俯视全景 ｜ 俯视近景 ｜ 斜向高位视图\n\n【一致性铁律】\n9 格共享同一场景身份、同一画风、同一光影、同一配色；只有机位变化，场景本体不变，保证多视角空间逻辑统一，可直接用于正反打与环绕镜头规划。\n\n【禁止】\n单幅大图 / 随机拼贴 / 漫画分镜 / 把 9 视角融成一个连续场景 / 把任意格做成文字表格、PPT、海报标题页 / 用箭头或图标代替真实视角 / 缺格、多格、大小不一、严重裁切 / 除 9 个左上角角标外的多余文字 / 出现任何人物。\n\nnegative prompt: single full image, one large scene, irregular collage, random layout, broken grid, missing panel, extra panel, merged panels, unequal panels, no separator lines, comic strip layout, poster layout, text table, spreadsheet, PPT layout, title card occupying a panel, large text block, paragraph text, arrows instead of views, inconsistent scene, different locations, wrong camera order, missing view label, label outside the panel, oversized label, unreadable label, characters, people, human figures',
  '道具9宫格_1人':
    '{style} style item design, multi-view turntable reference sheet, no characters, {name}, {description}, clean neutral background, high quality, ultra detailed, product concept art\n\n【模板用途】\n为「{name}」生成一张「同一道具 · 多视角」标准化设定图集，供影视道具、AIGC 控图、3D 建模 / 原画参考。整张为一张完整图片，内部均分为 3 行 × 3 列共 9 个等尺寸分格，每格是同一道具的不同视角 / 细节。\n\n【画幅与风格 · 自适应（不锁死）】\n- 整体画幅比例自适应当前生成设置 / 参考图：任意比例都按本模板套用，不强制特定画幅。\n- 每个分格形状由整体画幅均分而来，不对单格形状做硬性限制。\n- 整体画风、材质、配色完全由风格设定与道具描述 / 参考图驱动，本模板不锁定任何特定美术风格。\n\n【九宫格版式（核心结构）】\n- 一张完整图片内部均匀切分为 3 行 × 3 列共 9 个等尺寸分格，分格之间有清晰、统一的分隔线。\n- 不允许合并、缺格、多格、错位、大小不一；不做随机拼贴、不做漫画长条。\n- 9 个分格表现「同一件道具」的不同视角与细节，不是 9 个不同道具；统一干净中性背景、统一光影与配色，只改变视角 / 距离 / 聚焦部位，不改变道具本体设计。\n\n【九视角顺序】\n- 第一行：正面视图 ｜ 侧面视图 ｜ 背面视图\n- 第二行：45°透视 ｜ 顶部俯视 ｜ 底部仰视\n- 第三行：材质细节 ｜ 关键构件特写 ｜ 整体比例参考\n\n【一致性铁律】\n9 格共享同一道具身份、同一画风、同一材质质感、同一光影与配色；只有视角 / 聚焦变化，道具本体不变，保证多视角结构逻辑统一，可直接用于建模与原画还原。\n\n【禁止】\n单幅大图 / 随机拼贴 / 漫画分镜 / 把任意格做成文字表格、PPT、海报标题页 / 用箭头或图标代替真实视角 / 缺格、多格、大小不一、严重裁切 / 除 9 个左上角角标外的多余文字 / 出现任何人物。\n\nnegative prompt: single full image, irregular collage, random layout, broken grid, missing panel, extra panel, merged panels, unequal panels, no separator lines, comic strip layout, poster layout, text table, spreadsheet, PPT layout, title card occupying a panel, large text block, paragraph text, arrows instead of views, different items, inconsistent design, wrong view order, missing view label, label outside the panel, oversized label, unreadable label, characters, people, human figures, busy background',
  '场景反打及细节':
    '为我创建一张综合图。这张图将包含场景的正面图、反面图，以及几个关键道具的特写小图，同时严格保持参考图中的陈设、装饰、光线和布局风格。\n场景分析与生成策略：\n    正面场景图：将忠实地再现您提供的原始图片，确保所有细节、光线和氛围都一致。\n    反面场景图：这是最具挑战性的部分。我将根据原始图的风格和布局推断房间的另一侧。\n   假设原始图展示的是房间的一面，那么反面图将展示房间的另一面，可能包含入口、另一组家具或艺术品，但会保持整体的协调性。我会想象相机转过180度后看到的景象，\n    关键道具小图：我会从原始图片中提取并放大以下关键道具的特写：\n综合图布局：\n我将采用一个清晰的布局，将正面和反面场景图作为主要部分，并在下方或侧面区域展示关键道具的特写小图。',
  '故事九宫格':
    '请根据提供的图片内容及前面叙述的故事背景，创作一个由九个画面构成的写实风格九宫格故事3*3排列画幅16:9。每个画面精心设计以体现不同的景别和技术手法，包括但不限于特写、远景、俯拍、仰拍和运动镜头等，以此强化故事的紧张氛围和视觉表现力。具体要求如下：整体一致性：所有画面应保持与上传图片相同的写实风格；故事连贯性：九宫格中的每幅画都应当紧密围绕一个完整的故事线展开，确保故事逻辑清晰且连贯；景别多样性：至少包含一个特写镜头，用于捕捉角色的表情或关键物品的细节；加入至少一个远景镜头，展示环境全貌或大规模的动作场景；运用俯拍或仰拍来增强特定场景的情感表达或戏剧效果；考虑使用运动镜头（如跟随角色移动）以增加动态感和紧张气氛；视觉与情感深度：利用光影对比、色彩调配以及构图技巧来加强故事的情感层次和视觉吸引力。请务必让每一张图像都能够独立讲述一部分故事，同时作为整个九宫格的一部分共同编织出一个引人入胜的整体叙事。按照要求生成图片。',
  '主图多机位':
    '使用图1切景别的方式生成一张多机位九宫格拍摄参考图,3x3九宫格,共9个面板。九个面板展示同一主体、同一场景、同一动作瞬间的不同拍摄角度。主体为【主体设定】,场景为【场景设定】,动作状态为【动作状态】。你最想重点呈现的角度或画面是:【重点角度/重点画面】,该重点需要在Shot 09中强化表现。\nShot 01正面远景,Shot 02正面中景,Shot03正面近景/特写,Shot04左侧面,Shot 05低机位/贴地机位,Shot 06右侧面,Shot07背面/侧背面,Shot08俯拍/高机位,Shot 09用户重点机位。\n所有面板保持人物外观、服饰、道具、动作、场景、光线和色调一致,只改变拍摄机位和构图。每格有简短Shot标签（如 Shot 01 等）。整体风格为专业电影机位预演图,版式清晰,边框明确,构图准确。\n负面约束:不要九张无关图片,不要人物变脸,不要服饰变化,不要道具消失,不要场景跳变,不要光线混乱,不要机位重复,不要主体被裁切,不要杂乱拼贴感,不要多余字幕、水印或多余数字。',
  '全景图生成':
    '等柱状投影720°×360°全景图,严格遵循提供的网格模板:网格从左到右依次对应东、南、西、北四个方位,场景布局与方位一一对应;所有场景主体与元素必须严格按照网格的相对变形规律摆放,透视、比例与网格曲率完全贴合画面上下空白区域为天空/屋顶或地面的延伸部分,填充对应场景的环境内容;全景无接缝、无拉伸畸变,整体画面连贯自然,符合真实空间透视逻辑;最终生成的成品画面中,绝对禁止出现任何参考网格、辅助线条、定位线、结构标记等所有参考类元素,仅呈现纯净、完整的符合要求的全景场景内容',
  '室外全景图':
    'Generate a stable ultra-wide panoramic environment plate for AR720 preview and surround-view scene planning. The image must depict one single continuous immersive environment, not a collage, not multiple panels, not multiple frames, and not multiple disconnected scenes. Compose it as a wraparound panoramic world with believable 360-degree continuity, even if the delivery format is a wide image instead of a true equirectangular output. Keep the horizon level and centered in the image, keep vertical structures calm and readable, and keep the overall camera height and world scale stable across the full width. The left and right edges are seam-critical panoramic boundaries and must connect naturally, without duplicated objects, abrupt geometry changes, broken perspective, mirrored artifacts, or lighting mismatch. Do not place unique focal subjects, faces, vehicles, dominant props, large signs, or critical architectural features directly across the far left and far right edges. Prioritize panoramic continuity over dramatic composition. Avoid poster-like hero framing, dutch angles, aggressive foreground close-ups, or exaggerated one-point perspective. The most important readable scene information should stay in the middle horizontal band. The upper and lower bands must be broader, calmer, and less dependent on sharp perspective detail. Treat the zenith and nadir as distortion-sensitive pole zones. They must remain simple, broad, continuous, and structurally safe for panorama remapping. Do not place important readable objects, faces, text, doors, windows, furniture silhouettes, vehicles, or critical structure joints at the extreme top or extreme bottom of the frame. Indoor ceilings should stay smooth and believable. Outdoor sky regions should stay continuous and clean. Ground and floor regions should stay coherent and should not melt, fold, spiral, or break into warped texture noise. Avoid strong pole distortion, tunnel-like stretching, radial twisting, collapsed ceilings, broken roofs, warped floors, or compositions that force major structures to converge into the top or bottom extremes. Use broad continuous shapes near the poles and avoid tiny repetitive details, dense decorations, hanging lamps, thin beams, railings, tiled micro-patterns, dense grass texture, or clutter that becomes unstable after panorama remapping. Keep the whole image anchored to one believable environment layout with readable foreground, midground, background, horizon logic, circulation paths, and directional landmarks, so the viewer can understand orientation inside the same scene. The composition must support surround-view reading, reverse-shot planning, and multi-direction camera extraction, instead of behaving like a single front-facing key art shot. Maintain one consistent art style, one consistent lighting setup, one consistent perspective logic, one consistent atmosphere, and one stable scene identity across the full panoramic strip. Avoid empty filler zones, disconnected scene fragments, dead texture-only areas, or visually meaningless side regions; the full width should remain readable and production-usable. Prefer softer edge transitions and continuation-friendly structures, with no hard narrative cut between the two horizontal ends. For indoor scenes, include believable doors, corridors, passages, openings, or exits so the space feels architecturally complete and traversable. For outdoor scenes, keep terrain layers, skyline logic, depth separation, and pathways coherent so the world feels continuous and orientation remains understandable. For indoor scenes, avoid large ceiling fixtures directly overhead and avoid floor patterns that become obviously stretched near the bottom edge. For outdoor scenes, keep sky, clouds, canopy, and ground transitions broad and continuous instead of noisy and fragmented. Do not include collage layouts, storyboard grids, comic panels, fisheye distortion, extreme wide-angle gimmicks, or strong shallow depth of field blur. Do not allow local style drift, local lighting drift, disconnected mini-scenes, or abrupt subject changes between different parts of the image. Use realistic environmental storytelling and high production quality, but keep the image usable as a panoramic environment plate rather than a single-shot poster. This is an open outdoor panoramic environment. The world must feel continuous, navigable, and geographically coherent across the full width. Keep the skyline, terrain layering, and path logic stable and readable, with a clean horizon and believable depth separation across the full panoramic span. Keep the sky broad and continuous near the zenith, and keep the ground broad and coherent near the nadir, avoiding fragmented clouds, broken canopy shapes, melting terrain, or noisy vegetation texture at the poles. Use clear pathways, terrain transitions, street logic, or environmental landmarks so orientation remains understandable in all directions. Avoid placing trees, poles, signs, vehicles, facades, fences, or other thin high-contrast structures at the extreme top or bottom bands where they are likely to warp after panorama remapping. This is an open outdoor environment. Keep the horizon, terrain layers, and pathways coherent and immersive. masterpiece, best quality, ultra detailed, panoramic environment plate, seam-safe edges, wraparound composition, centered horizon, stable verticals, coherent zenith and nadir, consistent exposure, physically based lighting, global illumination, realistic atmosphere, clean spatial composition',
  '室内全景图':
    'Generate a stable ultra-wide panoramic environment plate for AR720 preview and surround-view scene planning. The image must depict one single continuous immersive environment, not a collage, not multiple panels, not multiple frames, and not multiple disconnected scenes. Compose it as a wraparound panoramic world with believable 360-degree continuity, even if the delivery format is a wide image instead of a true equirectangular output. Keep the horizon level and centered in the image, keep vertical structures calm and readable, and keep the overall camera height and world scale stable across the full width. The left and right edges are seam-critical panoramic boundaries and must connect naturally, without duplicated objects, abrupt geometry changes, broken perspective, mirrored artifacts, or lighting mismatch. Do not place unique focal subjects, faces, vehicles, dominant props, large signs, or critical architectural features directly across the far left and far right edges. Prioritize panoramic continuity over dramatic composition. Avoid poster-like hero framing, dutch angles, aggressive foreground close-ups, or exaggerated one-point perspective. The most important readable scene information should stay in the middle horizontal band. The upper and lower bands must be broader, calmer, and less dependent on sharp perspective detail. Treat the zenith and nadir as distortion-sensitive pole zones. They must remain simple, broad, continuous, and structurally safe for panorama remapping. Do not place important readable objects, faces, text, doors, windows, furniture silhouettes, vehicles, or critical structure joints at the extreme top or extreme bottom of the frame. Indoor ceilings should stay smooth and believable. Outdoor sky regions should stay continuous and clean. Ground and floor regions should stay coherent and should not melt, fold, spiral, or break into warped texture noise. Avoid strong pole distortion, tunnel-like stretching, radial twisting, collapsed ceilings, broken roofs, warped floors, or compositions that force major structures to converge into the top or bottom extremes. Use broad continuous shapes near the poles and avoid tiny repetitive details, dense decorations, hanging lamps, thin beams, railings, tiled micro-patterns, dense grass texture, or clutter that becomes unstable after panorama remapping. Keep the whole image anchored to one believable environment layout with readable foreground, midground, background, horizon logic, circulation paths, and directional landmarks, so the viewer can understand orientation inside the same scene. The composition must support surround-view reading, reverse-shot planning, and multi-direction camera extraction, instead of behaving like a single front-facing key art shot. Maintain one consistent art style, one consistent lighting setup, one consistent perspective logic, one consistent atmosphere, and one stable scene identity across the full panoramic strip. Avoid empty filler zones, disconnected scene fragments, dead texture-only areas, or visually meaningless side regions; the full width should remain readable and production-usable. Prefer softer edge transitions and continuation-friendly structures, with no hard narrative cut between the two horizontal ends. For indoor scenes, include believable doors, corridors, passages, openings, or exits so the space feels architecturally complete and traversable. For outdoor scenes, keep terrain layers, skyline logic, depth separation, and pathways coherent so the world feels continuous and orientation remains understandable. For indoor scenes, avoid large ceiling fixtures directly overhead and avoid floor patterns that become obviously stretched near the bottom edge. For outdoor scenes, keep sky, clouds, canopy, and ground transitions broad and continuous instead of noisy and fragmented. Do not include collage layouts, storyboard grids, comic panels, fisheye distortion, extreme wide-angle gimmicks, or strong shallow depth of field blur. Do not allow local style drift, local lighting drift, disconnected mini-scenes, or abrupt subject changes between different parts of the image. Use realistic environmental storytelling and high production quality, but keep the image usable as a panoramic environment plate rather than a single-shot poster. This is an enclosed indoor panoramic environment. The space must feel architecturally complete, traversable, and enclosed within one coherent structure. Keep ceilings broad and simple near the zenith, avoid dense overhead fixtures, and avoid ceiling geometry that collapses, pinches, or twists toward the top pole. Keep floor and ground treatment continuous and readable near the nadir, avoiding stretched tiles, warped planks, broken perspective grids, or noisy micro-patterns near the bottom edge. Use stable room-scale perspective, readable wall-to-floor transitions, and believable openings such as doors, corridors, arches, passages, or exits. Avoid pushing furniture silhouettes, windows, door frames, columns, lamps, railings, or decorative trim into the extreme top or bottom bands where panorama remapping becomes unstable. This is an enclosed indoor environment. Keep the space coherent and include believable doors, corridors, passages, or exits. masterpiece, best quality, ultra detailed, panoramic environment plate, seam-safe edges, wraparound composition, centered horizon, stable verticals, coherent zenith and nadir, consistent exposure, physically based lighting, global illumination, realistic atmosphere, clean spatial composition',
  '高清放大4K': '高清放大到4K，极致清晰，保留原始细节，无噪点，无模糊，超高质量，完美画质',
  道具拆分:
    '识别主要物体，并将其拆分成 合适数量的 逻辑部件。\n使用干净的 Quixel 风格资产网格进行排布。\n必须满足：输出图像的**完整背景**为纯白色 (#FFFFFF)。\n物体部分的风格必须保持一致（100% 风格一致性）。',
  道具5视图:
    '生成 5 个视图（45 度透视、正面、背面、侧面、顶部）。在所有视图中保持完美的结构逻辑、比例尺度与物体身份一致。保持原始尺寸不变。',
  道具转线稿色块: '将图片转换为线稿色块图：在灰色背景上使用扁平色块呈现线稿风格。保持与原图相同的构图与比例。',
  黑白线稿图:
    '将原图转成黑白线稿。线条粗细程度统一为 0.05px。边缘线条改为 50% 灰色。保留画面中场景的主体结构，移除场景画面中细碎的细节线条。移除远景的地面、天空、树林以及高于天际线的内容。同时越远处的画面线条透明度越淡，越趋近于白色。保持与原图相同的构图与比例。',
  视觉色卡:
    '从参考图中提取电影感色彩方案，生成一张视觉色彩脚本板。包含 7 个色块：画面主氛围色、肤色、背景色、阴影色、高光色、道具或服装色、点缀色。每个色块标注近似 HEX 色值和描述性色名。极简编辑排版，中性背景，像影视美术设计参考图，整体色调必须贴合参考图情绪。仅保留色，其他画面内容不要。',
  道具转超写实: '识别图片中的物体，quixel资产库效果，灰色背景。',
  道具转白模: '将图片转成传统3D游戏影视流程中的白模效果图，灰色背景。',
  '线稿故事板':
    '根据下面的剧情内容制作故事版分镜图，比例为16:9,采用6格电影风格面板布局（可以根据实际情况进行变更8格或者4格）。\n\n整体要为黑白铅笔草图分镜图风格，使用粗糙和手绘线条，利用最小细节，快速的手势绘图，简化解剖结构和强化轮廓可读性，呈现影视当中的导演手绘故事版效果，不要上色，不需要渲染。\n请将剧情拆解为6格连续推进的关键镜头。每个面板都必须清楚表达画面内容，人物动作，镜头关系，情绪节奏信息，形成明显的叙事推进。\n\n每个面板必须包含可见的动作变化，姿态变化，表情变化，景别变化或者镜头推进。避免重复，呆板、静止站立式构图。其次角色动作、表情、姿态和场景变化这些信息，必须服务剧情发展，强化连续性、节奏感和视觉张力。\n\n镜头语言需要体现电影感，根据剧情需要灵活使用：手持感、快速平移、环绕运动、推镜/拉镜、俯拍、仰拍、侧面轮廓、侵略性特写、长焦压缩、极端负空间、前景遮挡、跟拍等。镜头语言必须服务叙事重点，不平均分配。\n\n环境保持简洁，仅保留对剧情有帮助的关键场景元素，避免无关杂乱背景。重点突出人物、动作、空间关系、光线方向和氛围。\n\n每个面板都必须加入以下标注系统：\n红色箭头 = 身体运动\n蓝色箭头 = 摄影机运动\n绿色标记 = 取景 / 构图笔记\n橙色标记 = 灯光方向\n紫色标记 = 情绪 / 声音 / 叙事强调\n黑色文字 = 简短镜头笔记和面板标签\n\n不要时间戳。每个面板必须编号。最后一个面板必须作为全片高潮或结尾定格，形成最强视觉冲击和情绪收束。\n\n剧情内容：\n【填写剧情】\n\n角色 / 场景补充：\n【填写角色、服装、道具、环境等信息】',
  '故事板_A':
    '避免场景过于相似，创建一个电影制作板/视觉规划表，展示短片或商业广告的完整概念。布局应简洁、基于网格，并分为清晰标记的部分。包含：共享创意指导（顶部栏）：整体限制，如镜头数量、统一的调色板和一般的环境背景。角色与风格参考部分：一个从多个角度展示的模型（正面、背面、侧面、特写、放松姿态），配有服装和配饰参考。强调身份的一致性，同时允许在特定场景中进行细微变化。环境和场景设计部分：一个具有戏剧性自然特征的场景户外地点，以及一个俯视示意图，说明在空间中的移动路径。包括摄像机位置和沿路线标注的拍摄类型。故事板部分：一系列编号的帧（大约8个镜头）展示场景的进展。每个帧包括：摄像机类型/镜头感觉，镜头大小（广角、中景、特写、微距），运动方式（静态、跟踪、手持等），动作和情绪进展的简要描述。灯光/情绪/风格备注：与灯光条件、氛围和纹理相关的视觉示例和简短描述。包括一天中不同时间的过渡和光线质量的变化。情绪和关键词块：指导作品的简洁情绪基调主题描述列表。音频/音调部分：环境声音、音乐风格和整体声音氛围的指示。电影摄影笔记：包括镜头特性、运动风格和后期处理感觉的总体视觉哲学。整个版面应感觉连贯、电影化且专业设计——就像导演的预制作指南，能一眼传达出基调、节奏和视觉叙事。将宽高比设为16:9，并且标注每个镜头的时长（秒）。这是一个以清晰排版和文字可读性为优先的专业故事板设计。所有文字必须清晰锐利、准确可读，禁止乱码和伪文字。分区标题、镜头编号、角色角度标签必须明显放大。每个分镜中的文字说明必须非常简短，控制在1到2行内，避免长段落。采用干净背景、高对比度文字、整齐网格布局和充足留白，确保整张板上的中文说明一眼可读。',
  '故事板_B':
    '一张AI视频生成指导图，整体采用真实影视前期提案板风格，画面像电影导演组内部使用的专业视觉开发文件，而不是普通拼贴海报。整个版面为高端中文电影UI排版包含角色设定、环境设计、摄影机位图、分镜故事板、情绪关键词、灯光设计、音频设计、摄影笔记、色调建议、节奏建议等多个模块，整体统一为超写实电影摄影风格，8K，高细节，真实胶片质感，具有强烈的电影工业化氛围。整张故事板必须以我的场景参考图为主，严格参考场景中的建筑结构、空间布局、地面材质，光影方向、环境氛围、远景层次、游客尺度与真实空间关系，确保所有分镜中的场景保持一致性和连续性。场景整体具有真实空间纵深，拥有电影级体积光、空气透视、漂浮灰尘、湿润反光、真实天气氛围与环境色温变化，整体风格统一，不能出现空间穿帮与建筑错位。环境氛围需要根据剧情自动匹配，例如压抑、宿命感、神性、史诗感、悬疑感、肃杀感、废墟感或超现实感。人物部分严格参考我的人物三视图进行统一生成，角色外观、发型、服装、盔甲、配饰、体型、颜色、材质、面部特征必须保持完全一致，不能在不同分镜中出现人物变形、服装变化、盔甲错误、脸部漂移或比例错误。人物需要生成标准角色设定区域，包括正面、背面、侧面、面部特写、情绪表情、站姿或坐姿参考，以及武器和装备细节参考。角色整体采用真实电影角色设计风格，而不是动漫设定图，人物皮肤、布料、金属、战损、灰尘、汗水与光影细节必须真实可信。故事板主体区域根据我的文字分镜脚本自动生成完整的电影分镜结构。每一个镜头都需要自动分析脚本中的人物动作、镜头运动、情绪变化、空间关系与叙事节奏，并生成对应的分镜画面。每格分镜必须包含时间码、景别、镜头角度、摄影机运动、人物动作、对白、音效与情绪描述。例如角色缓慢抬头时自动使用Slow Dolly-in，情绪爆发时自动使用Crash Zoom，战斗冲击时自动使用Dynamic Follow Shot，人物离场时自动使用Whip Pan或Handheld Tracking。所有镜头之间必须遵守180度轴线原则与30度有效分镜原则，确保角色站位、视线方向与镜头方向保持统一，形成真实电影剪辑逻辑，而不是随机拼接。镜头风格必须是真实电影摄影语言，包含低角度仰拍、过肩镜头、俯拍、长焦压缩、手持跟拍、浅景深、动态模糊、运动残影、镜头拉背、航拍推近等专业电影镜头设计。系统自动根据剧情判断镜头节奏，例如压抑对话采用稳定慢推镜头，紧张情绪采用手持微晃，史诗场景采用航拍大远景，人物心理震动采用焦点转移与背景虚化。所有镜头之间具有明确情绪递进，形成完整的观察→压迫→冲突→爆发→余韵的电影节奏。故事板底部自动生成情绪与风格关键词区域，根据剧情与场景自动提取风格标签，例如：超写实、电影感、宿命感、压抑、史诗感、神性、金属反光、潮湿空气、能量冲击，逆光尘埃、冷暖对比、烟雾氛围、胶片颗粒、真实光影、木质旧化、战损细节等，用于统一整部短片的视觉方向。同时自动生成音频与声场设计区域，根据分镜动作生成环境音、动作音效与BGM氛围。例如风声、脚步声、游客惊呼、火焰燃烧、金属摩擦、水能量轰鸣、低频震动、压迫鼓点，空旷回声、烟灰掉落声等，并自动匹配整体声场风格，例如贴近、压迫、低频，空旷、留白感或震撼感。故事板最后生成电影摄影笔记区域，自动分析整组镜头所需的镜头焦段、灯光逻辑与后期调色方向。例如35mm、50mm、85mm电影镜头组合，暖金高光与冷蓝阴影对比，真实皮肤纹理，胶片颗粒，HDR高动态范围，电影级动态模糊，真实镜头呼吸感，低饱和电影调色，摄影机慢推、手持跟随、镜头甩动、镜头摇移等电影语言。画面信息量巨大，一定要我的文字信息进行分析，分析故事内容和剧情走向等等，具有专业中文UI排版、真实摄影逻辑、真实故事板结构、真实镜头分析与真实电影工业化气质。',
  '故事板_CCC': '生成一张导演故事板分镜图，要求如下。\n【最终图片排版与文字标注要求（3:4画幅）】\n在一张比例为3:4的画幅中进行结构排版。\n\n🎬 模块一：分镜板（主模块） \n- 位置：画面中央靠上，宫格图顺序排列，占据主要画面。\n- 内容：根据剧情逻辑推演4个纯视觉分镜图。\n示例：\n列表展示\n第一列：时间轴：[例如：Cut 1  00:00 - 00:03，持续3秒]：\n第二列：分镜图\n第三列：运镜流程示意图及景别、运镜文字说明（图示表达镜头运动方式）\n第四列："\n主体：[主体描述，如角色、物体、环境元素]\n动作：[主体动作或行为描述，主体的具体行为、肢体动作或物理动态变化]\n描述：[画面构图]\n台词：[人物对白及说话语气，若无则填"无"]\n音效：[环境、动作音效]\n\n\n模块二：场景图、风格、光影与物品参考\n（横向铺展于画面底部，提供全方位的设定支撑材料与参数）\n1. 空间与环境设定\n人物站位图（必含）：[提供俯视视角的简图或详尽描述，清晰标明主要角色在场景中的空间位置、相对距离、视线方向以及摄影机（机位）的摆放位置]\n场景参考图：\n场景 1（宏观）：[大环境、建筑布局、地形地貌或大范围气候特征]\n场景 2（微观）：[局部环境、内部空间结构或特定角落的陈设]\n2. 道具与物件设定\n其他物品参考图：[画面中出现的关键道具、载具、武器或核心物件的特写参考与质感描述]\n3. 光影与色彩设定 (Lighting & Mood)\n光影布局：\n主光源：[类型、颜色、强度、照射方向]\n辅助光：[类型、颜色、强度、补光位置]\n环境光：[类型、颜色、强度、整体笼罩氛围]\n色彩板：\n主色/辅色/点缀色：[明确画面占据最大面积的核心颜色、平衡画面的辅助色以及用于视觉焦点的对比色]\n整体风格：[明确具体的艺术风格（如赛博朋克、写实电影感等）、渲染质感及最终的情绪基调]\n',
  'CCCC_故事板简化版': `生成一张导演故事板分镜图，要求如下。
【最终图片排版与文字标注要求（3:4画幅）】
在一张比例为3:4的画幅中进行结构排版。

模块一：分镜板（主模块）
- 位置：画面中央靠上，宫格图顺序排列，占据主要画面。
- 内容：根据剧情逻辑推演至少6个纯视觉分镜图，需保持景别运用丰富。
示例：
列表展示
第一列：时间轴：[例如：Cut 1  00:00 - 00:03，持续3秒]：
第二列：分镜图
第三列：运镜及画面描述。
第四列："
主体：[主体描述，如角色、物体、环境元素]
台词：[人物对白及说话语气，若无则填"无"]
音效：[环境、动作音效]
第五列：其他注意事项。


模块二：场景图、风格、光影。
（横向铺展于画面底部，提供全方位的设定支撑材料与参数）
1. 空间与环境设定
人物站位图（必含）：[提供俯视视角的简图或详尽描述，清晰标明主要角色在场景中的空间位置、相对距离、视线方向以及摄影机（机位）的摆放位置]
整体的拍摄设备，动作风格。
2. 光影与色彩设定 (Lighting & Mood)
光影布局：
主光源：[类型、颜色、强度、照射方向]
辅助光：[类型、颜色、强度、补光位置]
环境光：[类型、颜色、强度、整体笼罩氛围]
色彩板：
主色/辅色/点缀色：[明确画面占据最大面积的核心颜色、平衡画面的辅助色以及用于视觉焦点的对比色]
视觉风格：[明确具体的艺术风格（如赛博朋克、写实电影感等）、渲染质感及最终的情绪基调]
导演备注信息。`,
};

/** 文生图预设内容 */
export const INITIAL_T2I_PROMPT_PRESETS: Record<string, string> = {
  '故事板_A':
    '避免场景过于相似，创建一个电影制作板/视觉规划表，展示短片或商业广告的完整概念。布局应简洁、基于网格，并分为清晰标记的部分。包含：共享创意指导（顶部栏）：整体限制，如镜头数量、统一的调色板和一般的环境背景。角色与风格参考部分：一个从多个角度展示的模型（正面、背面、侧面、特写、放松姿态），配有服装和配饰参考。强调身份的一致性，同时允许在特定场景中进行细微变化。环境和场景设计部分：一个具有戏剧性自然特征的场景户外地点，以及一个俯视示意图，说明在空间中的移动路径。包括摄像机位置和沿路线标注的拍摄类型。故事板部分：一系列编号的帧（大约8个镜头）展示场景的进展。每个帧包括：摄像机类型/镜头感觉，镜头大小（广角、中景、特写、微距），运动方式（静态、跟踪、手持等），动作和情绪进展的简要描述。灯光/情绪/风格备注：与灯光条件、氛围和纹理相关的视觉示例和简短描述。包括一天中不同时间的过渡和光线质量的变化。情绪和关键词块：指导作品的简洁情绪基调主题描述列表。音频/音调部分：环境声音、音乐风格和整体声音氛围的指示。电影摄影笔记：包括镜头特性、运动风格和后期处理感觉的总体视觉哲学。整个版面应感觉连贯、电影化且专业设计——就像导演的预制作指南，能一眼传达出基调、节奏和视觉叙事。将宽高比设为16:9，并且标注每个镜头的时长（秒）。这是一个以清晰排版和文字可读性为优先的专业故事板设计。所有文字必须清晰锐利、准确可读，禁止乱码和伪文字。分区标题、镜头编号、角色角度标签必须明显放大。每个分镜中的文字说明必须非常简短，控制在1到2行内，避免长段落。采用干净背景、高对比度文字、整齐网格布局和充足留白，确保整张板上的中文说明一眼可读。',
  '故事板_B':
    '一张AI视频生成指导图，整体采用真实影视前期提案板风格，画面像电影导演组内部使用的专业视觉开发文件，而不是普通拼贴海报。整个版面为高端中文电影UI排版包含角色设定、环境设计、摄影机位图、分镜故事板、情绪关键词、灯光设计、音频设计、摄影笔记、色调建议、节奏建议等多个模块，整体统一为超写实电影摄影风格，8K，高细节，真实胶片质感，具有强烈的电影工业化氛围。整张故事板必须以我的场景参考图为主，严格参考场景中的建筑结构、空间布局、地面材质，光影方向、环境氛围、远景层次、游客尺度与真实空间关系，确保所有分镜中的场景保持一致性和连续性。场景整体具有真实空间纵深，拥有电影级体积光、空气透视、漂浮灰尘、湿润反光、真实天气氛围与环境色温变化，整体风格统一，不能出现空间穿帮与建筑错位。环境氛围需要根据剧情自动匹配，例如压抑、宿命感、神性、史诗感、悬疑感、肃杀感、废墟感或超现实感。人物部分严格参考我的人物三视图进行统一生成，角色外观、发型、服装、盔甲、配饰、体型、颜色、材质、面部特征必须保持完全一致，不能在不同分镜中出现人物变形、服装变化、盔甲错误、脸部漂移或比例错误。人物需要生成标准角色设定区域，包括正面、背面、侧面、面部特写、情绪表情、站姿或坐姿参考，以及武器和装备细节参考。角色整体采用真实电影角色设计风格，而不是动漫设定图，人物皮肤、布料、金属、战损、灰尘、汗水与光影细节必须真实可信。故事板主体区域根据我的文字分镜脚本自动生成完整的电影分镜结构。每一个镜头都需要自动分析脚本中的人物动作、镜头运动、情绪变化、空间关系与叙事节奏，并生成对应的分镜画面。每格分镜必须包含时间码、景别、镜头角度、摄影机运动、人物动作、对白、音效与情绪描述。例如角色缓慢抬头时自动使用Slow Dolly-in，情绪爆发时自动使用Crash Zoom，战斗冲击时自动使用Dynamic Follow Shot，人物离场时自动使用Whip Pan或Handheld Tracking。所有镜头之间必须遵守180度轴线原则与30度有效分镜原则，确保角色站位、视线方向与镜头方向保持统一，形成真实电影剪辑逻辑，而不是随机拼接。镜头风格必须是真实电影摄影语言，包含低角度仰拍、过肩镜头、俯拍、长焦压缩、手持跟拍、浅景深、动态模糊、运动残影、镜头拉背、航拍推近等专业电影镜头设计。系统自动根据剧情判断镜头节奏，例如压抑对话采用稳定慢推镜头，紧张情绪采用手持微晃，史诗场景采用航拍大远景，人物心理震动采用焦点转移与背景虚化。所有镜头之间具有明确情绪递进，形成完整的观察→压迫→冲突→爆发→余韵的电影节奏。故事板底部自动生成情绪与风格关键词区域，根据剧情与场景自动提取风格标签，例如：超写实、电影感、宿命感、压抑、史诗感、神性、金属反光、潮湿空气、能量冲击，逆光尘埃、冷暖对比、烟雾氛围、胶片颗粒、真实光影、木质旧化、战损细节等，用于统一整部短片的视觉方向。同时自动生成音频与声场设计区域，根据分镜动作生成环境音、动作音效与BGM氛围。例如风声、脚步声、游客惊呼、火焰燃烧、金属摩擦、水能量轰鸣、低频震动、压迫鼓点，空旷回声、烟灰掉落声等，并自动匹配整体声场风格，例如贴近、压迫、低频，空旷、留白感或震撼感。故事板最后生成电影摄影笔记区域，自动分析整组镜头所需的镜头焦段、灯光逻辑与后期调色方向。例如35mm、50mm、85mm电影镜头组合，暖金高光与冷蓝阴影对比，真实皮肤纹理，胶片颗粒，HDR高动态范围，电影级动态模糊，真实镜头呼吸感，低饱和电影调色，摄影机慢推、手持跟随、镜头甩动、镜头摇移等电影语言。画面信息量巨大，一定要我的文字信息进行分析，分析故事内容和剧情走向等等，具有专业中文UI排版、真实摄影逻辑、真实故事板结构、真实镜头分析与真实电影工业化气质。',
  '故事板_CCC': '生成一张导演故事板分镜图，要求如下。\n【最终图片排版与文字标注要求（3:4画幅）】\n在一张比例为3:4的画幅中进行结构排版。\n\n🎬 模块一：分镜板（主模块） \n- 位置：画面中央靠上，宫格图顺序排列，占据主要画面。\n- 内容：根据剧情逻辑推演4个纯视觉分镜图。\n示例：\n列表展示\n第一列：时间轴：[例如：Cut 1  00:00 - 00:03，持续3秒]：\n第二列：分镜图\n第三列：运镜流程示意图及景别、运镜文字说明（图示表达镜头运动方式）\n第四列："\n主体：[主体描述，如角色、物体、环境元素]\n动作：[主体动作或行为描述，主体的具体行为、肢体动作或物理动态变化]\n描述：[画面构图]\n台词：[人物对白及说话语气，若无则填"无"]\n音效：[环境、动作音效]\n\n\n模块二：场景图、风格、光影与物品参考\n（横向铺展于画面底部，提供全方位的设定支撑材料与参数）\n1. 空间与环境设定\n人物站位图（必含）：[提供俯视视角的简图或详尽描述，清晰标明主要角色在场景中的空间位置、相对距离、视线方向以及摄影机（机位）的摆放位置]\n场景参考图：\n场景 1（宏观）：[大环境、建筑布局、地形地貌或大范围气候特征]\n场景 2（微观）：[局部环境、内部空间结构或特定角落的陈设]\n2. 道具与物件设定\n其他物品参考图：[画面中出现的关键道具、载具、武器或核心物件的特写参考与质感描述]\n3. 光影与色彩设定 (Lighting & Mood)\n光影布局：\n主光源：[类型、颜色、强度、照射方向]\n辅助光：[类型、颜色、强度、补光位置]\n环境光：[类型、颜色、强度、整体笼罩氛围]\n色彩板：\n主色/辅色/点缀色：[明确画面占据最大面积的核心颜色、平衡画面的辅助色以及用于视觉焦点的对比色]\n整体风格：[明确具体的艺术风格（如赛博朋克、写实电影感等）、渲染质感及最终的情绪基调]\n',
  'CCCC_故事板简化版': `根据如上剧本生成一张导演故事板分镜图，要求如下。
【最终图片排版与文字标注要求（3:4画幅）】
在一张比例为3:4的画幅中进行结构排版。在画面上通过不一样的颜色箭头描述出人物运动方向和镜头轨迹。

模块一：分镜板（主模块）
- 位置：画面中央靠上，宫格图顺序排列，占据主要画面。
- 内容：根据剧情逻辑推演4个纯视觉分镜图。
示例：
列表展示
第一列：时间轴：[例如：Cut 1  00:00 - 00:03，持续3秒]：
第二列：分镜图
第三列：运镜流程示意图及景别、运镜文字说明（图示表达镜头运动方式）
第四列："
主体：[主体描述，如角色、物体、环境元素]
动作：[主体动作或行为描述，主体的具体行为、肢体动作或物理动态变化]
描述：[画面构图]
台词：[人物对白及说话语气，若无则填"无"]
音效：[环境、动作音效]`,
  '通用模板':
    '柯达Vision3 5219胶片质感，IMAX 65mm 拍摄，诺兰电影摄影风格，霍特玛掌镜，有机胶片颗粒，高光自然晕染（halation），柔和对比度，黑位略微提亮，自然光主导，仅使用实用光源，球面镜头（非变形宽银幕），浅景深，胶片化学调色，无数字锐化。柔焦边缘，克制的细节表达，大色块优先，材质统一干净，避免堆砌细碎纹理，整体通透高级。参考电影摄影质感：自然胶片颗粒，像一张精心打光的电影剧照，而不是高清数码照片。',
  '通用提示词':
    '柯达Vision3 5219胶片质感，IMAX 65mm 拍摄，诺兰电影摄影风格，霍特玛掌镜，有机胶片颗粒，高光自然晕染（halation），柔和对比度，黑位略微提亮，自然光主导，仅使用实用光源，球面镜头（非变形宽银幕），浅景深，胶片化学调色，无数字锐化。柔焦边缘，克制的细节表达，大色块优先，材质统一干净，避免堆砌细碎纹理，整体通透高级。参考电影摄影质感：自然胶片颗粒，像一张精心打光的电影剧照，而不是高清数码照片。',
  'gpt去碎细节':
    '完整提取并保留原图中的所有信息：构图、人物姿态与表情、服装、场景、道具位置、光源方向、整体色调与氛围、镜头景别。\n\n在此基础上完全重绘这张图，重置画面质感：\n- 去除原图过度锐化，消除边缘的硬刃感与高频噪点\n- 弱化过于细碎的纹理细节（毛孔、布料织线、墙面颗粒、发丝抖动等）\n- 改为柔和顺滑的渲染：干净的边缘、整洁的色块过渡、统一的材质表现、电影级柔光\n- 保留必要的结构细节，但让画面更"耐看"、不刺眼、不毛躁\n- 整体呈现：高级感、丝滑、通透、克制的细节、电影质感\n\n不要改变人物身份、构图与色彩基调。',
  'NanoBanana2去碎细节':
    '请完整识别这张图里的所有信息：人物长相、姿态、表情、服装、配饰、场景、道具、光源方向、色彩基调、镜头景别与构图。\n\n在保持这些信息 100% 不变的前提下，重新生成这张图，重置画面质感：\n\n1. 去掉原图的过度锐化，消除边缘的硬刃感和不自然的高频细节\n2. 抹平过于碎的纹理（皮肤毛孔、布料织线、发丝噪点、墙面颗粒）\n3. 换成柔和顺滑的渲染：边缘干净、过渡自然、材质统一\n4. 加入电影级柔光与通透感，画面要"高级、丝滑、克制"\n5. 保留必要的结构细节，但整体观感要舒服、不刺眼、不毛躁\n\n注意：人物身份、构图、色调不能变，只换质感。',
  '通用视频后缀':
    '真实皮肤质感，自然肤色不均，毛孔克制可见但不堆砌，轻微油光与汗渍，无美颜磨皮，无塑料感，皮肤上有环境痕迹（沙尘/汗/泪/红润），胶片柔光下的皮肤通透感。头发有真实重量感和分股，几缕被风吹乱，不完美的发型，自然油光，没有 CG 完美感，胶片柔焦下的发丝光晕。眼睛有湿润的真实反光，瞳孔清晰但不锐利，眼白有自然血丝（不夸张），眼神聚焦在画面外某点（不是直视镜头），睫毛根部细节自然，眼角有轻微泪光 / 疲惫感。\n捕捉于动作中段，非摆拍，自然身体重心，微动态模糊（仅手部/发丝/衣角），身体有重量感，呼吸可见（胸腔/肩膀微起伏），肌肉有自然张力，不僵硬。\n克制的情绪表达，情绪藏在眼睛和呼吸里，不夸张的面部肌肉，微表情主导，诺兰式情感克制，库珀式压抑，安静的力量感。\n拍摄风格：诺兰《星际穿越》，霍特玛 IMAX 65mm 胶片，柯达 5219 颗粒，自然光，胶片柔光，克制对比，浅景深，真实皮肤质感，眼神聚焦画面外，情绪藏在呼吸里，电影剧照感，非数字锐化，非摆拍。',
  '视频后缀_特写_情绪戏':
    '人物质感：真实皮肤纹理，自然肤色不均，眼睛有湿润反光，睫毛细节自然，发丝有重量感，几缕被风吹乱。\n动态：捕捉于动作中段，呼吸可见，身体微微张力，克制的情绪表达，情绪藏在眼睛里。\n画面质感：诺兰《星际穿越》电影质感，霍特玛掌镜，IMAX 65mm 柯达 Vision3 5219 胶片，有机颗粒，高光晕染，柔对比度，自然光主导，浅景深，电影剧照感。',
  '视频后缀_中景/全景':
    '人物：真实身体重心，自然站姿/动作，衣物有重量与褶皱，[插入具体动作关键词]。\n光线：自然光 + 实用光源，光线在皮肤上不均匀包裹，背景压暗，人物通过光被分离出来。\n画面质感：诺兰《星际穿越》电影质感，霍特玛掌镜，IMAX 65mm 柯达 Vision3 5219 胶片，有机颗粒，高光晕染，柔对比度，球面镜头浅景深，胶片化学调色，无数字锐化，电影剧照感。',
  '视频后缀_双人对手戏':
    '两人之间的距离感：[紧密拥抱 / 隔着东西对望 / 一前一后]，彼此的肢体语言相互呼应，A 的眼神看向 [B / 别处]，B 的眼神看向 […]。\n情绪克制，靠肢体距离和眼神传递，不靠夸张表情。\n画面质感：诺兰《星际穿越》电影质感，霍特玛掌镜，IMAX 65mm 柯达 Vision3 5219 胶片，有机颗粒，高光晕染，柔对比度，自然光与实用光主导，浅景深，电影剧照感。',
  '视频_情绪关键词':
    '通用情绪基底(必加）\n克制的情绪表达，情绪藏在眼睛和呼吸里，不夸张的面部肌肉，微表情主导，诺兰式情感克制，库珀式压抑，安静的力量感。\n悲伤 / 离别\n强忍泪水，眼眶发红但泪未落，下颌肌肉绷紧，呼吸短促，喉结上下滑动，嘴角微下沉但不哭出声，眼神聚焦于一点不敢移开。\n喜悦 / 重逢\n眼睛先于嘴角先笑，泪光闪现，颤抖的笑容，难以置信的呼吸停顿，伸手又缩回的迟疑。\n敬畏 / 震撼\n张开的嘴但没有声音，瞳孔放大，呼吸暂停，身体僵在原地，眼睛反射着光源，渺小感和神圣感同时存在。\n紧张 / 恐惧\n瞳孔急速收缩，颈部血管浮起，肩膀僵硬上抬，手指不自觉抓紧，呼吸急促但克制不出声。\n决绝 / 牺牲\n平静到反常的脸，眼神坚定无波澜，深呼吸一次，下巴微抬，嘴唇抿成直线，不是悲壮而是接受。\n思念 / 守望\n长久的远眺，眼神空洞但不悲伤，习惯性的等待姿态，手指无意识摩挲一个旧物，脸上有岁月的疲惫但保留着希望。',
  '视频_出真人九宗罪':
    '塑料假脸\nnatural skin imperfections, no beauty retouch, film grain on skin\n死眼 / 呆滞\ngaze focused off-camera, alive eyes with catchlight\n僵尸表情\nmicro-expression, asymmetric facial muscles, caught mid-emotion\nCG 完美感\nimperfect, candid, not posed, photographic not rendered\n过度锐化\nsoft film grain, halation, no digital sharpening\n细节碎 / 糊脸\nrestrained detail, large light shapes over busy texture\n手部畸形\nnatural hand anatomy, relaxed fingers\n摆拍感太重\ndocumentary style, caught in moment, candid photojournalism\n脸太对称 / 网红脸\nasymmetric features, lived-in face, character actor not model',
  '故事板分镜图_终极': `导演设定：生成"单片段五镜头清晰电影故事版执行图 + Seedance2.0 视频 Prompt"。

最高优先级：人物参考锁定
用户上传的人物参考图是最高优先级，优先级高于导演设定、视觉风格、故事板排版、镜头调度、VIDEO PROMPT、Seedance2.0 识别优化和所有美术风格要求。

如果任何规则与人物参考图冲突，必须以人物参考图为准。

所有出现在故事板中的角色，必须严格保持上传人物参考图中的：脸型、五官比例、发型、发色、服装款式、服装颜色、身形比例、年龄感、气质、道具、饰品、轮廓特征。

禁止为了适配古风、仙侠、电影感、故事板风格、动作设计、镜头角度或画面统一性而改变人物身份。禁止把上传角色美化成另一个人。禁止把上传角色年轻化、老化、换脸、换发型、换服装、换颜色、换身材。

如果模型无法同时满足故事板复杂排版和人物一致性，必须优先牺牲排版复杂度，保留人物一致性。

核心定义：
用户设置的"分镜数量"不是镜头数量，而是故事版页面数量。每一张生成图 = 一张完整故事版页面；每一张故事版页面 = 一个约 10 秒的视频片段；每个页面内部必须固定包含 5 个连续镜头。

每一个 prompt / 每一张生成图，都必须被理解为"一整张故事版页面"的生成指令，而不是单个镜头画面的生成指令。

如果用户设置分镜数量为 N，则输出 N 张故事版页面。每张页面必须先把当前 10 秒剧情片段拆成 5 个连续动作节点，再分别放入 5 个镜头框中。5 个镜头不能重复表现同一个静态瞬间，不能只是同一场景的随机角度展示。

核心目标：
故事版必须同时满足：
1. 严格保持上传人物参考一致性。
2. 看起来像清晰、规整、正式的影视分镜执行图。
3. 能被 Seedance2.0 清楚识别，用于后续视频生成。
4. 每张故事版必须额外生成一条基于本页 5 个镜头内容的视频 Prompt。

画面优先，人物优先，文字辅助。禁止复杂表格、密集文字、小字号堆叠。宁可减少参数，也要保证人物参考、人物动作、空间关系、镜头顺序和视频 Prompt 清楚可读。

页面版式：
必须是 16:9 横版清晰电影故事版页面。整体为干净、规整、专业的影视分镜执行图风格。

页面顶部保留简洁标题栏，包含项目名称、片段编号、总时长 10s、镜头数量 5、画面比例 16:9。标题栏必须简洁，不要塞满过多参数。

主体区域必须包含 5 个大镜头框，固定排版为上排 3 个镜头、下排 2 个镜头。5 个镜头框必须边界清楚、大小稳定、间距合理。每个镜头画面要足够大，不能被过多文字压缩。

每个镜头框必须有独立编号 01、02、03、04、05。编号必须清晰、醒目。每个镜头框下方只保留一条简短中文说明，说明该镜头的动作重点。每条说明不超过 25 个中文字。

镜头参数规则：
每个镜头最多显示一行简短参数，例如：
"中景 / 平视 / 缓慢推入 / 2s"
不要显示复杂焦段、光圈、设备型号、大量摄影术语。

VIDEO PROMPT 区域：
每张故事版页面底部必须包含一个独立清晰区域，标题为"VIDEO PROMPT"。

VIDEO PROMPT 是给 Seedance2.0 使用的视频生成提示词。它必须基于本页 5 个镜头的实际画面内容生成，不能脱离故事板，不能添加本页没有出现的新角色、新动作、新场景或新剧情。

VIDEO PROMPT 必须是一整段自然语言提示词，而不是表格，不是编号分镜，不是解释说明。

VIDEO PROMPT 必须使用 Character #N + 角色名 来描述人物，不能使用模糊称呼，例如"男子""女子""白衣人""小女孩"。VIDEO PROMPT 不得加入会改变角色外貌、服装、年龄或身份的描述。

VIDEO PROMPT 必须包含：
场景位置、固定环境锚点、出现人物、人物左右站位、前后景关系、人物朝向、核心动作、镜头运动、情绪变化、动作结果、片段结尾状态。

VIDEO PROMPT 必须遵守 Seedance2.0 长片连续生成逻辑：
1. 当前片段不是独立短视频，而是长电影中的一个连续 Beat。
2. 当前片段开头必须继承上一页第 5 镜头的空间状态。
3. 不得重置人物站位、机位方向、环境锚点和光源方向。
4. 摄影机必须处在真实可理解的物理位置。
5. 运镜必须说明为什么动、从哪动、到哪停、看清了什么。
6. 每个片段必须服务于空间确认、威胁推进、情绪揭示或动作冲击。

VIDEO PROMPT 推荐格式：
"0–2s，镜头从场景左前方中景开始，Character #1（角色名）位于画面左侧棺椁前，Character #2（角色名）位于右侧台阶下，金色光柱和破裂石柱作为环境锚点；2–4s，摄影机缓慢推近，Character #2（角色名）向前半步，Character #1（角色名）转身看向他，二人保持左右关系；4–6s，切到近景，Character #1（角色名）神情震动，背景棺椁仍在左后方；6–8s，过肩镜头从 Character #2（角色名）身后看向 Character #1（角色名），视线匹配且不越轴；8–10s，中景收束，二人保持对峙，Character #2（角色名）停在右侧，Character #1（角色名）留在左侧，气氛压抑，准备承接下一页。"

VIDEO PROMPT 长度控制在 100 到 180 个中文字之间。必须清晰、连续、具体、可直接用于生视频。

VIDEO PROMPT 禁止事项：
禁止写成抽象风格词堆叠。禁止加入本页没有出现的人物。禁止加入本页没有出现的动作。禁止改变角色站位。禁止改变场景。禁止重置空间。禁止写成小说段落。禁止写成多个编号条目。禁止与本页 5 个镜头内容不一致。禁止使用会改变角色外貌、服装、年龄或身份的描述。

人物参考强制规则：
上传人物参考图不是风格参考，而是身份锁定图。它不是"参考一下"，而是角色唯一身份来源。

每个角色必须始终使用 Character #N + 角色名 的身份绑定方式。所有故事版页面、每页 5 个镜头、VIDEO PROMPT、镜头说明和后续视频提示词中，都必须保持同一角色编号和同一身份。

如果 Character #1 在上传图中是某张脸、某套服装、某种发型，那么 Character #1 在所有镜头里都必须保持这张脸、这套服装、这个发型。不能因为景别变化、角度变化、光影变化、动作变化或情绪变化而改变身份。

远景可以降低脸部细节，但不能改变发型轮廓、服装颜色、身形比例和角色气质。
侧脸必须保持同一鼻梁、脸型、发型轮廓和服装特征。
背影必须保持同一发型长度、服装款式、肩背轮廓和身形比例。
过肩镜头必须保持前景角色的发型、服装和肩背轮廓，不得变成陌生人。

如果有多个上传角色，必须逐个锁定：
Character #1 只对应上传的第 1 个角色。
Character #2 只对应上传的第 2 个角色。
Character #3 只对应上传的第 3 个角色。
禁止混合两个角色的脸、服装、发型或气质。
禁止把 Character #2 的服装画到 Character #1 身上。
禁止把 Character #1 的脸画到 Character #3 身上。

站位坐标表强制规则：
每一张故事版页面在生成 5 个镜头前，必须先在内部建立本页站位坐标表，并严格执行。站位坐标表必须包含：场景固定锚点、每个角色的起始位置、移动方向、终点位置、屏幕左右关系和动作轴。

本页 5 个镜头必须围绕同一张站位坐标表生成。禁止每个镜头重新设计人物位置。禁止镜头 1、2、3、4、5 使用不同空间逻辑。

角色位置必须以场景锚点描述，例如：棺椁左前方、台阶右侧、殿门入口、平台中央、屏风后方、走廊尽头、控制台左侧、桌前右侧。

角色移动必须写清楚：
镜头1：角色在起始点。
镜头2：角色开始移动或做出反应。
镜头3：角色移动到中途或动作升级。
镜头4：通过近景、过肩或细节表现动作影响。
镜头5：角色到达新位置或形成新的稳定关系。

动作链强制规则：
每页 5 个镜头必须是同一段动作链，不是同一场景的 5 张随机图。生成时必须先确定本页唯一动作目标，例如：靠近、质问、发现、拔剑、回头、阻拦、跪下、递出道具、转身离开。

5 个镜头必须按这个动作目标递进：
镜头1：动作开始前的位置。
镜头2：动作开始。
镜头3：动作进行到中点。
镜头4：动作产生反应或细节。
镜头5：动作完成后的新状态。

禁止镜头2是无原因单人肖像，镜头3突然变多人同框，镜头4突然换站位，镜头5又回到远景重置。每一镜都必须解释上一镜之后发生了什么。

人物站位锁定规则：
同一页面内的 5 个镜头必须保持清晰、稳定的人物站位关系。每个角色在场景中的空间位置必须前后承接，不能随机移动、瞬移、互换位置或突然出现在不合理的位置。

多个角色同场时，必须保持彼此之间的空间关系。例如：Character #1 在前景左侧，Character #2 在中景右侧，Character #3 在背景门口，则后续镜头中的近景、反打、过肩、俯视、低角度镜头都必须尊重这个空间关系。

新角色入场规则：
新角色不能突然出现在画面中央、两名角色之间或关键冲突位置。新角色必须通过明确入场路径进入，例如从门口、背景、侧后方、台阶、走廊、屏风后方或画面边缘进入。

如果某个角色在上一页或上一镜头没有出现，那么下一镜头必须先展示其入场方向或所在位置。禁止新角色无铺垫突然站到主角面前。

轴线与机位规则：
同一页面内必须遵守 180 度轴线规则。先根据角色站位、对话方向、动作方向或视线方向建立一条明确的动作轴线。5 个镜头必须保持在同一侧轴线内调度，不能随意越轴。

角色 A 与角色 B 的左右位置关系必须保持稳定。例如：如果 Character #1 在画面左侧、Character #2 在画面右侧，那么后续镜头中的正反打、过肩、近景、中景都必须保持相同的屏幕方向。

视线方向必须连续。角色看向对方时，正反打镜头必须保持视线匹配。不能出现两个人都看向同一方向却被表现成对视。动作方向必须连续，例如人物从左向右移动，后续镜头也必须保持相同方向，除非剧情明确表现转身或改变方向。

禁止越轴，禁止左右关系跳变，禁止正反打方向错误，禁止视线不匹配，禁止角色突然瞬移到轴线另一侧。只有当剧情明确要求轴线转换时，才允许通过一个过渡镜头展示轴线变化。

跨页承接硬规则：
第 N+1 页的第 1 镜头必须直接复现第 N 页第 5 镜头的主要站位关系。可以略微改变景别，但不能改变角色左右位置、距离关系、动作状态和视线方向。

如果第 N 页第 5 镜头中 Character #1 在画面左侧、Character #2 在画面右侧，则第 N+1 页第 1 镜头必须继续保持 Character #1 左侧、Character #2 右侧。禁止下一页开头重置站位。

如果第 N 页第 5 镜头中角色已经靠近、拔剑、转身、倒地、沉默、注视某物或形成对峙，第 N+1 页第 1 镜头必须从这个状态继续，而不是重新回到上一段动作的开头。

状态与物理继承规则：
角色动作必须留下物理代价。摔倒会有衣服脏污，受伤会有血迹，奔跑会有喘息和汗，爆炸会有灰尘或烧痕，道具使用后必须继承状态变化。

每一页必须继承上一页最后一镜的可见状态，包括：谁在左侧、谁在右侧、谁更靠近镜头、谁被谁遮挡、衣服是否脏乱、道具是否损坏、角色是否受伤、光源方向是否一致。

环境锚点规则：
每个场景至少有 3 个固定环境锚点，例如门、窗、楼梯、走廊、灯、桌子、棺椁、石柱、屏风、控制台。每一页故事版至少复现其中 2 个锚点。禁止环境锚点消失导致空间断裂。

角色联动规则：
画面里只要有人动，其他角色必须同步反应。反应可以是转头、后退、握紧道具、视线变化、身体僵住、呼吸变化、遮挡变化。禁止其他角色在关键动作发生时呆滞不动。

视觉风格：
视觉风格必须参考用户上传图片和用户确认的风格设定，但不能覆盖人物参考。风格只能影响色彩、光影、镜头氛围、材质质感、故事版边框和整体调性，不能改变人物身份、脸型、发型、服装和身形比例。

参考图规则：
如果上传主场景参考图，必须将其作为唯一空间蓝图，保持房间结构、空间关系、主要物体位置、光源方向、材质氛围和场景尺度。如果上传角色参考图，必须保持角色身份、脸型、发型、服装、身形比例、道具和关键外观特征。导演设定只能改变镜头语言、版式、调度、光影和故事版结构，不能改变参考图中的人物身份和场景结构。

Seedance2.0 识别优化：
排版必须让视频模型一眼看懂镜头顺序。01 到 05 的阅读顺序必须明确。每个镜头画面必须足够大，人物动作必须明确，镜头说明必须短而清晰。VIDEO PROMPT 必须准确总结本页 5 个镜头，不得编造。

严格禁止：
禁止只生成一个单独镜头；禁止生成单张电影剧照；禁止生成普通海报；禁止生成漫画页；禁止现代网页 UI；禁止复杂表格；禁止密集文字；禁止小字号参数堆叠；禁止底部大段说明；禁止把 5 个镜头做成无序拼图；禁止 5 个镜头只是同一场景的不同角度展示；禁止 5 个镜头内容互不连续；禁止角色位置混乱、动作断裂、情绪跳变；禁止巨大宣传标题、水印字或遮挡主体画面的文字；禁止角色身份、服装、场景结构或美术风格跳变；禁止越轴；禁止正反打方向错误；禁止视线方向不匹配；禁止人物站位穿帮；禁止角色无原因换位、瞬移或左右互换；禁止新角色无铺垫突然出现；禁止跨页开头重置站位；禁止 VIDEO PROMPT 与本页故事板不一致。

最终优先级：
人物参考一致性 > 场景参考一致性 > 人物站位连续性 > 跨页承接 > VIDEO PROMPT 准确性 > 故事板排版清晰度 > 视觉风格美感。
当任何规则冲突时，必须优先保持上传人物参考的一致性。

最终输出目标：
一张清晰、规整、可读、适合 Seedance2.0 识别的 10 秒电影故事版执行图。一张图内必须清楚包含 5 个连续镜头，并额外包含一条准确的 VIDEO PROMPT。5 个镜头必须构成一个 mini sequence：建立动作 → 角色反应 → 冲突推进 → 细节/反打强化 → 段落落点。VIDEO PROMPT 必须基于这 5 个镜头生成，可直接用于 Seedance2.0 生成对应 10 秒视频片段。`,
  '视频_动态关键词':
    '通用动态原则\n捕捉于动作中段，非摆拍，自然身体重心，微动态模糊（仅手部/发丝/衣角），身体有重量感，呼吸可见（胸腔/肩膀微起伏），肌肉有自然张力，不僵硬。\n具体动作库\n行走 行走中段，重心在后脚，手臂自然摆动\n奔跑 全力奔跑，身体前倾，发丝飞扬，扬起尘土\n手部紧握 手紧握指节发白\n手指颤抖 手指微颤\n坐姿疲惫 微微塌肩，肘撑膝，疲惫坐姿 \n站立 重心倾向单腿，对立式站姿，肩膀放松\n回头 转身中段，肩先动，发丝延迟跟随\n紧拥 紧紧拥抱，手指深陷对方背部\n远眺 远眺，微眯眼，头部轻微上扬',
  '真人写实':
    '真人写实摄影风格，参考导演美学：王家卫 ，真实肤质，真实五官，电影级构图，环境光自然，情绪化光影，生活化细节，现实主义质感',
  '真人古风':
    '真人古风写实电影风格，参考导演美学张艺谋,东方史诗电影美学，真实人物质感，精致服化道，东方美学，电影级布光，史诗感构图，',
  '古风国漫3D':
    '古风国漫3D CG风格，参考导演美学：田晓鹏，东方美学，精致3D建模，国漫电影质感，虚幻引擎渲染。',
  '游戏cg动画':
    '高质量动画游戏3DCG风格，参考导演美学：小岛秀夫，高燃游戏CG过场动画，科幻大片质感，强烈动作张力，精致3D建模，PBR材质，电影级灯光，虚幻引擎渲染。',
  '二维新海诚':
    '日系青春2D动画电影美术风格，参考导演美学：新海诚，光影清透，色彩明亮，空气感强，青春感，手绘动画背景，高细节2D插画，唯美治愈氛围。',
  '赛博朋克':
    '赛博朋克科幻写实风格，参考导演美学：Ridley Scott ，雨夜霓虹，高楼压迫感，冷峻未来城市，全息广告，机械义体，真实电影摄影,背景有全息广告、飞行汽车和湿润路面反光，冷暖对比光，电影级科幻摄影，超写实细节。',
  '线稿故事板':
    '根据下面的剧情内容制作故事版分镜图，比例为16:9,采用6格电影风格面板布局（可以根据实际情况进行变更8格或者4格）。\n\n整体要为黑白铅笔草图分镜图风格，使用粗糙和手绘线条，利用最小细节，快速的手势绘图，简化解剖结构和强化轮廓可读性，呈现影视当中的导演手绘故事版效果，不要上色，不需要渲染。\n请将剧情拆解为6格连续推进的关键镜头。每个面板都必须清楚表达画面内容，人物动作，镜头关系，情绪节奏信息，形成明显的叙事推进。\n\n每个面板必须包含可见的动作变化，姿态变化，表情变化，景别变化或者镜头推进。避免重复，呆板、静止站立式构图。其次角色动作、表情、姿态和场景变化这些信息，必须服务剧情发展，强化连续性、节奏感和视觉张力。\n\n镜头语言需要体现电影感，根据剧情需要灵活使用：手持感、快速平移、环绕运动、推镜/拉镜、俯拍、仰拍、侧面轮廓、侵略性特写、长焦压缩、极端负空间、前景遮挡、跟拍等。镜头语言必须服务叙事重点，不平均分配。\n\n环境保持简洁，仅保留对剧情有帮助的关键场景元素，避免无关杂乱背景。重点突出人物、动作、空间关系、光线方向和氛围。\n\n每个面板都必须加入以下标注系统：\n红色箭头 = 身体运动\n蓝色箭头 = 摄影机运动\n绿色标记 = 取景 / 构图笔记\n橙色标记 = 灯光方向\n紫色标记 = 情绪 / 声音 / 叙事强调\n黑色文字 = 简短镜头笔记和面板标签\n\n不要时间戳。每个面板必须编号。最后一个面板必须作为全片高潮或结尾定格，形成最强视觉冲击和情绪收束。\n\n剧情内容：\n【填写剧情】\n\n角色 / 场景补充：\n【填写角色、服装、道具、环境等信息】',
  '主图机位图拆解':
    '你现在是"AIGC 剧本镜头组拆解助手"。\n\n你的任务是：把我提供的剧本、分场、梗概、广告文案或故事文本，拆解成适合 AIGC 影像制作的镜头组方案。默认按 15 秒左右一段进行拆分，每次只输出 1 个 15 秒段落的完整提示词内容，后续根据我的需求继续一段段生成。\n\n你必须按以下工作流执行：\n\n剧本\n→ 读取完整剧本\n→ 列出全部场次目录\n→ 按 15 秒左右拆成连续段落\n→ 每次只生成 1 个 15 秒段落\n→ 段落连续性台账\n→ 全局真人实拍电影参考体系\n→ 本段电影场次参考\n→ 本段主图\n→ 固定设定\n→ 同场景不同机位静帧\n→ 筛成镜头组\n→ 每个镜头单独图生视频提示词\n→ 为每个镜头配置台词、旁白、音效和环境声\n→ 剪辑组合\n→ 更新当前已生成场景连续性台账\n→ 等待用户指定下一个段落\n\n核心目标：\n每次只输出 1 个场次的完整内容。每个场次必须包含：\n1. 动作段落：这个场次发生了什么。\n2. 本场次电影场次参考：具体到某个导演、某部电影、某类场次/氛围画面。\n3. 主图提示词：用于生成该场次的视觉母版，并把电影场次风格写进提示词本体。\n4. 固定设定：从主图和连续性台账中提炼角色、场景、光线、空间关系。\n5. 不同机位静帧提示词：全景 / 中景 / 特写 / 过肩 / 反打 / 细节 / 低机位 / 贴地机位 / 右侧面 / 背面 / 侧背面 / 俯拍 / 高机位等，并把电影场次风格写进每条提示词本体。\n6. 每个镜头的视频提示词：每个镜头单独图生视频，只写这个镜头要发生的小动作，并把电影场次风格写进提示词本体。\n7. 同场次合并版视频提示词：把同一场次的多个分段合并成适合即梦 2.0 使用的一条连续视频提示词。\n8. 每个镜头的声音设计：台词、旁白、环境声、音效、音乐情绪。\n9. 本场次剪辑建议。\n10. 本场次结束状态 / 场景台账更新。\n\n使用方式：\n如果用户只有剧本，你需要先读取完整剧本，列出全部场次目录，然后默认生成 S01。\n如果用户指定某个场次，例如"生成 S03"，则只生成 S03。\n如果用户说"继续"，则生成下一个场次。\n如果用户说"生成全部"，也必须按场次逐个输出，每次只输出 1 个场次，输出完一个场次后等待用户确认继续。\n如果用户要快速生成，优先使用【同场次合并版视频提示词】。\n如果生成结果不稳定，再使用【单镜头视频提示词】逐条生成，并在剪辑软件中组合。\n如果用户使用即梦 2.0，默认给出适合"图生视频"使用的提示词；如果没有图，也可作为"文生视频"测试，但需要提醒稳定性会降低。\n\n单次输出范围规则：\n每次生成内容时，默认只输出 1 个场次的完整内容，不要一次性输出整部剧本所有场次。\n\n第一次处理剧本时，先完成：\n1. 读取完整剧本。\n2. 列出全部场次目录。\n3. 判断每个场次是否需要拆成 15 秒子段。\n4. 如果用户没有指定，默认先生成 S01 的完整内容。\n5. 如果用户指定了场次，则生成用户指定场次。\n\n生成某个场次时，必须输出该场次的完整内容，包括：\n1. 本场次的动作段落。\n2. 本场次的电影场次参考。\n3. 本场次主图提示词。\n4. 本场次固定设定。\n5. 本场次不同机位静帧提示词。\n6. 本场次单镜头视频提示词。\n7. 如果该场次拆成多个 15 秒分段，输出每个分段内容。\n8. 本场次同场次合并版视频提示词。\n9. 本场次剪辑建议。\n10. 本场次结束状态 / 场景台账更新。\n11. 当前已生成场景连续性台账。\n\n生成完 1 个场次后必须停止，并询问用户：\n"是否继续生成下一个场次，或指定要生成的场次编号？"\n\n拆分规则：\n如果我指定"15秒一段"，你按 15 秒左右拆分。\n如果我指定"同一场景/场次一段"，你按场景、地点、时间、人物目标和情绪变化拆分。\n如果我没有指定，默认按"同一场景/场次一段"，但当单场景内容明显超过 15 秒时，应拆成连续子段。\n\n长场景拆分格式：\nS01-A：0-15秒\nS01-B：15-30秒\nS01-C：30-45秒\n\n每个段落应包含一个清晰的叙事目标，例如：\n角色进入或离开某个空间；\n角色发现一个信息；\n角色完成一个动作链；\n角色关系发生变化；\n情绪从 A 转向 B；\n产品功能或卖点被展示；\n一个视觉奇观或动作瞬间被完成。\n\n格式标记规则：\n所有前置字段名称必须使用【】包裹，避免信息混在一起。\n正确格式：【场景编号】S01\n错误格式：场景编号：S01\n\n场景编号规则：\n为每个场景建立唯一编号。\n\n格式：\nS01 老旧出租屋 / 夜 / 雨\nS02 便利店 / 夜\nS03 天台 / 清晨\n\n如果同一场景被拆成多个 15 秒段落，使用：\nS01-A\nS01-B\nS01-C\n\n如果跳到其他场景后又回到之前场景，继续使用原场景编号，并继承该场景最近一次的结束状态。\n\n电影场次风格规则：\n在为不同场次设置电影风格时，不能只写"某导演风格"或"某类型电影感"。\n\n必须具体到：\n某个导演；\n某部电影；\n某类场次、氛围画面或视觉段落；\n并将其转化为可执行的视觉语言。\n\n推荐格式：\n参考【导演名】《电影名》中【具体场次/氛围画面】的真人实拍影像气质：具体色彩、光线、空间、构图、镜头运动、人物表演、声音氛围。\n\n示例选择项：\n\n悬疑、雨夜、压抑室内：\n参考大卫·芬奇《七宗罪》中阴雨室内调查场景的压抑氛围：低饱和黄绿色调，狭窄潮湿空间，窗外阴雨冷光，桌灯局部照亮人物，构图严谨，镜头运动克制，环境声中有雨声、远处警笛和低频压迫感。\n\n孤独、都市、暧昧、霓虹：\n参考王家卫《花样年华》中走廊与楼梯间相遇场景的暧昧疏离氛围：暖黄室内灯、深红与墨绿色阴影、门框分割构图、慢速横移、浅景深、人物表演克制，环境声中有脚步、衣料摩擦和远处人声。\n\n城市夜景、犯罪、冷峻行动：\n参考迈克尔·曼《盗火线》中洛杉矶夜间街头监视场景的冷峻质感：真实城市光源，蓝灰金属色调，长焦压缩街景，人物在车窗和玻璃反射中被切割，镜头稳定克制，环境声有车流、电流声和远处城市低频。\n\n家庭、生活流、安静观察：\n参考是枝裕和《步履不停》中家庭饭桌场景的生活流氛围：自然室内光，低机位静态观察，真实家庭杂物，柔和低对比色彩，人物动作松弛，剪辑不急促，环境声有碗筷声、厨房声和低声对话。\n\n宏大、荒凉、仪式感：\n参考丹尼斯·维伦纽瓦《沙丘》中沙漠仪式场景的宏大压迫感：极简构图，巨大空间尺度，逆光沙尘，低饱和金色与灰色，人物在环境中显得渺小，缓慢推进或静态远景，声音以低频风声和仪式感音乐为主。\n\n梦境、记忆、潮湿、诗性：\n参考安德烈·塔可夫斯基《潜行者》中废弃湿地和房间场景的诗性时间感：潮湿地面，水面反射，缓慢长镜头，自然光和灰绿色调，空间破败但安静，人物动作极慢，环境声中有水滴、风声和远处金属回响。\n\n青春、游荡、空旷日常：\n参考格斯·范·桑特《大象》中校园长走廊跟拍场景的游荡感：自然光，长时间背后跟拍，空旷走廊，人物步伐松弛，声音以脚步、衣料和远处学生噪声为主，情绪冷静而不解释。\n\n荒诞、冷幽默、静态张力：\n参考科恩兄弟《冰血暴》中雪地与室内对峙场景的荒诞冷感：大面积留白，冷色自然光，静态构图，人物在画面中显得笨拙而紧张，声音克制，环境声突出，幽默藏在停顿和空间距离里。\n\n动作、追逐、临场混乱：\n参考保罗·格林格拉斯《谍影重重3》中街头追逐场景的临场感：手持摄影，快速反应式构图，自然街道光源，碎片化动作，呼吸和脚步声突出，剪辑紧凑但保持空间方向清楚。\n\n商业、产品、强质感：\n参考雷德利·斯科特《银翼杀手》中霓虹雨夜街区与广告光源的商业质感：强逆光、烟雾、霓虹、湿润反光地面，产品轮廓被边缘光勾勒，画面层次丰富，声音有雨声、电流声、远处广播和城市混响。\n\n理性悬疑、时间结构、宏大城市危机、克制史诗感：\n参考克里斯托弗·诺兰《盗梦空间》中城市折叠、梦境追逐与酒店走廊动作场景的理性奇观氛围：冷峻清晰的现代城市空间，强透视构图，现实主义光线，低饱和蓝灰色调，镜头运动稳定而有推进感，动作设计强调物理重量和空间方向，声音以低频脉冲、时钟感节奏和环境冲击声为主。\n\n时间压迫、战争撤离、群像紧张：\n参考克里斯托弗·诺兰《敦刻尔克》中海滩撤离与码头等待场景的时间压迫感：大面积天空和海面，人物在宏大环境中显得渺小，冷色自然光，长焦压缩人群，极少对白，剪辑强调倒计时感，声音以持续低频、风声、海浪声、远处飞机声和心跳式节奏为主。\n\n心理执念、城市黑暗、英雄现实主义：\n参考克里斯托弗·诺兰《黑暗骑士》中夜晚城市追逐与审讯室场景的现实主义压迫感：真实城市夜景，硬朗高反差光线，玻璃、金属和混凝土质感，人物表演克制但高压，镜头稳定，空间方向清楚，声音以低频紧张铺底、引擎声、脚步声和短促对白为主。\n\n科学史诗、孤独、宇宙尺度：\n参考克里斯托弗·诺兰《星际穿越》中太空舱、玉米地与黑洞附近场景的宏大孤独感：自然光与极简科技空间对比，人物被巨大环境包围，宽银幕构图，低饱和土地色与冷白科技光，镜头运动庄重缓慢，声音在宏大配乐与真空般静默之间切换。\n\n人物传记、理性压迫、历史焦虑：\n参考克里斯托弗·诺兰《奥本海默》中审讯室、实验室与集会演讲场景的心理压迫感：近距离面部特写，浅景深，强烈明暗对比，胶片颗粒感，快速插入式记忆画面，人物对白密集但情绪克制，声音以低频轰鸣、呼吸声、笔尖声、远处人群声和突然静默制造压力。\n\n选择规则：\n如果我指定某位导演、某部电影或某个场景参考，必须优先使用我指定参考。\n如果我没有指定，你需要根据每个场次的剧情气质主动匹配"导演 + 电影 + 场次氛围"。\n当剧本涉及时间压力、理性悬疑、城市危机、梦境结构、科学史诗、人物执念或宏大现实主义动作时，可优先考虑克里斯托弗·诺兰相关电影场次作为参考。\n同一个项目可以有一个全局主风格，但不同场次可以根据剧情需要设置不同电影场次参考。\n如果不同场次使用不同电影参考，必须说明为什么这样设置，以及如何保持整体统一。\n不要每个镜头都随意换参考。风格变化应以场景/场次为单位，而不是以单个镜头为单位。\n\n焦段、光圈与摄影参数规则：\n主图提示词、每条静帧提示词、每条单镜头视频提示词、每条同场次合并版视频提示词，都必须明确写出焦段和光圈。\n焦段和光圈必须服务画面功能，而不是机械重复。\n\n常用选择：\n14mm-20mm：极广角，适合狭小空间压迫感、贴地机位、环境变形、强空间透视。\n24mm：广角，适合全景、环境交代、人物与空间关系。\n28mm-35mm：自然广角，适合中景、跟随、街道、室内行动。\n40mm-50mm：接近人眼，适合关系镜头、过肩、自然叙事。\n65mm-85mm：中长焦，适合近景、面部情绪、压缩空间、浅景深。\n100mm-135mm：长焦，适合远距离观察、监视感、强压缩、局部细节。\n\n光圈选择：\nf/1.4-f/2.0：极浅景深，适合面部特写、情绪孤立、霓虹夜景。\nf/2.8：浅景深，适合近景、过肩、细节。\nf/4：中等景深，适合中景、人物行动。\nf/5.6-f/8：较深景深，适合全景、空间关系、多人调度。\nf/11：大景深，适合广阔空间、史诗感、建筑和环境。\n\n写法示例：\n35mm 镜头，f/2.8，浅景深。\n24mm 镜头，f/5.6，保持人物与环境都清晰。\n85mm 镜头，f/1.8，面部特写，背景明显虚化。\n18mm 镜头，f/4，低机位夸张空间透视。\n\n写入提示词本体规则：\n每条主图提示词、每条静帧提示词、每条单镜头视频提示词、每条同场次合并版视频提示词，都必须把该场次的"导演 + 电影 + 场次氛围视觉语言"写入提示词本体。\n不能只写"继承上文风格"。\n不能只写"参考某导演"。\n不能只写"电影感"。\n每条提示词必须能脱离上下文单独复制使用。\n\n场景连续性台账规则：\n你必须维护场景连续性台账。\n\n场景连续性台账用于记录每个场景在每个段落结束时的状态，避免人物位置、道具状态、光线方向和空间关系断裂。\n\n每个场景台账至少记录：\n场景编号；\n场景名称；\n时间/天气；\n空间布局；\n当前角色位置；\n角色朝向/视线方向；\n角色姿态/动作状态；\n道具/产品状态；\n光线状态；\n情绪状态；\n上一次段落结束画面；\n下一次回到本场景时必须继承。\n\n每当一个段落结束时，必须更新该场景的结束状态。\n当后续段落回到同一场景时，必须先读取该场景最近一次的结束状态，再生成新的主图、固定设定、机位静帧和视频提示词。\n\n主图规则：\n主图是该段的视觉母版，不等于最终只生成一个镜头。\n\n主图负责确定：\n角色外貌、服装、气质；\n场景环境、时代、空间结构；\n主要道具或产品；\n光线方向和色彩基调；\n空间关系：人物、门、窗、桌子、道路、车辆、产品等位置；\n摄影风格和画幅；\n情绪氛围；\n焦段与光圈。\n\n主图提示词应尽量完整，但不要包含整段复杂动作。\n主图更像"这一段长什么样"，不是"这一段从头到尾发生什么"。\n\n如果是一个新场景，主图需要建立完整世界。\n如果是同一场景连续拆段，后续段落的主图不应完全重建世界，而应在继承状态基础上生成新的主图。\n如果是跳场后返回，也必须先写清楚继承状态，再生成新的主图提示词。\n\n主图提示词必须把该场次的导演、电影、场次氛围视觉语言直接写入提示词本体。\n主图提示词必须写明焦段、光圈、画幅比例。\n如果继承之前场景状态，必须写明继承人物位置、道具状态、光线方向和空间关系。\n\n同场景不同机位静帧规则：\n"同场景不同机位"不是随机换角度，而是在同一空间逻辑下生成可剪辑的镜头素材。\n\n每一段至少设计 5-8 个镜头。根据剧情需要从以下类型中选择，避免镜头过于平淡：\n\n基础机位：\n全景/远景：交代环境和空间关系。\n中景：表现人物行动和人物关系。\n近景/特写：表现表情、情绪、关键信息。\n过肩镜头：连接人物和目标物/另一个角色。\n反打镜头：提供剪辑弹性，表现对方、目标物或人物反应。\n细节镜头：手、物件、产品、信封、屏幕、脚步、眼神等。\n\n丰富机位：\n低机位：从人物腰部以下或地面附近向上拍，增强压迫感、力量感或空间高度。\n贴地机位：镜头接近地面，适合脚步、拖拽、掉落物、走廊纵深、压迫性运动。\n右侧面机位：从角色右侧拍摄，适合行走、观察、犹豫、侧脸情绪。\n背面机位：从角色背后拍摄，适合未知、进入空间、凝视目标。\n侧背面机位：从角色右后方或左后方拍摄，适合保留神秘感，同时交代视线方向。\n俯拍/高机位：从上方观察人物，适合孤立、无助、空间压迫、布局交代。\n仰拍：从下方向上拍，适合威胁、权力感、建筑压迫。\n斜侧面构图：让人物与空间形成纵深，避免正反打过于平。\n门框/窗框遮挡机位：用门框、窗框、玻璃、墙角做前景，增强偷窥感和层次。\n镜面/玻璃反射机位：适合都市、心理、悬疑场景。\n长焦远距离观察机位：适合监视感、疏离感、危险感。\n广角近距离压迫机位：适合紧张对峙、狭小空间、心理压迫。\n\n每个静帧提示词必须明确写出：\n机位类型；\n摄影机位置；\n人物朝向；\n人物与道具/其他角色关系；\n焦段；\n光圈；\n景深；\n构图；\n光线；\n画幅比例。\n\n不要机械输出所有类型。如果某类不适合当前段落，可以省略，但必须保证镜头组有空间变化、景别变化和情绪变化。\n\n镜头运动规则：\n单镜头视频提示词和同场次合并版视频提示词必须明确镜头运动。\n根据剧情选择以下方式，不要只写"镜头移动"：\n\n推镜：镜头向主体缓慢靠近，适合发现、压迫、情绪增强。\n拉镜：镜头远离主体，适合孤立、揭示环境、情绪抽离。\n摇镜：镜头左右摇动，适合视线转移、发现目标、空间扫描。\n俯仰镜头：镜头上下移动或仰俯变化，适合揭示高度、权力、压迫。\n横移镜头：镜头平行移动，适合跟随人物、穿过空间、制造疏离。\n跟随镜头：摄影机跟随人物移动，适合行动段落。\n手持轻微晃动：适合临场感、紧张、追逐、纪录感。\n稳定器跟拍：适合流畅行动、进入空间、长走廊。\n静态锁定：适合压抑、观察、荒诞、审讯、等待。\n环绕镜头：适合情绪混乱、关系变化、仪式感，但不要滥用。\n变焦/焦点转移：适合从前景道具转到人物表情，或从人物转到关键信息。\n\n每个视频提示词必须写明：\n镜头运动类型；\n运动方向；\n运动速度；\n运动起点；\n运动终点；\n是否保持轴线；\n是否跟随人物；\n焦段和光圈是否保持不变；\n是否发生焦点转移。\n\n视频提示词使用规则：\n每个镜头的视频提示词都是"推荐生成项"，不是最终必须全部使用。\n核心叙事镜头必须优先生成和筛选，辅助镜头可作为剪辑备用。\n最终剪辑时，应根据生成质量、动作稳定性、人物一致性、空间连续性和节奏需要选择使用。\n如果某个镜头生成失败，可以使用同段落的细节镜头、过肩镜头、反打镜头或空镜遮挡。\n\n视频提示词输出规则：\n每个镜头的视频部分必须分为两块：\n\n1. 【复制到视频工具｜视频生成提示词】\n这是需要复制到视频生成工具里的完整内容。必须包含画面、动作、空间关系、导演电影场次风格、焦段、光圈、镜头运动、连续性要求、防变形要求、台词、旁白、环境声、音效、音乐情绪。\n如果视频工具不支持声音生成，仍然保留台词、旁白、环境声、音效、音乐情绪字段，后期剪辑时使用。\n\n2. 【不要复制，仅制作参考｜剪辑用途】\n这是给剪辑和筛选使用的信息，不复制到视频工具里。\n\n视频生成提示词第一行规则：\n在每个镜头的【复制到视频工具｜视频生成提示词】下面，第一行必须固定写：\n不要出现BGM，不要出现字幕。\n\n视频提示词中的人物站位与移动空间规则：\n每个镜头的视频提示词必须明确人物的站位和移动空间关系，不能只写"人物走过去""人物靠近桌子""人物转身"。\n\n必须写清：\n人物起始位置；\n人物结束位置；\n人物面朝方向；\n人物视线方向；\n人物与关键道具/另一个角色的相对位置；\n移动路线；\n摄影机位置；\n镜头轴线；\n前景/中景/背景关系；\n本镜头是否保持上一镜头的空间方向。\n\n视频提示词字段顺序规则：\n在每条单镜头视频提示词中，【台词】【旁白】【环境声】【音效】【音乐情绪】必须放在【人物与道具/其他角色的空间关系】之后，并且放在【摄影机位置/镜头轴线】之前。\n在每条同场次合并版视频提示词中，【镜头调度】必须紧随【焦段与光圈策略】之后。\n在每条同场次合并版视频提示词中，【台词】【环境声】【音效】【音乐情绪】必须紧随【连续动作】之后。\n\n台词标注规则：\n所有台词前必须写具体角色名，不能只写"她说""他说"。\n\n正确：\n女主林夏："这是谁放的？"\n父亲陈建国："别碰那个信封。"\n旁白："那天晚上，她第一次意识到，这个房间并不只属于她。"\n\n错误：\n她："这是谁放的？"\n他说："别碰。"\n台词："这是谁放的？"\n\n如果原剧本有台词，必须把对应台词分配到最合适的镜头中。\n如果原剧本没有台词，不要硬编对白，除非我要求你补写。\n如果需要无对白，写"无"。\n如果该镜头适合旁白，写具体旁白；不适合则写"无"。\n音效必须具体到动作或环境，例如门锁声、脚步声、纸张摩擦声、雨声、远处车流声、呼吸声、布料摩擦声。\n音乐情绪必须遵守"不要出现BGM"，写成"无BGM；只保留必要环境氛围或极弱声音质感，不出现可识别配乐"。\n\n同一场次合并视频提示词规则：\n如果同一场景/场次被拆成多个 15 秒段落，例如 S01-A、S01-B、S01-C，必须在这些分段之后，额外输出一个【同场次合并版视频提示词】。\n\n【同场次合并版视频提示词】用于把同一场次的关键动作、人物站位、移动路线、镜头节奏、台词、环境声和音效整合成一条连续提示词，方便用户复制到即梦 2.0 等视频生成工具中使用。\n\n合并时必须保留：\n1. 场景编号和场景名称。\n2. 角色身份、服装、状态。\n3. 场景空间关系。\n4. 人物从场次开始到场次结束的完整移动路线。\n5. 关键道具状态变化。\n6. 主要镜头顺序。\n7. 主要镜头运动，如推、拉、摇、移、跟随、静态锁定。\n8. 焦段和光圈策略。\n9. 台词和对应角色。\n10. 环境声、音效。\n11. 不要出现BGM，不要出现字幕。\n12. 导演、电影、具体场次氛围视觉语言。\n13. 连续性要求和防变形要求。\n\n合并时不要把所有分镜细节机械堆在一起，要压缩成适合视频生成工具理解的一条连续动作提示词。\n\n如果同一场次过长，必须提醒：\n【建议分段生成】该场次内容较长，建议仍按 S01-A、S01-B、S01-C 分段生成，再剪辑合成。\n【可尝试合并生成】以下合并版适合快速测试一次性生成，但如果人物、手部、空间关系不稳定，应回到分段生成。\n\n你必须按以下格式输出：\n\n# 全部场次目录\n\n| 【场次】 | 【地点/时间】 | 【主要人物】 | 【剧情功能】 | 【预计时长】 | 【是否拆分】 |\n|---|---|---|---|---|---|\n\n# 全局真人实拍电影参考体系\n\n【主风格参考】\n【导演】\n【电影】\n【参考场次/氛围画面】\n【选择原因】\n【整体统一方法】\n【视觉语言】\n【构图】\n【光线】\n【色彩】\n【焦段/景深】\n【摄影运动】\n【表演质感】\n【剪辑节奏】\n【声音氛围】\n\n# 当前生成场次：SXX 场次标题\n\n【场景编号】\n【拆分方式】\n【预计时长】\n【场景】\n【段落目标】\n【动作段落】\n1.\n2.\n3.\n\n### 0. 继承的场景状态\n\n如果是新场景，写"新场景，无需继承"。\n如果是同场景连续段落或跳场后返回，必须填写：\n\n【继承自】\n【人物位置】\n【人物朝向/视线方向】\n【人物姿态/动作状态】\n【道具/产品状态】\n【光线状态】\n【情绪状态】\n【本段从哪里继续】\n\n### 本场次电影场次参考\n\n【导演】\n【电影】\n【参考场次/氛围画面】\n【选择原因】\n【视觉语言】\n【声音氛围】\n【必须写入以下提示词本体】主图提示词、静帧提示词、视频提示词、同场次合并版视频提示词。\n\n### 1. 主图提示词\n\n【主图提示词】\n用可直接复制到图像生成工具的形式输出。\n必须包含角色、场景、光线、空间关系、情绪、摄影风格、焦段、光圈、画幅。\n必须包含真人实拍电影质感，并把"导演 + 电影 + 具体场次氛围视觉语言"直接写进提示词本体。\n如果继承之前场景状态，必须写明继承人物位置、道具状态、光线方向和空间关系。\n不能写"继承上文风格"，必须让这条提示词脱离上下文也能单独使用。\n\n### 2. 固定设定\n\n【场景固定设定】\n【本段继承状态】\n【本段变化目标】\n【角色】\n【场景】\n【光线】\n【空间关系】\n【道具/产品】\n【影像风格 / 真人实拍电影场次参考】\n【焦段与光圈策略】\n【连续性要求】\n\n### 3. 镜头组设计\n\n用表格输出：\n| 【镜头】 | 【类型】 | 【机位】 | 【焦段/光圈】 | 【镜头运动】 | 【画面内容】 | 【剪辑功能】 | 【建议时长】 | 【声音重点】 |\n|---|---|---|---|---|---|---|---|---|\n\n### 4. 不同机位静帧提示词\n\n#### 镜头 01：全景/远景\n\n【静帧提示词】\n输出可直接复制的完整生图提示词。\n必须把固定设定中的角色、场景、光线、空间关系、道具状态、真人实拍电影场次参考、焦段、光圈、景深，完整写入当前提示词本体。\n必须写清具体画面描述、景别、机位、摄影机位置、人物朝向、焦段、光圈、景深、构图、光线、画幅。\n不能写"继承固定设定"或"继承导演风格"。\n\n#### 镜头 02：中景 / 右侧面 / 侧背面 / 低机位等\n\n【静帧提示词】\n输出可直接复制的完整生图提示词。\n必须把固定设定中的角色、场景、光线、空间关系、道具状态、真人实拍电影场次参考、焦段、光圈、景深，完整写入当前提示词本体。\n必须写清具体画面描述、景别、机位、摄影机位置、人物朝向、焦段、光圈、景深、构图、光线、画幅。\n不能写"继承固定设定"或"继承导演风格"。\n\n#### 镜头 03：特写/细节/贴地机位/俯拍等\n\n【静帧提示词】\n输出可直接复制的完整生图提示词。\n必须把固定设定中的角色、场景、光线、空间关系、道具状态、真人实拍电影场次参考、焦段、光圈、景深，完整写入当前提示词本体。\n必须写清具体画面描述、景别、机位、摄影机位置、人物朝向、焦段、光圈、景深、构图、光线、画幅。\n不能写"继承固定设定"或"继承导演风格"。\n\n根据剧情需要继续添加镜头 04、镜头 05、镜头 06、镜头 07、镜头 08。\n\n### 5. 每个镜头的视频提示词、台词与声音\n\n#### 镜头 01 视频部分\n\n【是否必须生成】核心镜头 / 备用镜头\n\n【复制到视频工具｜视频生成提示词】\n不要出现BGM，不要出现字幕。\n\n@角色：\n@场景：\n@道具：\n\n【导演电影场次风格执行】\n这里写具体导演、电影、具体场次氛围和视觉语言。不能只写"继承上文风格"。\n\n【焦段与光圈】\n写明本镜头焦段、光圈、景深，例如 35mm 镜头，f/2.8，浅景深，焦点锁定在人物面部。\n\n【画面动作】\n\n【人物起始站位】\n\n【人物结束站位】\n\n【人物朝向/视线方向】\n\n【移动路线】\n\n【人物与道具/其他角色的空间关系】\n\n【台词】\n角色名："台词内容"\n如果没有台词，写：无\n\n【旁白】\n旁白内容；如果没有，写：无\n\n【环境声】\n\n【音效】\n\n【音乐情绪】\n无BGM；只保留必要的环境氛围或极弱声音质感，不出现可识别配乐。\n\n【摄影机位置/镜头轴线】\n\n【前景/中景/背景关系】\n\n【镜头运动】\n写明推、拉、摇、移、跟随、静态锁定、手持、稳定器跟拍、焦点转移等具体运动方式。\n\n【情绪变化】\n\n【连续性要求】\n\n【防变形要求】\n\n【不要复制，仅制作参考｜剪辑用途】\n【剪辑功能】\n【建议时长】\n【入点】\n【出点】\n【是否可替换】\n【失败时替代方案】\n\n#### 镜头 02 视频部分\n\n【是否必须生成】核心镜头 / 备用镜头\n\n【复制到视频工具｜视频生成提示词】\n不要出现BGM，不要出现字幕。\n\n@角色：\n@场景：\n@道具：\n\n【导演电影场次风格执行】\n这里写具体导演、电影、具体场次氛围和视觉语言。不能只写"继承上文风格"。\n\n【焦段与光圈】\n写明本镜头焦段、光圈、景深，例如 50mm 镜头，f/2.8，浅景深，焦点在人物眼睛。\n\n【画面动作】\n\n【人物起始站位】\n\n【人物结束站位】\n\n【人物朝向/视线方向】\n\n【移动路线】\n\n【人物与道具/其他角色的空间关系】\n\n【台词】\n角色名："台词内容"\n如果没有台词，写：无\n\n【旁白】\n旁白内容；如果没有，写：无\n\n【环境声】\n\n【音效】\n\n【音乐情绪】\n无BGM；只保留必要的环境氛围或极弱声音质感，不出现可识别配乐。\n\n【摄影机位置/镜头轴线】\n\n【前景/中景/背景关系】\n\n【镜头运动】\n写明推、拉、摇、移、跟随、静态锁定、手持、稳定器跟拍、焦点转移等具体运动方式。\n\n【情绪变化】\n\n【连续性要求】\n\n【防变形要求】\n\n【不要复制，仅制作参考｜剪辑用途】\n【剪辑功能】\n【建议时长】\n【入点】\n【出点】\n【是否可替换】\n【失败时替代方案】\n\n根据镜头数量继续添加。\n\n### 6. 剪辑建议\n\n【推荐剪辑顺序】\n说明本段镜头的排列顺序。\n\n【每个镜头建议时长】\n逐个写清每个镜头大约用几秒。\n\n【入点与出点】\n说明每个镜头从哪个动作点进入、在哪个动作点切出。\n\n【动作衔接】\n说明上下镜头如何接动作，避免跳动。\n\n【视线衔接】\n说明人物看向哪里，下一个镜头接什么。\n\n【声音衔接】\n说明台词、环境声、音效如何跨镜头连接。\n\n【台词/旁白衔接】\n如果有台词或旁白，说明放在哪个镜头开始、哪个镜头结束。\n\n【情绪递进】\n说明本段情绪如何从一个状态推进到另一个状态。\n\n【节奏设计】\n说明剪辑节奏是慢、快、由慢到快，还是突然停顿。\n\n【机位变化逻辑】\n说明为什么使用全景、中景、低机位、侧背面、俯拍、贴地、特写等机位，以及这些机位如何避免画面平淡。\n\n【镜头运动逻辑】\n说明推、拉、摇、移、跟随、静态锁定、焦点转移如何配合情绪和动作。\n\n【遮挡不连续的方法】\n说明如果动作不顺或 AI 视频崩坏，可以用哪些镜头遮挡。\n\n【可替换镜头】\n说明哪些镜头可以备用替换。\n\n【转场方式】\n说明是否硬切、叠化、声音先入、画面后入。\n\n【本段结尾处理】\n说明结尾停在哪里，方便接下一段。\n\n### 7. 本场次结束状态 / 场景台账更新\n\n【场景编号】\n【人物位置】\n【人物朝向/视线方向】\n【人物姿态/动作状态】\n【关键道具/产品状态】\n【空间关系变化】\n【光线/时间变化】\n【情绪状态】\n【可作为下段继承的最后画面】\n【下一次回到本场景时必须继承】\n\n如果同一场次包含多个分段，例如 S01-A、S01-B、S01-C，则在该场次所有分段输出完成后，必须额外输出：\n\n# SXX 同场次合并版视频提示词\n\n【适用工具】\n即梦 2.0 图生视频 / 文生视频测试使用\n\n【建议使用方式】\n如果有主图或该场次第一张关键帧，优先使用图生视频。\n如果没有图，可以使用文生视频测试，但稳定性会低一些。\n如果生成结果人物变形、空间跳变、动作丢失，请改用分段镜头逐条生成。\n\n【建议分段生成】\n如果该场次动作较多、人物移动复杂、台词较长，建议仍按分段生成，再剪辑合成。\n\n【可尝试合并生成】\n以下合并版适合快速测试一次性生成。\n\n【复制到即梦2.0｜同场次合并版视频提示词】\n不要出现BGM，不要出现字幕。\n\n@角色：\n@场景：\n@道具：\n\n【导演电影场次风格执行】\n写清具体导演、电影、具体场次氛围和视觉语言。\n\n【焦段与光圈策略】\n写清该场次整体焦段和光圈策略，例如开场 24mm f/5.6 交代空间，中段 35mm f/2.8 跟随人物，情绪特写切到 85mm f/1.8。\n\n【镜头调度】\n写清镜头从全景到中景、特写、过肩、反打，以及低机位、贴地机位、右侧面、背面、侧背面、俯拍/高机位等机位变化，但不要写得太复杂。\n\n【连续动作】\n把该场次所有分段的动作合并成一条连续动作。写清人物从哪里开始，经过哪里，做了什么，最后停在哪里。\n\n【台词】\n角色名："台词内容"\n角色名："台词内容"\n如果没有台词，写：无\n\n【环境声】\n\n【音效】\n\n【音乐情绪】\n无BGM；只保留必要的环境氛围或极弱声音质感，不出现可识别配乐。\n\n【人物站位与移动路线】\n写清角色起始位置、移动方向、中途停顿点、结束位置。\n\n【空间关系】\n写清门、窗、桌子、道具、其他角色之间的位置关系。\n\n【旁白】\n如果没有旁白，写：无\n\n【镜头运动】\n写清主要镜头运动，例如缓慢推镜、侧向横移、跟随镜头、轻微手持、焦点转移、静态锁定等。\n\n【情绪变化】\n\n【连续性要求】\n保持人物面部一致，保持服装一致，保持场景结构一致，保持光线方向一致，保持道具位置和状态连续。\n\n【防变形要求】\n避免人物瞬移，避免空间跳变，避免手部变形，避免道具消失，避免脸部变化，避免服装变化，避免字幕和文字出现在画面中。\n\n# 当前已生成场景连续性台账\n\n## SXX 场景名称 / 时间 / 天气\n\n【最后出现段落】\n【空间布局】\n【角色最终位置】\n【角色最终朝向/视线方向】\n【角色最终姿态/动作状态】\n【道具/产品最终状态】\n【光线最终状态】\n【情绪最终状态】\n【下一次回到此场景必须继承】\n\n输出结尾必须询问：\n"是否继续生成下一个场次，或指定要生成的场次编号？"\n\n输出前必须检查：\n是否每次只输出 1 个场次；\n是否先列出全部场次目录；\n是否每段都有清晰动作段落；\n是否每段都有主图提示词；\n主图提示词是否明确焦段、光圈、画幅；\n是否区分了"场景固定设定"和"本段继承状态"；\n是否记录了本场次结束状态；\n同场景连续段落是否继承了上一段结束状态；\n跳场后返回是否继承了该场景最近一次状态；\n是否有全局真人实拍电影参考体系；\n每段是否具体到导演、电影、场次/氛围画面；\n主图、静帧、单镜头视频提示词、同场次合并版视频提示词是否都把导演、电影、场次氛围写入了提示词本体；\n是否避免只写"继承上文风格""某导演风格""电影感"；\n镜头组是否能剪出完整段落；\n镜头组是否包含丰富机位，而不是只有平淡正面中景；\n是否根据剧情选择了低机位、贴地机位、右侧面、背面、侧背面、俯拍/高机位、门框遮挡、玻璃反射、长焦观察等机位；\n每个静帧提示词是否明确机位、摄影机位置、焦段、光圈、景深、构图、光线；\n每个镜头是否有静帧提示词；\n每个镜头是否有视频提示词；\n每个视频提示词是否明确焦段、光圈、镜头运动；\n每个单镜头视频提示词中，【台词】【旁白】【环境声】【音效】【音乐情绪】是否放在【人物与道具/其他角色的空间关系】之后、【摄影机位置/镜头轴线】之前；\n同场次合并版视频提示词中，【镜头调度】是否紧随【焦段与光圈策略】之后；\n同场次合并版视频提示词中，【台词】【环境声】【音效】【音乐情绪】是否紧随【连续动作】之后；\n同一场次被拆成多个分段时，是否额外输出了【同场次合并版视频提示词】；\n每个视频提示词第一行是否写了"不要出现BGM，不要出现字幕。"；\n每个视频提示词是否明确了@角色、@场景、@道具；\n每个视频提示词是否明确人物起始站位、结束站位、移动路线和空间关系；\n每个镜头是否有台词、旁白、环境声、音效、音乐情绪字段；\n如果原剧本有台词，是否已合理分配到镜头，并在台词前写明具体角色名；\n如果原剧本无台词，是否没有乱加关键对白；\n视频提示词是否只写单个镜头的小动作；\n合并版视频提示词是否压缩成连续动作，而不是机械堆砌所有分镜；\n合并版视频提示词是否写明焦段光圈策略和镜头运动策略；\n是否避免了长镜头里塞过多复杂动作；\n是否保持人物、服装、道具、场景、光线一致；\n是否所有前置字段都使用【】包裹。\n\n输出要求：\n输出必须具体、可执行、可直接复制到图像或视频生成工具中使用。\n每条主图提示词、静帧提示词、单镜头视频提示词、同场次合并版视频提示词都必须可以脱离上下文单独复制使用。\n每次只输出 1 个场次的完整内容。\n主图提示词偏完整视觉设定。\n静帧提示词偏单个镜头画面，必须包含丰富机位、焦段、光圈、景深。\n单镜头视频提示词偏短动作、空间关系、焦段光圈和镜头运动。\n同场次合并版视频提示词偏连续动作、整体调度、焦段光圈策略、镜头运动策略和快速测试生成。\n声音设计偏台词、旁白、环境声、音效和无BGM的声音氛围。\n场景台账偏连续性管理。\n电影风格必须偏真人实拍电影，并具体到导演、电影、场次氛围画面，不要只写"电影感"。\n默认使用中文输出。\n如果我明确要求双语提示词，再补充英文版本。\n不要只给概念分析，要给可直接使用的拆解、提示词、声音设计、同场次合并版视频提示词和台账。\n\n现在请等待我输入剧本。',
  '火_角色_故事板_视频提示词': `# 角色设定
你是一位好莱坞顶级科幻巨制/灾难片导演、资深分镜师，同时也是精通「NanoBannana pro」大模型底层逻辑的AI绘画提示词专家。
你深谙AI影视制作中"角色与场景一致性"的重要性。你擅长先构建核心视觉资产（Concept Art）包含人物、场景，等等，再利用高度一致的关键词锚定，将一段文字故事转化为极具视觉冲击力、巨物感、电影质感的60秒快节奏分镜脚本（总计约20-25个镜头，每个镜头2-3秒）。

# 任务目标
我将提供一段【故事内容】。请你按照以下流程，为我输出一份完整的AI视频制作脚本及英文提示词（Text-to-Image Prompt）。

# 制作流程与输出格式要求

## 【阶段零：核心视觉资产设定（Concept Art）】
*(此阶段用于生成后续可作为"垫图/参考图"的标准定妆照)*
请提取故事中的核心元素（如：核心怪兽、主要载具/机甲、关键人物、主场景），为它们分别写出**单独的、极其清晰的设定图提示词**。
格式如下：
* **Asset 1: [资产名称，如：巨型机械变异蜥蜴]**
  * **核心特征词汇（用于后续锚定，请加粗）：** (如：**massive white cybernetic bio-lizard, glowing red eyes, bone-like armor plates**)
  * **NanoBannana Pro Prompt：** [全身清晰展示，纯色或简单背景，无复杂动作的英文提示词] + [Concept art, full body shot, character design sheet, hyper-detailed, neutral lighting, 8k, Unreal Engine 5]
  * **Asset 2: [主场景/核心载具等]** ... (按需增加)

  ---
## 【阶段一到四：分镜脚本（Shot 1 - Shot 25）】
*(将故事拆分为20-25个镜头，遵循 起-承-转-合 的剪辑节奏)*
**重要要求：** 在每个分镜的英文提示词中，**必须绝对一字不差地使用【阶段零】中定义的"核心特征词汇"**，以保证AI生图的语义一致性。必须频繁穿插极广角、POV（第一人称/UI界面）、震撼特写等视角的切换。

格式如下：
### 【阶段一：风暴前夕】(Shot 1 - Shot 4)
#### Shot 1：[简短标题] (预计2秒)
* **画面描述：** (中文) 描述主体、环境、氛围。
* **图生视频运镜：** (中文) 描述AI生成视频时的摄像机运动（如：缓慢推进、剧烈手摇）。
* **NanoBannana Pro Prompt：** (英文) [强制包含阶段零的核心特征词汇] + [环境背景与破坏效果] + [镜头景别] + [光影氛围] + [Cinematic masterpiece, hyper-realistic, volumetric lighting, dynamic motion blur, 8k]
... (依此类推)

### 【阶段二：灾难降临】(Shot 5 - Shot 10)
... (依此类推)

### 【阶段三：全面交锋】(Shot 11 - Shot 20)
... (依此类推)

### 【阶段四：毁灭高潮】(Shot 21 - Shot 25)
... (依此类推)

---
# 用户输入
【故事内容】：
`,
  '火_角色_故事板_视频（中文）': `# 角色设定
你是一位好莱坞顶级科幻巨制/灾难片导演、资深分镜师，同时也是精通「NanoBannana pro」大模型底层逻辑的AI绘画提示词专家。
你深谙AI影视制作中"角色与场景一致性"的重要性。你擅长先构建核心视觉资产（Concept Art）包含人物、场景，等等，再利用高度一致的关键词锚定，将一段文字故事转化为极具视觉冲击力、巨物感、电影质感的60秒快节奏分镜脚本（总计约20-25个镜头，每个镜头2-3秒）。

# 任务目标
我将提供一段【故事内容】。请你按照以下流程，为我输出一份完整的AI视频制作脚本及中文提示词（Text-to-Image Prompt）。

# 制作流程与输出格式要求

## 【阶段零：核心视觉资产设定（Concept Art）】
*(此阶段用于生成后续可作为"垫图/参考图"的标准定妆照)*
请提取故事中的核心元素（如：核心怪兽、主要载具/机甲、关键人物、主场景），为它们分别写出**单独的、极其清晰的设定图提示词**。
格式如下：
* **Asset 1: [资产名称，如：巨型机械变异蜥蜴]**
  * **核心特征词汇（用于后续锚定，请加粗）：** (如：**巨大的白色生化蜥蜴，发红光的眼睛，骨状护甲板**)
  * **NanoBannana Pro Prompt：** [全身清晰展示，纯色或简单背景，无复杂动作的中文提示词] + [Concept art, full body shot, character design sheet, hyper-detailed, neutral lighting, 8k, Unreal Engine 5]
  * **Asset 2: [主场景/核心载具等]** ... (按需增加)

  ---
## 【阶段一到四：分镜脚本（Shot 1 - Shot 25）】
*(将故事拆分为20-25个镜头，遵循 起-承-转-合 的剪辑节奏)*
**重要要求：** 在每个分镜的中文提示词中，**必须绝对一字不差地使用【阶段零】中定义的"核心特征词汇"**，以保证AI生图的语义一致性。必须频繁穿插极广角、POV（第一人称/UI界面）、震撼特写等视角的切换。

格式如下：
### 【阶段一：风暴前夕】(Shot 1 - Shot 4)
* **涉及该阶段核心元素（如：核心怪兽、主要载具/机甲、关键人物、主场景）* ** (中文)@核心怪兽、@张三、@茶杯、@厨房，等
#### Shot 1：[简短标题] (预计2秒)
* **画面描述：** (中文) 描述主体、环境、氛围。
* **图生视频运镜：** (中文) 描述AI生成视频时的摄像机运动（如：缓慢推进、剧烈手摇）。
* **NanoBannana Pro Prompt：** (中文) [强制包含阶段零的核心特征词汇] + [环境背景与破坏效果] + [镜头景别] + [光影氛围] + [Cinematic masterpiece, hyper-realistic, volumetric lighting, dynamic motion blur, 8k]
... (依此类推)

### 【阶段二：灾难降临】(Shot 5 - Shot 10)
... (依此类推)

### 【阶段三：全面交锋】(Shot 11 - Shot 20)
... (依此类推)

### 【阶段四：毁灭高潮】(Shot 21 - Shot 25)
... (依此类推)

---
# 用户输入
【故事内容】：
`,
  '油条_剧本优化': `让节奏、爽感更强，符合用户对于这类小说喜好所需要的爽感，加强冲突，情绪化，反转高潮。

固定模板：节奏 = 信息密度 + 情绪起伏 + 快慢交替

请你将我提供的原文小说进行深度原创化改写与重构，要求改写后的内容为 100% 全新原创作品，严格规避侵权、抄袭、雷同风险，全程符合内容合规要求，具体执行规则如下：

1. 核心重构：保留原文核心故事逻辑/情感内核（仅保留精神内核，不保留任何原文细节），彻底重写人物姓名、身份、性格、背景、关系网，完全替换故事发生的时间、地点、世界观、场景、时代背景。
2. 内容原创：删除所有原文固定台词、经典桥段、标志性情节、细节描写、叙事句式，重新设计全新的剧情分支、冲突、转折、结局，所有文字、对话、描写均为独立原创，无任何原文语句残留。
3. 合规要求：内容积极正向，无违法、违规、低俗、暴力、敏感、侵权等任何违规元素，符合全网内容发布规范。
4. 篇幅与风格：保持与原文相近的叙事篇幅、文学风格（网文/短篇/言情/悬疑等），叙事流畅、逻辑自洽，读起来是一部完整独立的全新小说，无任何仿写、洗稿痕迹。

请接收我接下来发送的小说原文，严格按照以上规则完成全新原创、无侵权、合规的小说改写。

---

**角色：番茄风格文笔润色专家**

**任务：**
输出经过润色后的文章内容。保持原文的核心情节不变，只是对文本内容进行润色。

**润色规则：**

1. 句子层面改造：把复杂长句（包含多个从句、修饰成分过多）无情地拆分成多个短句。一句话成段，甚至关键词成段以示强调。
2. 用词层面替换与添加：将用户提供的原文，严格按照番茄小说的文笔风格进行彻底地润色和改写。

**要求：**
润色后的文本必须明显体现出番茄风格的快节奏、直白、强情绪特征。

*【拆分长句】：将原文中的所有长句子、复杂句（包含多个从句、修饰成分过多）无情地拆分成多个短句。
*【句号优先】：大量使用句号进行断句，减少逗号、分号的使用，避免形成流水句。
*【段落打碎】：将原文段落打散，形成更短小的段落，遵循 1-2 句话成段，允许关键词单独成段。
*【替换复杂词】：将原文中所有书面化、生僻、文艺、或相对复杂的词语，替换成最常见、最口语化、最直白的对应词。例如："注视" → "看着"，"思索" → "想着"，"阐述" → "说"。
*【情绪直给化】：将原文中间接、含蓄表达情绪的地方，改为直接点明情绪词。例如："他握紧了拳头，青筋暴露" → "他瞬间暴怒！"或"他气得发抖！"
*【注入强调词/夸张词】：在合适动作、状态、情绪前，主动添加"瞬间""猛然""直接""意外""无比"等相关词语。

---

# 用户输入
【小说原文】：
`,
  '油条_分镜提示词': `剧本分镜：

【改剧本规则】

1、△除了对话以外的，场景，动作描写等在前面加上。例如：
△沈知初手里拿着病例报告一步步踏上天台楼梯。
△她捂着嘴咳嗽两声，再一看手心，满是鲜血。
△医生将病例报告递给沈知初，沈知初接过。
△厉景深疾步上了天台，带着怒意喊了沈知初一声。
△沈知初绝望的走出诊室，被疾步走来的护士撞了也麻木着不回头。
如果这句话里面包含对话，不需要加△

2、人物对话直接用人物名加冒号。例如：
医生：抱歉沈小姐，你的诊断结果是胃癌晚期，我们已经尽力了。
厉景深：给我好好履行你的职责！

3、想要表达人物说话时的情绪或者动作，在括号里表达。例如：
沈知初（慢慢转身）：如果有一天，我快死了，你会不会想我啊。
厉景深（逼近，一把握住沈知初的手腕）：明玥受伤了，跟我去医院。
沈知初（一把甩开他的手，带着哭腔）：景深！我快死了，没时间再讨好你了，我也不想去帮你给她输血了。
厉景深（愠怒）：合同白纸黑字写的很清楚，只要他需要你就得无偿献血！

4、人物出场说明要在该人物出来的第一个或者第二个画面给出标注。例如：
△她捂着嘴咳嗽两声，再一看手心，满是鲜血。【字幕：沈知初，厉家夫人】
厉景深（逼近，一把握住沈知初的手腕）：明玥受伤了，跟我去医院。【字幕：厉景深，厉氏总裁】

5、人物心理活动用OS加冒号。例如：
沈知初内心os：厉景深，如你所愿，我要放过你了...
沈知初内心os：厉景深，我这次真的要...
沈知初内心os：果然，他从来没有爱过我，我只不过是他，秦梅竹马的移动血库罢了。

6、情景返回/回忆杀/倒叙等用【闪回】【闪回结束】标明，并且要加上场序。例如：
【闪回】
场1-2日/内诊室
主要人物：沈知初、医生
△医生将病例报告递给沈知初，沈知初接过。
医生：抱歉沈小姐，你的诊断结果是胃癌晚期，我们已经尽力了。
△沈知初绝望的走出诊室，被疾步走来的护士撞了也麻木着不回头。
沈知初内心os：厉景深，我这次真的要...
【闪回结束】

7、什么是场序？
即场景次序，每一个拍摄场景都需要标明场序，一集里可能有一个场景，也有可能有两个，三个，由于短剧每集时间短，所以每集最多五个场景，要尽可能的减少场景转换，增加剧情流畅度。
格式：场x-x天气/场景地点
主要人物：xxx、xxx
例如第三集第二场，我们要在体育馆（室内）拍学生打球（肯定是白天打球），主要人物有张三，李四，王五，那么正确场序写法就是：
场3-2日/内体育场
主要人物：张三，李四，王五。

8、按照10秒一段进行分段。并标注出每个镜头的景别。

---

# 用户输入
【剧本原文】：
`,
  '油条_提取人物场景': `根据上面的故事信息，整理出如下信息：

## 1. 角色形象提示词

根据我发给你的这篇文，帮我整理出所有角色形象。

1.1 包含分析：按照风格、角色、氛围。

1.2 包含全身核心描述、头部特写、面部特写；需要包含人物性别、穿着、脸部特征、年龄，以及人物性格等。

1.3 根据提供的小说原文，推导出文中出现过的人物。人物可能有多种代称，要囊括文中提到的所有人物，包括"我"。每个人物包含：名字、代称（多个代称用逗号分割）、形象描述三个字段。人物形象必须包含具体年龄、性别、发色、发型、眼睛颜色、脸部特征、上身服装、下身服装；每个输出结果必须有不一样的着装，需要更好分辨。

1.4 不同场景下的同一角色分开给提示词。

## 2. 场景道具提示词

2.1 根据我发给你的这篇文，帮我整理出所有出现的场景以及道具，需要仔细描述场景细节、道具细节。

2.2 根据提供的小说原文，推导出文中出现过的场景。场景可能有多种代称，要囊括文中提到的所有主要场景。每个场景包含：场景名称、代称（多个代称用逗号分割）、详细描述三个字段。场景描述必须包含环境类型、时间、氛围、主要特征等，但是场景描述一定不能包含人名。

---

# 用户输入
【故事信息/小说原文】：
`,
  '油条_人物视图': `## 1. 单人图

生成单人/全身图/露出脚部/正面/站立图/直观呈现角色的整体身形、服饰搭配和标志性特征，背景为白色/全身图/最高品质细节丰富。将上传的角色作为参考。

## 2. 三视图

生成专业的角色三视图设定参考图。人物参考为XXX。服饰参考为XXX。图片最左边是人物头部正面视角特写，服装材质细节及配色色卡。右边是人物全身三视图（正面全身视角，侧面全身视角，背面全身视角）。

## 3. 细节图

生成人物高精度人物三视图设定板，纯白背景，角色 turnaround board，排版整齐，统一人物一致性。

左侧：同一角色正面、左侧面、背面全身站姿，平视棚拍光，无遮挡，适合建模参考。

右上：6 张不同角度头像（正面视角、头顶视角、后脑勺视角、右侧脸视角、3/4 正侧视角、3/4 侧脸视角），发缝五官清晰。

右下：6 张局部细节特写（上衣面料、下身、臀部剪裁、颈部皮肤、眼部五官、鞋子），细节真实。

整体风格：极简、专业、写实、高级，角色设定板质感，横版白底，无多余元素、文字、水印。

## 4. 过人脸

人物的衣服和发型都不改变，人脸替换成超写实彩色素描风格。
`,
  '油条_视频前缀': `1.视频统一前缀，
视频景别变化丰富，不同角度不同景别穿插合理流畅。镜头运动起来，讲究导演运镜思维，镜头视角包括但不限于（远景，全景，中景，近景，特写）（正视，侧视，府视，平视等...）人物情绪表现到位。完成以下表演和台词，视频中不能出现字幕！！！不要背景音乐！！！专业运镜，专业音效。
2.仿真人视频前缀，
动作:模拟肢体重量感，走路动作必须体现双脚落地的力度传导。服装(衣角)需随身体惯性自然摆动，拒绝僵硬和漂浮。电影级写实环境:场景必须包含体积光(Volumetriclight)、空气悬浮微粒和自然的胶片颗粒感(filmgrain)。拒绝干净无层次的背景。眼神:必须包含清晰的眼神光(catchlight)和自然的聚焦(focus)面部需带有微妙的情绪微表情，眼神灵动，拒绝空洞。皮肤:必须清晰可见毛孔、微细血管、自然红润肤色和微小皱纹。严禁出现任何塑料感或陶瓷般光滑肌。【1.肌肉分区精准控制】+【2.情绪三层叠加（主+副+动机）】＋（3.非面部生理联动】+【4.非对称性+瑕疵控制】＋（5.说话专属肌肉限制】
3.其他风格描述，
镜头舒缓丝滑，轻微缓慢推镜、轻微平移，无剧烈晃动，人物微动为主，发丝随风轻动、衣袂轻微翻飞、裙摆飘逸，打斗动作干净利落，镜头聚焦人物神态，氛围感运镜，沉浸式观影感。新国风短剧电影质感，4K超清，60帧丝滑动态，半厚涂细腻画风，浅景深虚化背景，柔焦朦胧氛围，雨夜冷调光影，体积光穿透雨雾，发丝轮廓发光，空气微粒子漂浮，雨丝动态真实，轻微胶片颗粒，色调高级低饱和，镜头缓慢丝滑，人物微动自然，极致氛围感，无网红脸，无过度磨皮，画面干净高级。古风写意打戏，动作轻盈利落，伞刃攻防干净流畅，雨珠飞溅动态真实，金铁交鸣光影细节，暗调肃杀氛围，动作轻柔不浮夸，唯美武侠感，张力十足。发丝发光 / 轮廓光：暖调轮廓光、逆光打亮发丝光束效果：穿透光束、体积光、阳光射线柔雾氛围：薄雾、空气粒子、微光、漫射柔光场景光影：琉璃彩光、烛光、窗边暖光、单侧戏剧光影整段视频风格核心（每一个镜头都必须遵守）:高质感古风女频短剧风格真人实景拍摄丰富的前景漫反射辅光超写实浅景深加长焦电影级质感使用SonyFX3拍摄85mmf1.4光圈全开，背景虚化，光晕与柔化:针对高光区域(如发丝边缘衣服反光处、步摇)添加一层淡淡的、偏暖红色的光晕，让高光“溢出”到暗部，消除数码的锐利感;边缘虚化/柔焦;1/2黑柔滤镜，物理级别的晕散，明显的眩光和漫射雾感;半透明纹理，哑光高级质感，动态柔光投影，布料质感通透细腻带细闪;现实主义，通透的暖调春日的柔化色调，背景朦胧暖调;不要全景镜头，聚焦于人物的美貌的近景中景特写。【光线布置】侧逆硬光光为王，极致逆光，打亮人物的头发边缘（发丝光）和侧脸轮廓，光线强度非常大，发丝和衣服边缘勾勒出了一圈极宽、极亮的金边，大光比侧光打法，强侧光/侧逆光硬光；面部补光，人物止面漫反射补光，提亮面部暗部，打出漂亮的眼神光，让眼神“拉丝”且灵动；烟雾机营造“神明光/体积光”让逆光在空气中形成可见的光束，增加空间深。`,};

export const INITIAL_PROMPT_PRESETS_BASE: Record<string, string> = {
  ...INITIAL_T2I_PROMPT_PRESETS,
  ...INITIAL_I2I_PROMPT_PRESETS,
  '剑来_分镜视频': `# Role: 顶级动画分镜导演 (Master Storyboard Artist)

## Profile
你是一位拥有20年经验的顶级动画分镜导演，擅长制作如《剑来》、《凡人修仙传》等高燃玄幻题材的影视分镜。你精通视听语言，对镜头节奏（Pacing）、构图（Composition）、光影氛围（Lighting & Mood）以及音效卡点（Sound Design）有着极致的掌控力。

## Goals
根据用户提供的剧本/小说片段，将其转化为一份**精确到秒**、**画面感极强**、**适合短视频制作（1-2分钟）**的分镜脚本。

## Constraints (核心规则)
1.  **快节奏剪辑：** 除非特殊说明，单个镜头的时长严格控制在 **2-4秒** 之间，通过频繁的景别切换来营造紧张感和打击感。
2.  **极度精细的画面描述：** 不要只写“宁姚在打架”，要写“宁姚白衣染血，发丝凌乱，虎口崩裂，挥剑时带起金色的残影，背景是昏暗的雷云”。
3.  **情绪与光影：** 必须标注每个镜头的色调 (如: 绝望的暗红、希望的青色) 和光影逻辑。
4.  **音画同步：** 台词和关键音效 (如剑鸣、雷声) 必须精确对应到具体的时间段。
5.  **输出格式：** 严格按照下方的【Output Format】进行输出。

## Workflow
1.  分析用户提供的故事内容，提取核心冲突和高潮点。
2.  规划整体节奏 (起-承-转-合)。
3.  拆解分镜，填充细节。
4.  输出分镜表。

## Output Format (严格执行)
| 时间 (Time) | 景别/运镜 (Shot/Camera) | 画面内容 (Visual Description) | 音效/台词 (Audio/Dialogue) | 氛围/特效 (Mood/VFX) |
| :--- | :--- | :--- | :--- | :--- |
| **\`00:00:00:03\`** | **[全景/俯冲]** <br> 镜头从高空极速下坠 (详细描述画面主体、背景、动作) | **音效:** (环境音/特效音) <br> **台词:** (角色名+情绪+内容) | (色调/光效/粒子效果) |

## Initialization
我是你的分镜导演。请发送你的剧本内容（如《剑来》片段），我将为你拆解为顶级的高燃分镜脚本。`,
};

/**
 * 全景图生成节点（panoramaT2i）专属预设 key 列表。
 * 顺序决定 UI 按钮的显示顺序。
 * 注意：保留 '全景图生成' 是为了兼容旧节点的 activePresets 持久化数据。
 */
export const PANORAMA_PRESET_KEYS: readonly string[] = [
  '全景图生成',
  '室外全景图',
  '室内全景图',
];

/**
 * 文本节点「词库」下拉选项 key 列表（与 promptPresets 中的 key 对应）。
 * 顺序决定 UI 按钮的显示顺序。
 * 选择后会把对应预设内容插入到文本节点 textarea 的光标位置。
 */
export const TEXT_WORD_LIBRARY_KEYS: readonly string[] = [
  '通用提示词',
  'gpt去碎细节',
  'NanoBanana2去碎细节',
  '黑白线稿图',
  '视觉色卡',
  '通用视频后缀',
  '视频后缀_特写_情绪戏',
  '视频后缀_中景/全景',
  '视频后缀_双人对手戏',
  '视频_情绪关键词',
  '视频_出真人九宗罪',
  '视频_动态关键词',
  '故事板分镜图_终极',
  '火_角色_故事板_视频提示词',
  '火_角色_故事板_视频（中文）',
  '油条_剧本优化',
  '油条_分镜提示词',
  '油条_提取人物场景',
  '油条_人物视图',
  '油条_视频前缀',
  '剑来_分镜视频',
  '主图机位图拆解',
  '主图多机位',
];
