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
  '场景反打及细节':
    '为我创建一张综合图。这张图将包含场景的正面图、反面图，以及几个关键道具的特写小图，同时严格保持参考图中的陈设、装饰、光线和布局风格。\n场景分析与生成策略：\n    正面场景图：将忠实地再现您提供的原始图片，确保所有细节、光线和氛围都一致。\n    反面场景图：这是最具挑战性的部分。我将根据原始图的风格和布局推断房间的另一侧。\n   假设原始图展示的是房间的一面，那么反面图将展示房间的另一面，可能包含入口、另一组家具或艺术品，但会保持整体的协调性。我会想象相机转过180度后看到的景象，\n    关键道具小图：我会从原始图片中提取并放大以下关键道具的特写：\n综合图布局：\n我将采用一个清晰的布局，将正面和反面场景图作为主要部分，并在下方或侧面区域展示关键道具的特写小图。',
  '故事九宫格':
    '请根据提供的图片内容及前面叙述的故事背景，创作一个由九个画面构成的写实风格九宫格故事3*3排列画幅16:9。每个画面精心设计以体现不同的景别和技术手法，包括但不限于特写、远景、俯拍、仰拍和运动镜头等，以此强化故事的紧张氛围和视觉表现力。具体要求如下：整体一致性：所有画面应保持与上传图片相同的写实风格；故事连贯性：九宫格中的每幅画都应当紧密围绕一个完整的故事线展开，确保故事逻辑清晰且连贯；景别多样性：至少包含一个特写镜头，用于捕捉角色的表情或关键物品的细节；加入至少一个远景镜头，展示环境全貌或大规模的动作场景；运用俯拍或仰拍来增强特定场景的情感表达或戏剧效果；考虑使用运动镜头（如跟随角色移动）以增加动态感和紧张气氛；视觉与情感深度：利用光影对比、色彩调配以及构图技巧来加强故事的情感层次和视觉吸引力。请务必让每一张图像都能够独立讲述一部分故事，同时作为整个九宫格的一部分共同编织出一个引人入胜的整体叙事。按照要求生成图片。',
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
  道具转超写实: '识别图片中的物体，quixel资产库效果，灰色背景。',
  道具转白模: '将图片转成传统3D游戏影视流程中的白模效果图，灰色背景。',
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
    '16:9横屏，专业摄影，高清8K，电影级质感，写实风格，自然光影',
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
};

export const INITIAL_PROMPT_PRESETS_BASE: Record<string, string> = {
  ...INITIAL_T2I_PROMPT_PRESETS,
  ...INITIAL_I2I_PROMPT_PRESETS,
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
