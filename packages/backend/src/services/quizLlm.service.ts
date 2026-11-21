import { z } from 'zod';
import { env } from '../config/env.js';

export interface GeneratedQuizQuestion {
  questionText: string;
  options: [string, string, string];
  correctIndex: 0 | 1 | 2;
}

const quizResponseSchema = z.object({
  questions: z
    .array(
      z.object({
        questionText: z.string().min(4).max(200),
        options: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
        correctIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      })
    )
    .length(5),
});

/**
 * Generates 5 simple 3-choice comprehension questions from a post's title & content
 * using Gemini 2.5 Flash (via OpenAI-compatible JSON endpoint), with a deterministic
 * fallback when LLM_API_KEY is not configured in local dev/test.
 */
export async function generateQuizQuestionsFromContent(params: {
  title: string;
  content: string;
  platform: string;
}): Promise<GeneratedQuizQuestion[]> {
  const cleanTitle = params.title.trim().slice(0, 120) || 'POP 果实 精选内容';
  const cleanContent = params.content.trim().slice(0, 3000);

  if (env.LLM_API_KEY) {
    try {
      const response = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.LLM_MODEL,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a quiz generator for POP 果实. Generate exactly 5 concise multiple-choice comprehension questions based strictly on the provided social post. Each question must have 3 short options and a correctIndex (0, 1, or 2). Return ONLY JSON matching {"questions":[{"questionText":"...","options":["A","B","C"],"correctIndex":0}]}. Use the same language as the post.',
            },
            {
              role: 'user',
              content: `Platform: ${params.platform}\nTitle: ${cleanTitle}\nContent:\n${cleanContent}`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const raw = data.choices?.[0]?.message?.content;
        if (raw) {
          const parsed = quizResponseSchema.safeParse(JSON.parse(raw));
          if (parsed.success) {
            return parsed.data.questions;
          }
        }
      }
    } catch {
      // Fall through to deterministic fallback so activation never deadlocks on transient LLM outages
    }
  }

  return buildFallbackQuestions(cleanTitle, cleanContent, params.platform);
}

function buildFallbackQuestions(
  title: string,
  content: string,
  platform: string
): GeneratedQuizQuestion[] {
  const snippet = content.replace(/\s+/g, ' ').slice(0, 36) || title.slice(0, 36);
  const platformLabel = platform === 'BINANCE_SQUARE' ? '币安广场' : 'X (Twitter)';

  return [
    {
      questionText: '这篇分享的帖子发布在哪个平台？',
      options: [platformLabel, 'Reddit 论坛', 'Discord 公告'],
      correctIndex: 0,
    },
    {
      questionText: '以下哪一项最贴近该帖子的核心主题？',
      options: [title.slice(0, 40), '传统农产品期货交割规则', '极端天气气象预报'],
      correctIndex: 0,
    },
    {
      questionText: '帖子正文中提到的关键内容片段包含以下哪项？',
      options: ['航空里程积分兑换指南', snippet, '古典音乐乐理入门'],
      correctIndex: 1,
    },
    {
      questionText: '在 POP 果实 协议中，读者答对本题后会获得什么？',
      options: ['仅获得积分无代币', '实时入账 $POP 链下余额', '必须先锁仓 1 年'],
      correctIndex: 1,
    },
    {
      questionText: '本帖对应的 POP 果实属于哪种社交内容激励？',
      options: ['持有者和读者分别解锁 POP', '单向广告付费点击', '链上 NFT 铸造空投'],
      correctIndex: 0,
    },
  ];
}
