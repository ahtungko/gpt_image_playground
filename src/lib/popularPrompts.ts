import type { Locale } from './i18n'

export type PopularPrompt = {
  id: string
  title: string
  prompt: string
}

export const POPULAR_PROMPTS: Record<Locale, PopularPrompt[]> = {
  en: [
    {
      id: 'hairstyle-analysis-guide',
      title: 'Hairstyle analysis guide',
      prompt: `Please create a high-quality "Hairstyle Analysis Guide" infographic based on the portrait photo I uploaded. The overall style should be clean and fashionable, resembling a beauty magazine column. Use the original facial features as a base, maintaining a realistic likeness and recognizability without excessive retouching. The layout should prioritize visual design, focusing on imagery with concise text and no long paragraphs.

Hairstyle Analysis:
Please create a premium personal hairstyle analysis card based on the uploaded portrait. Retain the subject's original features, face shape, and authentic characteristics. Use a side-by-side or split-screen comparison to demonstrate the effects of different hairstyles on the subject.

Requirements:
• Clear Distinction: Clearly categorize styles as "Best Match," "Neutral," and "Not Recommended" so it's immediately obvious which styles best flatter the face shape and enhance the subject's temperament and overall look.
• Comparisons: Compare various options such as long hair, short hair, bangs/fringe, curly vs. straight, layered cuts, and updo styles.
• Visual Style: The layout must be clean and modern, like a professional styling consultant's report.
• Text Minimalist: Focus on visual presentation; use only short labels and avoid long blocks of text.
• Output: High-resolution, clear information, and optimized for social media sharing.`,
    },
    {
      id: 'cyberpunk-portrait',
      title: 'Cyberpunk portrait',
      prompt:
        'Cinematic cyberpunk portrait of a stylish young woman under neon rain, reflective wet streets, dramatic rim lighting, ultra-detailed face, shallow depth of field, high contrast, vibrant magenta and cyan color palette.',
    },
    {
      id: 'cozy-cafe',
      title: 'Cozy cafe scene',
      prompt:
        'A cozy cafe by the window on a rainy afternoon, warm ambient light, steaming coffee, books and pastries on a wooden table, soft cinematic atmosphere, realistic photography, rich texture details.',
    },
    {
      id: 'product-shot',
      title: 'Luxury product shot',
      prompt:
        'Premium product photography of a minimalist skincare bottle on a marble pedestal, soft studio lighting, clean beige background, subtle water droplets, luxury commercial style, sharp focus, elegant composition.',
    },
    {
      id: 'fantasy-village',
      title: 'Fantasy village',
      prompt:
        'A whimsical fantasy village on a hillside, glowing lanterns, cobblestone streets, tiny shops, lush plants, painterly style, golden hour sunlight, highly detailed environment concept art.',
    },
    {
      id: 'watercolor-botanical',
      title: 'Watercolor botanical',
      prompt:
        'Delicate watercolor illustration of blooming flowers and green leaves, soft pastel tones, clean white background, elegant hand-painted texture, airy composition, botanical art print style.',
    },
    {
      id: 'cute-mascot',
      title: 'Cute 3D mascot',
      prompt:
        'Adorable 3D mascot character, round proportions, glossy materials, soft studio lighting, playful pose, pastel colors, highly polished cartoon render, transparent-background friendly composition.',
    },
  ],
  zh: [
    {
      id: 'hairstyle-analysis-guide-zh',
      title: '发型分析指南',
      prompt: `根据我上传的人像照片，制作一张高质感「发型分析指南」资讯图表，整体为中文版本，风格干净时尚、像美妆杂志专栏。以原人物五官为基础，保留真实长相与辨识度，不过度修图。版面采视觉优先设计，重点用图像呈现，文字精简，不要长段落。

发型分析：
请根据我上传的人像照片，制作一张高质感个人发型分析图卡。保留主角原本五官、脸型与真实特征，透过左右或并排对比方式，展示不同发型套用在主角身上的效果，清楚区分「最适合」、「普通」与「不建议」发型，让人一眼看出哪些发型最修饰脸型、提升气质与整体颜值。可比较长发、短发、浏海、卷发、直发、层次剪裁、绑发造型等。版面设计需干净时尚、像专业造型顾问报告，整体以视觉呈现为主，只使用简短标签，不要加入长段文字。高解析度，资讯清楚，适合社群分享。`,
    },
    {
      id: 'cyberpunk-portrait-zh',
      title: '赛博朋克人像',
      prompt:
        '电影感赛博朋克人像，年轻女性站在霓虹雨夜街头，地面反光，边缘光明显，面部细节精致，浅景深，高对比，洋红与青蓝色调，氛围感强。',
    },
    {
      id: 'cozy-cafe-zh',
      title: '温馨咖啡馆',
      prompt:
        '下雨天窗边的温馨咖啡馆场景，暖色环境光，冒着热气的咖啡，木桌上的书本与甜点，电影感构图，真实摄影风格，细节丰富。',
    },
    {
      id: 'product-shot-zh',
      title: '高级产品图',
      prompt:
        '极简高级护肤品产品摄影，一只精致瓶身摆放在大理石底座上，柔和棚拍光线，干净米色背景，细小水珠点缀，商业广告风格，画面简洁高级。',
    },
    {
      id: 'guofeng-landscape',
      title: '国风山水',
      prompt:
        '中国风山水画，远山云雾，古亭与松树，小桥流水，墨色与淡彩结合，留白充足，意境悠远，精致插画风格。',
    },
    {
      id: 'healing-illustration',
      title: '治愈系插画',
      prompt:
        '治愈系插画风格，一只小猫蜷缩在柔软毛毯上，阳光透过窗帘洒进房间，色彩温暖柔和，画面干净，细节可爱。',
    },
    {
      id: 'cute-mascot-zh',
      title: 'Q版吉祥物',
      prompt:
        '可爱的Q版3D吉祥物角色，圆润比例，糖果色配色，柔和棚拍光线，表情生动，渲染精致，适合作为贴纸或头像。',
    },
  ],
}
