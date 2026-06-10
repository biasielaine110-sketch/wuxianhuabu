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

/**
 * 文本节点「词库」下拉选项 key 列表（与 promptPresets 中的 key 对应）。
 * 顺序决定 UI 按钮的显示顺序。
 * 选择后会把对应预设内容插入到文本节点 textarea 的光标位置。
 */
export const TEXT_WORD_LIBRARY_KEYS: readonly string[] = [
  '通用提示词',
  'gpt去碎细节',
  'NanoBanana2去碎细节',
  '通用视频后缀',
  '视频后缀_特写_情绪戏',
  '视频后缀_中景/全景',
  '视频后缀_双人对手戏',
  '视频_情绪关键词',
  '视频_出真人九宗罪',
  '视频_动态关键词',
  '故事板分镜图_终极',
];
